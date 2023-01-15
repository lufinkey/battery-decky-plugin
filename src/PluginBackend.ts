import { ServerAPI } from "decky-frontend-lib";

export type BatteryStateLog = {
	device_path: string
	time: Date
	state: string
	energy_Wh: number
	energy_empty_Wh: number
	energy_full_Wh: number
	energy_full_design_Wh: number
	energy_rate_W: number
	voltage_V: number
	seconds_till_full: number
	percent_current: number
	percent_capacity: number
};

export type SystemEventLog = {
	time: Date
	event: string
};


type TimeRangeArgs = {
	timeStart?: string | Date,
	timeStartIncl?: boolean,
	timeEnd?: string | Date,
	timeEndIncl?: boolean
};

type TimeGroupArgs = {
	groupByIntervalStart?: string | Date
	groupByInterval?: number
	preferGroupFirst?: boolean
};

type BackendTimeGroupArgs = {
	group_by_interval_start?: string
	group_by_interval?: number
	prefer_group_first?: boolean
};

type BackendTimeRangeArgs = {
	time_start?: string,
	time_start_incl?: boolean,
	time_end?: string,
	time_end_incl?: boolean
};

function convertTimeRangeArgs(args: TimeRangeArgs, backendArgs: BackendTimeRangeArgs = {}): BackendTimeRangeArgs {
	if(args.timeStart) {
		backendArgs.time_start = (args.timeStart instanceof Date) ?
			args.timeStart.toISOString()
			: args.timeStart;
	}
	if(args.timeStartIncl != null) {
		backendArgs.time_start_incl = args.timeStartIncl;
	}
	if(args.timeEnd) {
		backendArgs.time_end = (args.timeEnd instanceof Date) ?
			args.timeEnd.toISOString()
			: args.timeEnd;
	}
	if(args.timeEndIncl != null) {
		backendArgs.time_end_incl = args.timeEndIncl;
	}
	return backendArgs;
}

function convertTimeGroupArgs(args: TimeGroupArgs, backendArgs: BackendTimeGroupArgs = {}): BackendTimeGroupArgs {
	if(args.groupByInterval != null) {
		backendArgs.group_by_interval = args.groupByInterval;
	}
	if(args.groupByIntervalStart) {
		backendArgs.group_by_interval_start = (args.groupByIntervalStart instanceof Date) ?
			args.groupByIntervalStart.toISOString()
			: args.groupByIntervalStart;
	}
	if(args.preferGroupFirst != null) {
		backendArgs.prefer_group_first = args.preferGroupFirst;
	}
	return backendArgs;
}



export class PluginBackend {
	api: ServerAPI

	constructor(serverAPI: ServerAPI) {
		this.api = serverAPI;
	}

	async callPluginMethod<TRes = {}, TArgs = {}>(method: string, args: TArgs): Promise<TRes> {
		const res = await this.api.callPluginMethod<TArgs,TRes>(method, args);
		if(!res.success) {
			console.log(res)
			if(res.result) {
				throw new Error(res.result);
			}
			throw new Error(`Method ${method} failed`);
		}
		return res.result;
	}

	async getBatteryStateLogs(args: TimeRangeArgs & TimeGroupArgs): Promise<BatteryStateLog[]> {
		let backendArgs: BackendTimeRangeArgs & BackendTimeGroupArgs = {};
		backendArgs = convertTimeRangeArgs(args, backendArgs);
		backendArgs = convertTimeGroupArgs(args, backendArgs);
		const logs = await this.callPluginMethod<BatteryStateLog[]>("get_battery_state_logs", backendArgs);
		for(const log of logs) {
			if(typeof log.time == 'string') {
				log.time = new Date(log.time);
			}
		}
		return logs;
	}

	async getSystemEventLogs(args: TimeRangeArgs): Promise<SystemEventLog[]> {
		let backendArgs: BackendTimeRangeArgs = {};
		backendArgs = convertTimeRangeArgs(args, backendArgs);
		const logs = await this.callPluginMethod<SystemEventLog[]>("get_system_event_logs", backendArgs);
		for(const log of logs) {
			if(typeof log.time == 'string') {
				log.time = new Date(log.time);
			}
		}
		return logs;
	}
}
