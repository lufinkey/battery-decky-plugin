import os
import sys
PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
sys.path.append(PLUGIN_DIR+"/py_modules")
import asyncio
from typing import Tuple, Any
import datetime
import logging

sys.path.append(PLUGIN_DIR+"/backend")
from upower_monitor import UPowerMonitor, UPowerMonitorEventHeader, UPowerDeviceInfo
from power_history import PowerHistoryDB, BatteryStateLog
from sleep_inhibit import SleepInhibitor

DATA_DIR = "/var/local/battery-analytics-decky"

logging.basicConfig(filename="/tmp/template.log",
					format='[Template] %(asctime)s %(levelname)s %(message)s',
					filemode='w+',
					force=True)
logger=logging.getLogger()
logger.setLevel(logging.INFO) # can be changed to logging.DEBUG for debugging issues

class Plugin:
	monitor: UPowerMonitor = None
	db: PowerHistoryDB = None
	sleep_inhibitor: SleepInhibitor = None

	# Asyncio-compatible long-running code, executed in a task when the plugin is loaded
	async def _main(self):
		logger.info("Loading Battery Info plugin")
		# connect DB
		if self.db is None:
			self.db = PowerHistoryDB(dir=DATA_DIR)
		await self.db.connect()
		# start message listener
		if self.sleep_inhibitor is not None:
			self.sleep_inhibitor = SleepInhibitor()
		self.sleep_inhibitor.when_system_suspend = self._when_system_suspended
		self.sleep_inhibitor.when_system_resume = self._when_system_resumed
		await self.sleep_inhibitor.inhibit()
		# start device monitor
		if self.monitor is None:
			self.monitor = UPowerMonitor()
			self.monitor.when_device_updated = self._when_device_updated
		self.monitor.start()
	
	
	# Function called first during the unload process, utilize this to handle your plugin being removed
	async def _unload(self):
		logger.info("Unloading Battery Info plugin")
		# stop device monitor
		if self.monitor is not None:
			self.monitor.stop()
		# stop sleep inhibitor
		if self.sleep_inhibitor is not None:
			self.sleep_inhibitor.uninhibit()
		# close db
		if self.db is not None:
			await self.db.close()
	
	
	async def get_battery_logs(self,
		time_start: str = None,
		time_start_incl: bool = True,
		time_end: str = None,
		time_end_incl: bool = False,
		group_by_interval_start: str = None,
		group_by_interval: int = None,
		prefer_group_first: bool = True):
		if self.db is None:
			logger.error("DB has not been created")
		if time_start is not None:
			time_start: datetime.datetime = datetime.datetime.fromisoformat(time_start)
		if time_end is not None:
			time_end: datetime.datetime = datetime.datetime.fromisoformat(time_end)
		if group_by_interval_start is not None:
			group_by_interval_start: datetime.datetime = datetime.datetime.fromisoformat(group_by_interval_start)
		if group_by_interval is not None:
			if group_by_interval_start is None:
				logger.warn("group_by_interval_start should be specified if group_by_interval is specified")
				utcnow = datetime.datetime.utcnow()
				group_by_interval_start = datetime.datetime(year=utcnow.year, month=utcnow.month, day=utcnow.day, tzinfo=utcnow.tzinfo)
			group_by_interval: Tuple[datetime.datetime, int] = (group_by_interval_start, group_by_interval)
		logs = await self.db.get_battery_state_logs(
			time_start = time_start,
			time_start_incl = time_start_incl,
			time_end = time_end,
			time_end_incl = time_end_incl,
			group_by_interval = (group_by_interval_start, group_by_interval),
			prefer_group_first = prefer_group_first)
		logs_arr = list()
		for log in logs:
			logs_arr.append(log.to_dict())
		return logs_arr
	
	def _when_device_updated(self, logtime: datetime.datetime, device_path: str, device_info: UPowerDeviceInfo):
		loop = asyncio.get_event_loop()
		loop.create_task(self.db.log_device_info(logtime, device_path, device_info))
	
	def _when_message_received(self, data: Any):
		if not isinstance(data,dict) or "event" not in data:
			logger.error("Invalid message received: "+str(data))
			return
		evt = data["event"]
		if evt == "system-suspend":
			self._when_system_suspended(data.get("arg", None))
		elif evt == "system-resume":
			self._when_system_resumed(data.get("arg", None))
		else:
			logger.error("Unknown event "+str(evt))

	def _when_system_suspended(self):
		pass

	def _when_system_resumed(self):
		pass

