import { PureComponent, CSSProperties } from 'react';
import { Graph, LineData, AxisLineData } from './Graph';
import { PluginBackend, BatteryStateLog, SystemEventLog, TimeRangeArgs, TimeGroupArgs } from './PluginBackend';

type Props = {
	backendAPI: PluginBackend
	width: number
	height: number
	style?: CSSProperties
};


type TimeRange = 'week' | 'day' | '12hours' | '6hours' | 'hour';

type LogEntry = {
	type: 'battery' | 'system-event'
	data: BatteryStateLog | SystemEventLog
};

type LogEntries = {
	entries: LogEntry[]
	percentPointGroups: Array<[number,number][]>
	energyPointGroups: Array<[number,number][]>
	energyRatePointGroups: Array<[number,number][]>
	energyFull?: number
	energyFullDesign?: number
	systemEvents: SystemEventLog[]
	systemEventPoints: number[]
	lastUpdated: Date
};

type State = {
	logEntriesMap: {[key in TimeRange]?: LogEntries}
	timeRange: TimeRange
};

export class BatteryGraph extends PureComponent<Props,State> {
	mounted: boolean

	constructor(props: Props) {
		super(props);
		this.state = {
			logEntriesMap: {},
			timeRange: 'hour'
		};
		this.mounted = false;
	}

	componentDidMount(): void {
		this.mounted = true;
		this.refreshBatteryData(this.state.timeRange).catch((error) => {
			console.error(error);
		});
	}

	componentWillUnmount(): void {
		this.mounted = false;
	}
	
	static _getArgsForTimeRange(now: Date, range: TimeRange, includeGroupArgs: boolean): TimeRangeArgs & TimeGroupArgs {
		let args: TimeRangeArgs & TimeGroupArgs;
		switch(range) {
			case 'week':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 24 * 7)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 60 * 6);
				}
				break;

			case 'day':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 24)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 30);
				}
				break;

			case '12hours':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 12)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 15);
				}
				break;

			case '6hours':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 6)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 7.5);
				}
				break;
			
			case 'hour':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = 60;
				}
				break;
			
			default:
				throw new Error("Invalid time range "+range);
		}
		return args;
	}

	* orderLogs(batteryLogs: BatteryStateLog[], systemEventLogs: SystemEventLog[]): Generator<LogEntry,void,void> {
		batteryLogs = batteryLogs.slice(0);
		systemEventLogs = systemEventLogs.slice(0);
		while(batteryLogs.length > 0 || systemEventLogs.length > 0) {
			const batteryLog = batteryLogs.length > 0 ? batteryLogs[0] : undefined;
			const sysEventLog = systemEventLogs.length > 0 ? systemEventLogs[0] : undefined;
			if(batteryLog == null) {
				if(sysEventLog == null) {
					console.error("What happened here");
					break;
				}
				yield {
					type: 'system-event',
					data: sysEventLog
				};
				systemEventLogs.splice(0, 1);
			} else {
				if(sysEventLog != null && sysEventLog.time < batteryLog.time) {
					yield {
						type: 'system-event',
						data: sysEventLog
					};
					systemEventLogs.splice(0, 1);
				} else {
					yield {
						type: 'battery',
						data: batteryLog
					};
					batteryLogs.splice(0, 1);
				}
			}
		}
	}

	async refreshBatteryData(timeRange: TimeRange) {
		const {now, batteryLogs, systemEventLogs} = await this.fetchBatteryData(timeRange);
		if(!this.mounted) {
			return;
		}
		this.updateBatteryData(now, timeRange, batteryLogs, systemEventLogs);
	}

	async fetchBatteryData(timeRange: TimeRange): Promise<{now: Date, batteryLogs: BatteryStateLog[], systemEventLogs: SystemEventLog[]}> {
		const { backendAPI } = this.props;
		const now = new Date();
		const batStateArgs = BatteryGraph._getArgsForTimeRange(now, timeRange, true);
		const sysEvtArgs = BatteryGraph._getArgsForTimeRange(now, timeRange, false);
		const [batteryLogs,systemEventLogs] = await Promise.all([
			backendAPI.getBatteryStateLogs(batStateArgs),
			backendAPI.getSystemEventLogs(sysEvtArgs)
		]);
		return {now, batteryLogs, systemEventLogs};
	}

	updateBatteryData(now: Date, timeRange: TimeRange, batteryLogs: BatteryStateLog[], systemEventLogs: SystemEventLog[]) {
		const logEntries: LogEntries = {
			entries: [],
			percentPointGroups: [],
			energyPointGroups: [],
			energyRatePointGroups: [],
			systemEvents: systemEventLogs,
			systemEventPoints: [],
			lastUpdated: now,
		};
		let percentGroup: [number,number][] = [];
		let energyGroup: [number,number][] = [];
		let energyRateGroup: [number,number][] = [];
		const finishOpenGroups = () => {
			if(percentGroup.length > 0) {
				logEntries.percentPointGroups.push(percentGroup);
				percentGroup = [];
			}
			if(energyGroup.length > 0) {
				logEntries.energyPointGroups.push(energyGroup);
				energyGroup = [];
			}
			if(energyRateGroup.length > 0) {
				logEntries.energyRatePointGroups.push(energyRateGroup);
				energyRateGroup = [];
			}
		};
		for(const logEntry of this.orderLogs(batteryLogs, systemEventLogs)) {
			const logtimeSeconds = (logEntry.data.time.getTime() / 1000.0);
			switch(logEntry.type) {
				case 'battery': {
					const log: BatteryStateLog = logEntry.data as BatteryStateLog;
					// update energy-full variable
					if(logEntries.energyFull == null) {
						logEntries.energyFull = log.energy_full_Wh;
					} else if(logEntries.energyFull != log.energy_full_Wh) {
						console.warn("multiple values for energy-full in battery logs");
						if(logEntries.energyFull < log.energy_full_Wh) {
							logEntries.energyFull = log.energy_full_Wh;
						}
					}
					// update energy-full-design variable
					if(logEntries.energyFullDesign == null) {
						logEntries.energyFullDesign = log.energy_full_design_Wh;
					} else if(logEntries.energyFullDesign != log.energy_full_design_Wh) {
						console.warn("multiple values for energy-full-design in battery logs");
						if(logEntries.energyFullDesign < log.energy_full_design_Wh) {
							logEntries.energyFullDesign = log.energy_full_design_Wh;
						}
					}
					// add data entries
					percentGroup.push([
						logtimeSeconds,
						log.percent_current
					]);
					energyGroup.push([
						logtimeSeconds,
						log.energy_Wh
					]);
					energyRateGroup.push([
						logtimeSeconds,
						log.energy_rate_W
					]);
				} break;
					
				case 'system-event': {
					const log: SystemEventLog = logEntry.data as SystemEventLog;
					if (log.event == 'suspend' || log.event == 'resume') {
						finishOpenGroups();
					}
					logEntries.systemEvents.push(log);
					logEntries.systemEventPoints.push(logtimeSeconds);
				} break;
			}
		}
		finishOpenGroups();
		const logEntriesMap = {...this.state.logEntriesMap};
		logEntriesMap[timeRange] = logEntries;
		this.setState({
			logEntriesMap
		});
	}
	
	render() {
		let { width, height } = this.props;
		const { logEntriesMap, timeRange } = this.state;
		const logEntries = logEntriesMap[timeRange];
		const lines: LineData[] = [];
		//const axisLines: AxisLineData[] = [];
		if(logEntries) {
			lines.push({
				displayName: "Percent",
				pointGroups: logEntries.percentPointGroups,
				lineWidth: 2,
				strokeStyle: 'lightblue',
				fill: true,
				
				dotRadius: 5,
				dotsFillStyle: 'lightblue',
				
				showLabels: true,
				labelTextAlign: 'center',
				labelFillStyle: 'white',
				labelOffsetY: -8,
				getLabelText: ({ index, x: timeSeconds, y: percent }) => `${percent}%`
			});
			/*axisLines.push({
				axis: 'x',
				points: logEntries.systemEventPoints,
				strokeStyle: 'gray',
				lineWidth: 1,
				lineInsetMax: (height * 0.2),

				showLabels: true,
				getLabelText: ({ index, val }) => logEntries.systemEvents[index].event
			});*/
		}
		return (
			<Graph
				lines={lines}
				//axisLines={axisLines}
				width={width}
				height={height}
				style={this.props.style}
				paddingLeft={20}
				paddingRight={20}
				gridSpacingX={1}
				gridSpacingY={1}/>
		);
	}
}
