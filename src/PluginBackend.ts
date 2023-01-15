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

export class PluginBackend {
    constructor(serverAPI: ServerAPI) {
        
    }
}
