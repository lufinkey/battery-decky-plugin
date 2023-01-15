from typing import List, Iterable, Tuple, Callable
from dataclasses import dataclass
import os
import asyncio
import threading
import datetime
import logging
import sqlite3

from upower_monitor import UPowerDeviceInfo
from utils import AsyncValue

logger = logging.getLogger()



@dataclass
class BatteryStateLog:
	device_path: str
	time: datetime.datetime
	state: str
	energy_Wh: float
	energy_empty_Wh: float
	energy_full_Wh: float
	energy_full_design_Wh: float
	energy_rate_W: float
	voltage_V: float
	seconds_till_full: float
	percent_current: float
	percent_capacity: float

	@classmethod
	def get_sql_tablename(cls):
		return "BatteryStateLog"

	@classmethod
	def get_sql_createtable(cls):
		tblname = cls.get_sql_tablename()
		return '''CREATE TABLE IF NOT EXISTS {} (
			device_path TEXT NOT NULL,
			time TIMESTAMP NOT NULL,
			state TEXT NOT NULL,
			energy_Wh REAL,
			energy_empty_Wh REAL,
			energy_full_Wh REAL,
			energy_full_design_Wh REAL,
			energy_rate_W REAL,
			voltage_V REAL,
			seconds_till_full REAL,
			percent_current REAL,
			percent_capacity REAL,
			PRIMARY KEY(device_path, time)
		)'''.format(tblname)

	@classmethod
	def from_device_info(cls, logtime_utc: datetime.datetime, device_path: str, info: UPowerDeviceInfo) -> 'BatteryStateLog':
		bi = info.battery_info
		if bi is None:
			raise RuntimeError("battery field not found within device info")
		return BatteryStateLog(
			device_path = device_path,
			time = logtime_utc,
			state = bi.state,
			energy_Wh = bi.energy_Wh,
			energy_full_Wh = bi.energy_full_Wh,
			energy_full_design_Wh = bi.energy_full_design_Wh,
			energy_rate_W = bi.energy_rate_W,
			voltage_V = bi.voltage_V,
			seconds_till_full = bi.seconds_till_full,
			percent_current = bi.percent_current,
			percent_capacity = bi.percent_capacity)
	
	@classmethod
	def from_dbtuple(cls, dbtuple: tuple):
		(device_path,
			time,
			state,
			energy_Wh,
			energy_full_Wh,
			energy_full_design_Wh,
			energy_rate_W,
			voltage_V,
			seconds_till_full,
			percent_current,
			percent_capacity) = dbtuple
		return BatteryStateLog(
			device_path = device_path,
			time = time,
			state = state,
			energy_Wh = energy_Wh,
			energy_full_Wh = energy_full_Wh,
			energy_full_design_Wh = energy_full_design_Wh,
			energy_rate_W = energy_rate_W,
			voltage_V = voltage_V,
			seconds_till_full = seconds_till_full,
			percent_current = percent_current,
			percent_capacity = percent_capacity)
	
	def to_dbtuple(self) -> tuple:
		return (
			self.device_path,
			self.time,
			self.state,
			self.energy_Wh,
			self.energy_full_Wh,
			self.energy_full_design_Wh,
			self.energy_rate_W,
			self.voltage_V,
			self.seconds_till_full,
			self.percent_current,
			self.percent_capacity)
	
	@classmethod
	def from_dict(cls, d: dict) -> 'BatteryStateLog':
		return BatteryStateLog(
			device_path = d['device_path'],
			time = d['time'],
			state = d['state'],
			energy_Wh = d['energy_Wh'],
			energy_full_Wh = d['energy_full_Wh'],
			energy_full_design_Wh = d['energy_full_design_Wh'],
			energy_rate_W = d['energy_rate_W'],
			voltage_V = d['voltage_V'],
			seconds_till_full = d['seconds_till_full'],
			percent_current = d['percent_current'],
			percent_capacity = d['percent_capacity'])
	
	def to_dict(self) -> dict:
		return {
			'device_path': self.device_path,
			'time': self.time,
			'state': self.state,
			'energy_Wh': self.energy_Wh,
			'energy_full_Wh': self.energy_full_Wh,
			'energy_full_design_Wh': self.energy_full_design_Wh,
			'energy_rate_W': self.energy_rate_W,
			'voltage_V': self.voltage_V,
			'seconds_till_full': self.seconds_till_full,
			'percent_current': self.percent_current,
			'percent_capacity': self.percent_capacity
		}



@dataclass
class SystemEventLog:
	time: datetime.datetime
	event: str

	@classmethod
	def get_sql_tablename(cls):
		return "SystemEventLog"

	@classmethod
	def get_sql_createtable(cls):
		tblname = cls.get_sql_tablename()
		return '''CREATE TABLE IF NOT EXISTS {} (
			time TIMESTAMP NOT NULL,
			event TEXT NOT NULL
			PRIMARY KEY(device_path, time)
		)'''.format(tblname)
	
	@classmethod
	def from_dbtuple(cls, dbtuple: tuple):
		(
			time,
			event) = dbtuple
		return BatteryStateLog(
			time = time,
			event = event)
	
	def to_dbtuple(self) -> tuple:
		return (
			self.time,
			self.event)
	
	@classmethod
	def from_dict(cls, d: dict) -> 'BatteryStateLog':
		return BatteryStateLog(
			time = d['time'],
			event = d['event'])
	
	def to_dict(self) -> dict:
		return {
			'time': self.time,
			'event': self.event
		}



class PowerHistoryDB:
	db_loop: asyncio.AbstractEventLoop = None
	connection: sqlite3.Connection = None
	cursor: sqlite3.Cursor = None

	def __init__(self, dir: str):
		self.dir = dir
	
	def _setup_db(self):
		sql = BatteryStateLog.get_sql_createtable()
		self._commit_sql(sql, parameters=[])

	def _prepare_db_loop(self):
		if self.db_loop is not None:
			return
		db_loop = asyncio.new_event_loop()
		loop_thread = threading.Thread(target=db_loop.run_forever)
		self.db_loop = db_loop
		loop_thread.start()
	
	async def _db_loop_op(self, callable: Callable):
		self._prepare_db_loop()
		return await AsyncValue.run_on_loop(self.db_loop, callable)
	
	def _fetch_sql(self, sql: str, parameters: list) -> list:
		connection = self.connection
		cursor = self.cursor
		if cursor is None:
			raise RuntimeError("No cursor available to run query")
		elif connection is None:
			raise RuntimeError("No connection available to run query")
		cursor.executemany(sql, parameters)
		return cursor.fetchall()
	
	def _commit_sql(self, sql: str, parameters: list):
		connection = self.connection
		cursor = self.cursor
		if cursor is None:
			raise RuntimeError("No cursor available to run query")
		elif connection is None:
			raise RuntimeError("No connection available to run query")
		cursor.executemany(sql, parameters)
		connection.commit()
	


	async def connect(self):
		return await self._db_loop_op(self._connect)
	def _connect(self):
		# connect to DB
		if self.connection is None:
			if not os.path.exists(self.dir):
				os.mkdir(self.dir)
			self.connection = sqlite3.connect(dir+"/power_history.db")
		else:
			logger.warn("DB is already created")
		# create cursor if needed
		if self.cursor is None:
			self.cursor = self.connection.cursor()
		# setup db
		self._setup_db()
	
	async def close(self):
		return await self._db_loop_op(self._close)
	def _close(self):
		# close cursor
		if self.cursor is not None:
			self.cursor.close()
			self.cursor = None
		# close connection
		if self.connection is not None:
			self.connection.close()
			self.connection = None
	

	
	async def log_device_info(self, logtime_utc: datetime.datetime, device_path: str, device_info: UPowerDeviceInfo):
		device_type = device_info.get_device_type()
		if device_type == 'battery':
			batt_log = BatteryStateLog.from_device_info(logtime_utc, device_path, device_info)
			await self.add_battery_state_log(batt_log)
		else:
			logger.error("Unknown device type for "+device_path)
	
	async def add_battery_state_log(self, batt_state_log: BatteryStateLog) -> list:
		return await self._db_loop_op(lambda:self._add_battery_state_log(batt_state_log))
	def _add_battery_state_log(self, batt_state_log: BatteryStateLog) -> list:
		tblname = BatteryStateLog.get_sql_tablename()
		sql = '''INSERT OR REPLACE INTO {} VALUES(?)'''.format(tblname)
		data = [ batt_state_log.to_dbtuple() ]
		return self._commit_sql(sql, data)
	
	async def get_battery_state_logs(self,
		time_start: datetime.datetime = None,
		time_start_incl: bool = True,
		time_end: datetime.datetime = None,
		time_end_incl: bool = False,
		group_by_interval: Tuple[datetime.datetime, datetime.timedelta] = None,
		prefer_group_first: bool = True) -> List[BatteryStateLog]:
		return await self._db_loop_op(lambda:self._get_battery_state_logs(
			time_start = time_start,
			time_start_incl = time_start_incl,
			time_end = time_end,
			time_end_incl = time_end_incl,
			group_by_interval = group_by_interval,
			prefer_group_first = prefer_group_first))
	def _get_battery_state_logs(self,
		time_start: datetime.datetime = None,
		time_start_incl: bool = True,
		time_end: datetime.datetime = None,
		time_end_incl: bool = False,
		group_by_interval: Tuple[datetime.datetime, datetime.timedelta] = None,
		prefer_group_first: bool = True) -> List[BatteryStateLog]:
		tblname = BatteryStateLog.get_sql_tablename()
		params = []
		sql = 'SELECT '
		if group_by_interval is not None:
			if prefer_group_first:
				sql += 'FIRST_VALUE(*)'
			else:
				sql += 'LAST_VALUE(*)'
			(group_start_time, group_interval_secs) = group_by_interval
			# 86400 is the number of seconds in a day (60 * 60 * 24)
			sql += ', FLOOR(((JULIANDAY(time) - JULIANDAY(?)) * 86400) / ?) as time_group'
			params.append(group_start_time)
			params.append(group_interval_secs)
		else:
			sql += '*'
		sql += ' FROM '+tblname
		# check if where clause is needed
		if time_start is not None or time_end is not None:
			sql += ' WHERE '
			clause_count = 0
			if time_start is not None:
				if time_start_incl:
					sql += 'time >= ?'
				else:
					sql += 'time > ?'
				params.append(time_start)
				clause_count += 1
			if time_end is not None:
				if clause_count > 0:
					sql += ' AND '
				if time_end_incl:
					sql += 'time <= ?'
				else:
					sql += 'time < ?'
				params.append(time_end)
				clause_count += 1
		if group_by_interval is not None:
			sql += ' GROUP BY time_group'
		records = self._fetch_sql(sql, params)
		batt_state_logs = []
		for record in records:
			batt_state_logs.append(BatteryStateLog.from_dbtuple(record))
		return batt_state_logs
	
	async def add_system_event_log(self, system_evt_log: SystemEventLog) -> list:
		return await self._db_loop_op(lambda:self._add_battery_state_log(system_evt_log))
	def _add_system_event_log(self, system_evt_log: SystemEventLog) -> list:
		tblname = SystemEventLog.get_sql_tablename()
		sql = '''INSERT OR REPLACE INTO {} VALUES(?)'''.format(tblname)
		data = [ system_evt_log.to_dbtuple() ]
		return self._commit_sql(sql, data)
	
	async def get_system_event_logs(self,
		time_start: datetime.datetime = None,
		time_start_incl: bool = True,
		time_end: datetime.datetime = None,
		time_end_incl: bool = False) -> List[SystemEventLog]:
		return await self._db_loop_op(lambda:self._get_system_event_logs(
			time_start = time_start,
			time_start_incl = time_start_incl,
			time_end = time_end,
			time_end_incl = time_end_incl))
	def _get_system_event_logs(self,
		time_start: datetime.datetime = None,
		time_start_incl: bool = True,
		time_end: datetime.datetime = None,
		time_end_incl: bool = False) -> List[SystemEventLog]:
		tblname = SystemEventLog.get_sql_tablename()
		params = []
		sql = 'SELECT * FROM '+tblname
		# check if where clause is needed
		if time_start is not None or time_end is not None:
			sql += ' WHERE '
			clause_count = 0
			if time_start is not None:
				if time_start_incl:
					sql += 'time >= ?'
				else:
					sql += 'time > ?'
				params.append(time_start)
				clause_count += 1
			if time_end is not None:
				if clause_count > 0:
					sql += ' AND '
				if time_end_incl:
					sql += 'time <= ?'
				else:
					sql += 'time < ?'
				params.append(time_end)
				clause_count += 1
		records = self._fetch_sql(sql, params)
		system_evt_logs = []
		for record in records:
			system_evt_logs.append(SystemEventLog.from_dbtuple(record))
		return system_evt_logs
