import os
import sys
PYTHON_LIB_DIR = '/usr/lib/python{}.{}'.format(sys.version_info[0], sys.version_info[1])
PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
sys.path.extend([
	PYTHON_LIB_DIR,
	PYTHON_LIB_DIR+'/lib-dynload',
	PYTHON_LIB_DIR+'/site-packages',
	PLUGIN_DIR+'/py_modules',
	PLUGIN_DIR+'/backend'
])
import asyncio
from typing import Tuple, Any, Awaitable, Callable
import datetime
import logging

from upower_monitor import UPowerMonitor, UPowerDeviceInfo
from power_history import PowerHistoryDB, SystemEventLog, SystemEventTypes
from system_signals import SystemSignalListener

DATA_DIR = "/home/deck/.battery-analytics-decky"

logging.basicConfig(filename="/tmp/battery-analytics-decky.log",
					format='[BatteryAnalytics] %(asctime)s %(levelname)s %(message)s',
					filemode='w+',
					force=True)
logger=logging.getLogger()
logger.setLevel(logging.INFO) # can be changed to logging.DEBUG for debugging issues

class Plugin:
	loop: asyncio.AbstractEventLoop = None
	monitor: UPowerMonitor = None
	db: PowerHistoryDB = None
	system_signal_listener: SystemSignalListener = None
	

	# Asyncio-compatible long-running code, executed in a task when the plugin is loaded
	async def _main(self):
		logger.info("Loading Battery Info plugin")
		utcnow = datetime.datetime.utcnow()
		self.loop = asyncio.get_event_loop()
		# connect DB
		if self.db is None:
			self.db = PowerHistoryDB(dir=DATA_DIR)
		await self.db.connect()
		# start sleep inhibitor
		if self.system_signal_listener is None:
			self.system_signal_listener = SystemSignalListener()
			self.system_signal_listener.on_system_suspend = self._when_system_suspended
			self.system_signal_listener.on_system_resume = self._when_system_resumed
			self.system_signal_listener.on_system_shutdown = self._when_system_shutdown
		self.system_signal_listener.listen()
		# start device monitor
		if self.monitor is None:
			self.monitor = UPowerMonitor()
			self.monitor.when_device_updated = self._when_device_updated
		self.monitor.start()
		# log plugin load
		await self.db.add_system_event_log(SystemEventLog(utcnow, SystemEventTypes.PLUGIN_LOAD))
	
	
	# Function called first during the unload process, utilize this to handle your plugin being removed
	async def _unload(self):
		logger.info("Unloading Battery Info plugin")
		utcnow = datetime.datetime.utcnow()
		# stop device monitor
		try:
			if self.monitor is not None:
				self.monitor.stop()
		except BaseException as error:
			logger.error("Error while stopping UPower monitor:\n"+str(error))
		# log plugin unload
		await self.db.add_system_event_log(SystemEventLog(utcnow, SystemEventTypes.PLUGIN_UNLOAD))
		# stop sleep inhibitor
		if self.system_signal_listener is not None:
			self.system_signal_listener.unlisten()
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
	
	async def get_system_event_logs(self,
		time_start: str = None,
		time_start_incl: bool = True,
		time_end: str = None,
		time_end_incl: bool = False):
		if self.db is None:
			logger.error("DB has not been created")
		if time_start is not None:
			time_start: datetime.datetime = datetime.datetime.fromisoformat(time_start)
		if time_end is not None:
			time_end: datetime.datetime = datetime.datetime.fromisoformat(time_end)
		logs = await self.db.get_system_event_logs(
			time_start = time_start,
			time_start_incl = time_start_incl,
			time_end = time_end,
			time_end_incl = time_end_incl)
		logs_arr = list()
		for log in logs:
			logs_arr.append(log.to_dict())
		return logs_arr
	


	async def _logged_async_call(self, name: str, callable: Callable):
		try:
			await callable()
		except BaseException as error:
			logger.error("Error during task "+name+":\n"+str(error))
	
	def _create_task_threadsafe(self, loop: asyncio.AbstractEventLoop, name: str, callable: Callable):
		return loop.call_soon_threadsafe(lambda:loop.create_task(self._logged_async_call(name, callable)))
	
	
	
	def _when_device_updated(self, logtime: datetime.datetime, device_path: str, device_info: UPowerDeviceInfo):
		loop = self.loop
		if loop is None:
			logger.error("called _when_device_updated, but no event loop available to queue action to")
			return
		self._create_task_threadsafe(loop, lambda:self.db.log_device_info(logtime, device_path, device_info))
	
	def _when_system_suspended(self):
		now = datetime.datetime.utcnow()
		loop = self.loop
		if loop is None:
			logger.error("called _when_system_suspended, but no event loop available to queue action to")
			return
		self._create_task_threadsafe(loop, lambda:self.db.add_system_event_log(SystemEventLog(now, SystemEventTypes.SUSPEND)))

	def _when_system_resumed(self):
		now = datetime.datetime.utcnow()
		loop = self.loop
		if loop is None:
			logger.error("called _when_system_resumed, but no event loop available to queue action to")
			return
		self._create_task_threadsafe(loop, lambda:self.db.add_system_event_log(SystemEventLog(now, SystemEventTypes.RESUME)))
	
	def _when_system_shutdown(self):
		now = datetime.datetime.utcnow()
		loop = self.loop
		if loop is None:
			logger.error("called _when_system_resumed, but no event loop available to queue action to")
			return
		self._create_task_threadsafe(loop, lambda:self.db.add_system_event_log(SystemEventLog(now, SystemEventTypes.SHUTDOWN)))
