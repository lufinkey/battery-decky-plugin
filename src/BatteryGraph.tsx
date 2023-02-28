import { PureComponent, CSSProperties } from 'react';
import { Graph, LineProps, AxisLineProps, AxisLabelsProps } from './Graph';
import { BatteryStateLog, SystemEventLog, TimeRangeArgs, TimeGroupArgs } from './PluginBackend';

const DaysOfTheWeek = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export type BatteryGraphDataProvider = {
	getBatteryStateLogs: (args: TimeRangeArgs & TimeGroupArgs) => Promise<BatteryStateLog[]>
	getSystemEventLogs: (args: TimeRangeArgs) => Promise<SystemEventLog[]>
};

export type Props = {
	dataProvider: BatteryGraphDataProvider
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
	timeStart: Date,
	timeEnd: Date,
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

	static dateStringForTimeRange(date: Date, range: TimeRange) {
		const timeString = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
		switch(range) {
			case 'day':
			case 'week':
				return `${DaysOfTheWeek[date.getDay()]} ${timeString}`;
			
			case '12hours':
			case '6hours':
			case 'hour':
				return timeString;

			default:
				console.error("Invalid time range "+range);
				return date.toString();
		}
	}

	static _getGridSpacingForTimeRange(range: TimeRange) {
		switch(range) {
			case 'week':
				return 60 * 60 * 24;
			
			case 'day':
				return 60 * 60;

			case '12hours':
				return 60 * 60;

			case '6hours':
				return 60 * 60;

			case 'hour':
				return 60 * 10;

			default:
				throw new Error("Invalid time range "+range);
		}
	}
	
	static _getArgsForTimeRange(now: Date, range: TimeRange, includeGroupArgs: boolean): TimeRangeArgs & TimeGroupArgs & {timeStart: Date} {
		let args: TimeRangeArgs & TimeGroupArgs & {timeStart: Date};
		switch(range) {
			case 'week':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 24 * 7 * 1000)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 60 * 6);
				}
				break;

			case 'day':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 24 * 1000)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 30);
				}
				break;

			case '12hours':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 12 * 1000)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 15);
				}
				break;

			case '6hours':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 6 * 1000)),
					timeStartIncl: true
				};
				if(includeGroupArgs) {
					args.groupByIntervalStart = args.timeStart;
					args.groupByInterval = (60 * 7.5);
				}
				break;
			
			case 'hour':
				args = {
					timeStart: new Date(now.getTime() - (60 * 60 * 1000)),
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
		const {timeStart, now, batteryStateLogs, systemEventLogs} = await this.fetchBatteryData(timeRange);
		if(!this.mounted) {
			return;
		}
		this.updateBatteryData(now, timeRange, timeStart, now, batteryStateLogs, systemEventLogs);
	}

	async fetchBatteryData(timeRange: TimeRange): Promise<{
		timeStart: Date,
		now: Date,
		batteryStateLogs: BatteryStateLog[],
		batteryStateArgs: TimeRangeArgs & TimeGroupArgs,
		systemEventLogs: SystemEventLog[],
		systemEventArgs: TimeRangeArgs}> {
		const { dataProvider } = this.props;
		const now = new Date();
		const batteryStateArgs = BatteryGraph._getArgsForTimeRange(now, timeRange, true);
		const systemEventArgs = BatteryGraph._getArgsForTimeRange(now, timeRange, false);
		const timeStart: Date = batteryStateArgs.timeStart;
		const [batteryStateLogs,systemEventLogs] = await Promise.all([
			dataProvider.getBatteryStateLogs(batteryStateArgs),
			dataProvider.getSystemEventLogs(systemEventArgs)
		]);
		return {timeStart, now, batteryStateLogs, batteryStateArgs, systemEventLogs, systemEventArgs};
	}

	updateBatteryData(updatedAt: Date, timeRange: TimeRange, timeStart: Date, timeEnd: Date, batteryLogs: BatteryStateLog[], systemEventLogs: SystemEventLog[]) {
		const logEntries: LogEntries = {
			entries: [],
			timeStart,
			timeEnd,
			percentPointGroups: [],
			energyPointGroups: [],
			energyRatePointGroups: [],
			systemEvents: systemEventLogs,
			systemEventPoints: [],
			lastUpdated: updatedAt,
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
		const logGen = this.orderLogs(batteryLogs, systemEventLogs);
		let logEntryNode = logGen.next();
		while(!logEntryNode.done) {
			const logEntry = logEntryNode.value;
			if(logEntry != null) {
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
			logEntryNode = logGen.next();
		}
		finishOpenGroups();
		const logEntriesMap = {...this.state.logEntriesMap};
		logEntriesMap[timeRange] = logEntries;
		this.setState({
			logEntriesMap
		});
	}
	
	render() {
		const props = this.props;
		let { width, height } = props;
		const { logEntriesMap, timeRange } = this.state;
		const logEntries = logEntriesMap[timeRange];
		const lines: LineProps[] = [];
		const axisLines: AxisLineProps[] = [];
		let bottomAxisLabels: AxisLabelsProps | null = null;
		let xMin: number | undefined = undefined;
		let xMax: number | undefined = undefined;
		if(logEntries) {
			const timeStart = logEntries.timeStart;
			const timeEnd = logEntries.timeEnd;
			xMin = timeStart.getTime() / 1000.0;
			xMax = timeEnd.getTime() / 1000.0;
			lines.push({
				displayName: "Percent",
				pointGroups: logEntries.percentPointGroups,
				lineWidth: 2,
				strokeStyle: 'lightblue',
				fill: true,
				
				dotRadius: 2,
				dotsFillStyle: 'lightblue',
				
				showLabels: false,
				labelTextAlign: 'center',
				labelFillStyle: 'white',
				labelOffsetY: -8,
				getLabelText: ({ index, val: [timeSeconds, percent] }) => `${percent.toFixed(2)}%`
			});
			axisLines.push({
				axis: 'x',
				points: logEntries.systemEventPoints,
				strokeStyle: 'gray',
				lineWidth: 1,
				lineInsetMax: (height * 0.2),
				
				showLabels: true,
				getLabelText: ({ index, val }) => logEntries.systemEvents[index].event
			});
			bottomAxisLabels = {
				labels: [
					[xMin, BatteryGraph.dateStringForTimeRange(timeStart, timeRange)],
					[xMax, BatteryGraph.dateStringForTimeRange(timeEnd, timeRange)]
				],
				padding: 4,
				labelFillStyle: 'white',
				innerAlignEdgeLabels: true
			};
		}
		
		return (
			<Graph
				lines={lines}
				axisLines={axisLines}
				rightAxisLabels={{
					labels: [
						[0,'0%'],
						[100, '100%']
					],
					padding: 4,
					labelFillStyle: 'white',
					innerAlignEdgeLabels: true
				}}
				bottomAxisLabels={bottomAxisLabels}
				xMin={xMin}
				xMax={xMax}
				yMin={0}
				yMax={100}
				width={width}
				height={height}
				paddingTop={10}
				gridSpacingX={BatteryGraph._getGridSpacingForTimeRange(timeRange)}
				gridSpacingY={10}
				borderStrokeStyle={'lightgray'}
				canvasSmoothingEnabled={false}
				style={props.style}/>
		);
	}
}
