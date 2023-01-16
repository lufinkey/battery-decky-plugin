#!/usr/bin/env python3
from typing import IO, Tuple, Dict, List, Callable
from dataclasses import dataclass
import os
import datetime
import logging
import asyncio
import threading
import subprocess

from utils import skip_to_occurance_of_chars, get_line_end_index, get_next_line_index, merge_dict

logger = logging.getLogger()


def read_value_in_units(val_str: str, unit: str, conversions: Dict[str, float], defaultunit: str = None):
	if val_str is None:
		return None
	parts = val_str.split()
	parts_len = len(parts)
	if parts_len == 0:
		return None
	num_str = parts[0]
	if parts_len == 1:
		if defaultunit is not None:
			if defaultunit in conversions:
				mult = conversions[defaultunit]
			elif defaultunit == unit:
				mult = 1
			else:
				logger.error("unknown conversion for unit "+defaultunit)
				return None
			return float(num_str) * mult
		else:
			logger.error("unknown units for value "+val_str)
			return None
	units_str = parts[1]
	if units_str in conversions:
		mult = conversions[units_str]
	elif units_str == unit:
		mult = 1
	else:
		logger.error("unknown units "+units_str)
		return None
	return float(num_str) * mult


def read_value_Wh(val_str: str) -> float:
	return read_value_in_units(val_str,
		unit = "Wh",
		conversions = {
			"Wh": 1,
			"kWh": 1000
		},
		defaultunit="Wh")

def read_value_W(val_str: str) -> float:
	return read_value_in_units(val_str,
		unit = "W",
		conversions = {
			"W": 1,
			"kW": 1000
		},
		defaultunit="W")

def read_value_V(val_str: str) -> float:
	return read_value_in_units(val_str,
		unit = "V",
		conversions = {
			"V": 1,
			"kV": 1000
		},
		defaultunit="V")

def read_value_duration(time_str: str) -> datetime.timedelta:
	if time_str is None:
		return None
	time_parts = time_str.split()
	parts_len = len(time_parts)
	if parts_len <= 1 or (parts_len % 2) != 0:
		logger.error("invalid number of parts for time string "+time_str)
		return None
	pairs_count = parts_len / 2
	td = datetime.timedelta()
	for i in range(pairs_count):
		num_i = i * 2
		num_str = time_parts[num_i]
		unit_str = time_parts[num_i + 1]
		num_val = float(num_str)
		if unit_str == "minutes":
			td += datetime.timedelta(minutes=num_val)
		elif unit_str == "hours":
			td += datetime.timedelta(hours=num_val)
		elif unit_str == "seconds":
			td += datetime.timedelta(seconds=num_val)
		elif unit_str == "days":
			td += datetime.timedelta(days=num_val)
		else:
			logger.error("unknown time unit "+unit_str)
			return None
	return td

def read_value_percentage(p_str: str) -> float:
	if p_str is None:
		return None
	p_suffix = "%"
	if p_str.endswith(p_suffix):
		p_str = p_str[0:len(p_str)-len(p_suffix)].rstrip()
	return float(p_str)



@dataclass
class UPowerLogTime:
	hour: int
	minute: int
	second: int
	microsecond: int

	@classmethod
	def parse(cls, time_str: str) -> 'UPowerLogTime':
		offset = 0
		# parse hour
		end_index = time_str.find(':', offset)
		if end_index == -1:
			return None
		hour = int(time_str[offset:end_index])
		# parse minute
		offset = end_index+1
		end_index = time_str.find(':', offset)
		if end_index == -1:
			return None
		minute = int(time_str[offset:end_index])
		# parse second
		offset = end_index+1
		end_index = time_str.find('.', offset)
		if end_index != -1:
			second = int(time_str[offset:end_index])
			# parse microsecond
			offset = end_index+1
			microsecond_str = time_str[offset:]
			microsecond = int(microsecond_str)
			for i in range(6-len(microsecond_str)):
				microsecond *= 10
		else:
			second = int(time_str[offset:])
			microsecond = 0
		return UPowerLogTime(
			hour=hour,
			minute=minute,
			second=second,
			microsecond=microsecond)



@dataclass
class UPowerMonitorEventHeader:
	logtime: UPowerLogTime
	event_type: str
	event_value: str
	
	@classmethod
	def parse(cls, data: str, offset: int) -> Tuple['UPowerMonitorEventHeader', int]:
		# ensure data isn't empty
		data_len = len(data)
		if data_len == 0:
			return (None, 0)
		# ensure log prefix
		if data[offset] != "[":
			logger.error("missing expected log start at offset {} of chunk:\n{}".format(offset, data))
			return (None, get_next_line_index(data, offset))
		# ensure end of log prefix
		try:
			endbracket_index = data.index("]", offset+1)
		except ValueError as error:
			logger.error("Could not find expected ] for log at offset {} of chunk:\n{}".format(offset, data))
			logger.error(str(error))
			return (None, get_next_line_index(data, offset))
		# attempt to parse log timestamp
		time_str = data[(offset+1):endbracket_index]
		logtime = UPowerLogTime.parse(time_str)
		# attempt to parse event type + value
		next_line_index = get_next_line_index(data, endbracket_index+1)
		try:
			colon_index = data.index(":", endbracket_index+1)
		except ValueError as error:
			colon_index = next_line_index
		event_type = data[endbracket_index+1:next_line_index].strip()
		if colon_index >= next_line_index:
			event_value = None
		else:
			event_value = data[colon_index+1:next_line_index].strip()
		# create header
		header = UPowerMonitorEventHeader(
			logtime=logtime,
			event_type=event_type,
			event_value=event_value)
		return (header, next_line_index)



@dataclass
class UPowerDeviceBatteryInfo:
	info: dict

	def __init__(self, info: dict) -> None:
		self.info = info

	@property
	def state(self) -> str:
		return self.info.get("state", None)
	
	@property
	def energy_Wh(self) -> float:
		return read_value_Wh(self.info.get("energy", None))
	
	@property
	def energy_empty_Wh(self) -> float:
		return read_value_Wh(self.info.get("energy-empty", None))
	
	@property
	def energy_full_Wh(self) -> float:
		return read_value_Wh(self.info.get("energy-full", None))
	
	@property
	def energy_full_design_Wh(self) -> float:
		return read_value_Wh(self.info.get("energy-full-design", None))
	
	@property
	def energy_rate_W(self) -> float:
		return read_value_W(self.info.get("energy-rate", None))
	
	@property
	def voltage_V(self) -> float:
		return read_value_V(self.info.get("voltage", None))
	
	@property
	def time_till_full(self) -> datetime.timedelta:
		return read_value_duration(self.info.get("time to full"))
	
	@property
	def seconds_till_full(self) -> float:
		td = self.time_till_full
		if td is None:
			return None
		return td.total_seconds()
	
	@property
	def percent_current(self) -> float:
		return read_value_percentage(self.info.get("percentage"))
	
	@property
	def percent_capacity(self) -> float:
		return read_value_percentage(self.info.get("capacity"))



@dataclass
class UPowerDeviceInfo:
	def __init__(self, info: dict):
		self.info = info
	
	def get_device_type(self):
		if 'battery' in self.info:
			return 'battery'
		elif 'line-power' in self.info:
			return 'line-power'
		return None
	
	@classmethod
	def parse(cls, data: str, offset: int) -> Tuple['UPowerDeviceInfo', int]:
		(info_dict, offset) = cls.parse_info_chunk(data, offset=offset, parent_indent=0)
		if info_dict is None:
			return (None, offset)
		return (UPowerDeviceInfo(info_dict), offset)
	
	@classmethod
	def parse_info_chunk(cls, data: str, offset: int, parent_indent: int) -> Tuple[dict, int]:
		data_len = len(data)
		if data_len == 0 or offset == data_len:
			return (None, offset)
		if data[offset] == '[':
			return (None, offset)
		info = dict()
		while offset < data_len:
			line_offset = offset
			# parse whitespace
			line_indent = 0
			while offset < data_len:
				c = data[offset]
				if c == ' ':
					line_indent += 1
				elif c == '\t':
					line_indent += 4
				elif c == '\r' or c == '\n':
					return (None, get_next_line_index(data, offset))
				else:
					break
				offset += 1
			if line_indent <= parent_indent:
				# this belongs to a previous indent level
				return (None, line_offset)
			# check for a colon
			keyEndIndex = skip_to_occurance_of_chars(data, offset, ":\r\n")
			if keyEndIndex == data_len:
				if keyEndIndex > offset:
					logger.warn("unused line "+data[offset:keyEndIndex])
				return (None, data_len)
			c = data[keyEndIndex]
			if c == ':':
				# this is a key with a value
				lineEndIndex = get_line_end_index(data, keyEndIndex+1)
				entry_key = data[offset:keyEndIndex].strip()
				entry_value = data[keyEndIndex+1:lineEndIndex].strip()
				info[entry_key] = entry_value
				offset = get_next_line_index(data, lineEndIndex)
			else:
				# this entry has key-value entries
				entry_key = data[offset:keyEndIndex].strip()
				offset = get_next_line_index(data, keyEndIndex)
				(child_info, offset) = cls.parse_info_chunk(data, offset, parent_indent=line_indent)
				if child_info is not None:
					info[entry_key] = child_info
		return (info, offset)
	
	def copy(self) -> 'UPowerDeviceInfo':
		new_info = dict()
		for key in self.info:
			val = self.info[key]
			if isinstance(val, dict):
				new_info[key] = val.copy()
			elif isinstance(val, list):
				new_info[key] = val.copy()
			else:
				new_info[key] = val
		return UPowerDeviceInfo(new_info)
	
	def merge_from(self, other_info: 'UPowerDeviceInfo'):
		self.info = merge_dict(self.info, other_info.info, copy=False, copy_inner=True)
	
	@property
	def battery_info(self) -> UPowerDeviceBatteryInfo:
		batt_info = self.info.get("battery", None)
		if batt_info is None:
			return None
		return UPowerDeviceBatteryInfo(batt_info)



class UPowerMonitor:
	main_loop: asyncio.AbstractEventLoop
	monitor_proc: subprocess.Popen = None
	monitor_reader_thread: threading.Thread = None
	last_logtime: datetime.datetime = None
	device_infos: Dict[str,UPowerDeviceInfo] = dict()
	when_device_updated: Callable[[datetime.datetime, str, UPowerDeviceInfo], None] = None
	
	def __init__(self):
		self.main_loop = asyncio.get_running_loop()
	
	def fetch_devices(self) -> List[str]:
		proc = subprocess.Popen(
			['upower', '--enumerate'],
			stdout = subprocess.PIPE)
		output = proc.stdout.read()
		output_str = output.decode('utf-8').strip()
		if len(output_str) == 0:
			return []
		devices = output_str.split('\n')
		for i in range(len(devices)):
			devices[i] = devices[i].strip()
		return devices
	
	def fetch_device_info(self, name: str) -> UPowerDeviceInfo:
		# attach UTC timezone for more correct date reading
		procenv = os.environ.copy()
		procenv["TZ"] = "UTC"
		# run upower process
		proc = subprocess.Popen(
			['upower', '--show-info', name],
			env=procenv,
			stdout = subprocess.PIPE)
		# parse output
		output = proc.stdout.read()
		output_str = output.decode('utf-8')
		(info, offset) = UPowerDeviceInfo.parse(output_str, 0)
		if info is None:
			logger.error("Couldn't parse device info from output chunk "+output_str)
		return info

	def start(self):
		if self.monitor_proc is not None and self.monitor_proc.poll() is None \
			and self.monitor_reader_thread is not None and self.monitor_reader_thread.is_alive():
			# upower monitor is already running
			logger.warn("called UPowerMonitor.start when it is already started")
			return
		if self.monitor_proc is not None or self.monitor_reader_thread is not None:
			# upower process was killed or is ended
			# stop to ensure process is dead
			self.stop()
		# get initial device info
		devices = self.fetch_devices()
		device_count = len(devices)
		if device_count == 0:
			logger.warn("didn't find any power devices")
		else:
			logger.info("found {} initial devices:\n{}".format(len(devices), "- "+str.join("\n- ", devices)))
		device_infos = dict()
		for device in devices:
			device_info = self.fetch_device_info(device)
			if device_info is None:
				logger.error("Couldn't fetch info for device "+device)
			else:
				device_infos[device] = device_info
		self.device_infos = device_infos
		# attach UTC timezone for more correct date reading
		procenv = os.environ.copy()
		procenv["TZ"] = "UTC"
		# run monitor process
		self.monitor_proc = subprocess.Popen(
			['upower', '--monitor-detail'],
			env=procenv,
			stdout = subprocess.PIPE)
		# read monitor output on separate thread
		monitor_stdout = self.monitor_proc.stdout
		self.monitor_reader_thread = threading.Thread(target=self._consume_monitor_output, args=(monitor_stdout, ))
		self.monitor_reader_thread.start()

	def stop(self):
		# kill upower process
		if self.monitor_proc is not None:
			self.monitor_proc.kill()
			self.monitor_proc = None
		# wait for monitor thread to end
		if self.monitor_reader_thread is not None:
			thread = self.monitor_reader_thread
			thread.join()
			if self.monitor_reader_thread is thread:
				self.monitor_reader_thread = None
	
	def on_monitor_device_update(self, logtime_utc: datetime.datetime, header: UPowerMonitorEventHeader, new_info: UPowerDeviceInfo):
		device_path = header.event_value
		if device_path is not None and len(device_path) > 0:
			if device_path in self.device_infos:
				new_device_info = self.device_infos[device_path].copy()
				new_device_info.merge_from(new_info)
			else:
				logger.warn("new device entry "+device_path)
				new_device_info = new_info
			self.device_infos[device_path] = new_device_info
			# call device update event property
			if self.when_device_updated is not None:
				self.when_device_updated(logtime_utc, device_path, new_device_info)
	
	def on_monitor_end(self):
		self.monitor_proc = None
		pass
	
	def _consume_monitor_output(self, stdout: IO[bytes]):
		is_first_line = True
		reading_chunks = True
		lines = []
		while reading_chunks:
			# read a line
			line = stdout.readline()
			utcnow = datetime.datetime.utcnow()
			tzinfo_utc = utcnow.tzinfo
			if not line:
				reading_chunks = False
				break
			try:
				line_str = line.decode('utf-8')
				# ignore first line if not relevant
				if is_first_line and not line_str.startswith("["):
					# ignore first chunk
					logger.info("Ignoring first line: "+str(line_str))
					is_first_line = False
					continue
				# check if the line is empty
				if not line_str.isspace():
					# add line to chunk
					lines.append(line_str)
				else:
					# line is empty, so read whole chunk if there is a chunk to read
					if len(lines) > 0:
						# read chunk
						chunk_str = "".join(lines)
						lines.clear()
						offset = 0
						# read chunk header
						(header, offset) = UPowerMonitorEventHeader.parse(chunk_str, offset)
						if header is None:
							logger.error("No header found for monitor output:\n"+chunk_str)
						else:
							# read device info
							(device_info, offset) = UPowerDeviceInfo.parse(chunk_str, offset)
							if device_info is None:
								logger.error("failed to read chunk:\n"+chunk_str)
							else:
								# parse timestamp
								logtime_utc = None
								if "updated" in device_info.info:
									updated_date_str = device_info["updated"]
									if isinstance(updated_date_str, str):
										if updated_date_str.endswith(")"):
											parenth_start = updated_date_str.rfind("(", 0, len(updated_date_str)-1)
											if parenth_start != -1:
												updated_date_str = updated_date_str[0:parenth_start].strip()
										logtime_utc = datetime.datetime.strptime(updated_date_str, "%a %d %b %Y %I:%M:%S %p %Z")
										if logtime_utc is not None:
											logtime_utc = logtime_utc.astimezone(tzinfo_utc)
								if logtime_utc is None:
									h_tm = header.logtime
									tm_from_now = datetime.datetime(year=utcnow.year, month=utcnow.month, day=utcnow.day, hour=h_tm.hour, minute=h_tm.minute, second=h_tm.second, microsecond=h_tm.microsecond, tzinfo=tzinfo_utc)
									tm_from_yesterday = tm_from_now - datetime.timedelta(days=1)
									zero_deltatime = datetime.timedelta()
									diff_from_now = utcnow - tm_from_now
									if diff_from_now < zero_deltatime:
										diff_from_now = -diff_from_now
									diff_from_yesterday = utcnow - tm_from_yesterday
									if diff_from_yesterday < zero_deltatime:
										diff_from_yesterday = -diff_from_yesterday
									if diff_from_yesterday < diff_from_now:
										logtime_utc = tm_from_yesterday
									else:
										logtime_utc = tm_from_now
								# call update event
								logger.info("got event {} for {} at timestamp {}".format(header.event_type, str(header.event_value), header.logtime.isoformat()))
								self.main_loop.call_soon_threadsafe(lambda:self.on_monitor_device_update(logtime_utc, header, device_info))
					else:
						# ignore empty line
						logger.info("Ignoring empty line")
			except BaseException as error:
				logger.error("Error reading line:\n"+str(error))
		self.main_loop.call_soon_threadsafe(lambda:self.on_monitor_end())
