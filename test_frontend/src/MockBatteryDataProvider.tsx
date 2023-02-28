
import { TimeRangeArgs, TimeGroupArgs, BatteryState, BatteryStateLog, SystemEventLog } from './battery-analytics/PluginBackend';
import { BatteryGraphDataProvider } from './battery-analytics/BatteryGraph';


const randomBatteryState = (): BatteryState => {
	const randVal = Math.random();
	if(randVal >= 0.5) {
		return 'discharging';
	} else {
		return 'charging';
	}
};

const EnergyRateCharging = 0.7392;
const EnergyRateDischarging = 3.5959;
const ChargingRatePercentPerMinute = 0.5;
const DischargingRatePercentPerMinute = 0.5;
const VoltageFull = 9;
const TotalBatteryLifeSeconds = 4 * 60 * 60;
const DefaultPointsPerTimeSpan = 28;

const calculateSecondsTillFull = (percentage: number): number => {
	return TotalBatteryLifeSeconds * ((100 - percentage) / 100);
};

const calculateSecondsTillEmpty = (percentage: number): number => {
	return TotalBatteryLifeSeconds * ((100 - percentage) / 100);
};

const randomChargeRatePercentPerMinute = (): number => {
	return ChargingRatePercentPerMinute + (Math.random() * 0.5);
};

const randomDischargeRatePercentPerMinute = (): number => {
	return DischargingRatePercentPerMinute + (Math.random() * 0.5);
};

const randomBatteryStateLog = (time: number): BatteryStateLog => {
	const randomPercent = Math.random() * 100.0;
	const state = randomBatteryState();
	return getBatteryStateLogAtPercent(time, state, randomPercent);
};

const getBatteryStateLogAtPercent = (time: number, state: BatteryState, percent: number): BatteryStateLog => {
	const energyFullDesign = 40.04;
	const energy = energyFullDesign * percent;
	const voltage = VoltageFull * (percent / 100.0);
	const energyRate = state == 'charging' ? EnergyRateCharging : EnergyRateDischarging;
	return {
		device_path: "/org/freedesktop/UPower/devices/battery_BAT1",
		time: new Date(time),
		state: state,
		energy_Wh: energy,
		energy_empty_Wh: 0,
		energy_full_Wh: 42.1113,
		energy_full_design_Wh: energyFullDesign,
		energy_rate_W: energyRate,
		voltage_V: voltage,
		seconds_till_full: state == 'charging' ? calculateSecondsTillFull(percent) : null,
		seconds_till_empty: state == 'discharging' ? calculateSecondsTillEmpty(percent) : null,
		percent_current: percent,
		percent_capacity: 100
	};
};

const calculateMockTimeRange = (rangeArgs: TimeRangeArgs, groupArgs?: TimeGroupArgs): [Date,Date] => {
	let timeStart: Date | undefined = undefined;
	if(rangeArgs.timeStart != null) {
		if(rangeArgs.timeStart instanceof Date) {
			timeStart = rangeArgs.timeStart;
		} else {
			timeStart = new Date(rangeArgs.timeStart);
		}
	}
	let timeEnd: Date | undefined = undefined;
	if(rangeArgs.timeEnd != null) {
		if(rangeArgs.timeEnd instanceof Date) {
			timeEnd = rangeArgs.timeEnd;
		} else {
			timeEnd = new Date(rangeArgs.timeEnd);
		}
	}
	if(timeStart == null || timeEnd == null) {
		// determine time distance to use
		let timeDistance: number | undefined = undefined;
		if(groupArgs != null && groupArgs.groupByInterval != null) {
			timeDistance = (groupArgs.groupByInterval * 1000) * DefaultPointsPerTimeSpan;
		} else {
			timeDistance = 3600000;
		}
		// calculate start/end time
		if(timeStart == null) {
			if(timeEnd != null) {
				timeStart = new Date(timeEnd.getTime() - timeDistance);
			} else {
				timeStart = new Date(new Date().getTime() - timeDistance);
			}
		}
		if(timeEnd == null) {
			timeEnd = new Date(timeStart.getTime() + timeDistance);
		}
	}
	return [timeStart,timeEnd];
}


export const MockBatteryDataProvider: BatteryGraphDataProvider = {
	getBatteryStateLogs: async (args: TimeRangeArgs & TimeGroupArgs): Promise<BatteryStateLog[]> => {
		const [dateTimeStart, dateTimeEnd] = calculateMockTimeRange(args, args);
		const timeStart = dateTimeStart.getTime();
		const timeEnd = dateTimeEnd.getTime();
		let timeSpacing = args.groupByInterval;
		if(timeSpacing == null) {
			timeSpacing = (timeEnd - timeStart) / DefaultPointsPerTimeSpan;
		}
		let batteryLogs: BatteryStateLog[] = [];
		let firstLog = randomBatteryStateLog(timeStart);
		batteryLogs.push(firstLog);
		let state = firstLog.state;
		let percent = firstLog.percent_current;
		for(let t=(timeStart+timeSpacing); t<=timeEnd; t+=timeSpacing) {
			if(state == 'discharging' && percent <= 1.0) {
				state = 'charging';
			} else if(state == 'charging' && percent >= 100.0) {
				state = 'fully-charged';
			}
			switch(state) {
				case 'charging':
					percent += (randomChargeRatePercentPerMinute() * (timeSpacing / 60000.0));
					if(percent >= 100) {
						percent = 100;
					}
					break;
				
				case 'discharging':
					percent -= (randomDischargeRatePercentPerMinute() * (timeSpacing / 60000.0));
					if(percent <= 0) {
						percent = 0;
					}
					break;
			}
			const log = getBatteryStateLogAtPercent(t, state, percent);
			batteryLogs.push(log);
		}
		console.log("lastLogTime = "+batteryLogs[batteryLogs.length-1].time);
		return batteryLogs;
	},



	getSystemEventLogs: async (args: TimeRangeArgs): Promise<SystemEventLog[]> => {
		return [];
	}
};
