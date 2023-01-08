#!/usr/bin/env python3
from typing import IO, Tuple, Dict, List, Callable
from dataclasses import dataclass
import time
import datetime
import logging
import asyncio
import threading
import subprocess

from utils import skip_to_occurance_of_chars, get_line_end_index, get_next_line_index, merge_dict

logger = logging.getLogger()



@dataclass
class UPowerMonitorEventHeader:
	logtime: datetime.datetime
	event_type: str
	event_value: str

	@classmethod
	def parse_log_timestamp(cls, timestampStr: str) -> datetime.datetime:
		# get date for now and yesterday
		now = datetime.datetime.now()
		local_tz = now.tzinfo
		yesterday = now - datetime.timedelta(days=1)
		# get time components from string
		tm = time.strptime(timestampStr, "%H:%M:%S.%f")
		# determine if we should use the date from today or yesterday for the timestamp
		datetm_from_now = datetime.datetime(year=now.year, month=now.month, day=now.day, hour=tm.tm_hour, minute=tm.tm_min, second=tm.tm_sec, tzinfo=local_tz)
		diff_from_now = datetm_from_now - now
		datetm_from_yesterday = datetime.datetime(year=yesterday.year, month=yesterday.month, day=yesterday.day, hour=tm.tm_hour, minute=tm.tm_min, second=tm.tm_sec, tzinfo=local_tz)
		diff_from_yesterday = datetm_from_yesterday - now
		# normalize date diff
		zero_td = datetime.timedelta()
		if diff_from_now < zero_td:
			diff_from_now = -diff_from_now
		if diff_from_yesterday < zero_td:
			diff_from_yesterday = -diff_from_yesterday
		# whichever date is closer to now is the one we should use
		if diff_from_yesterday < diff_from_now:
			return datetm_from_yesterday
		return datetm_from_now
	
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
			endBracketIndex = data.index("]", offset+1)
		except ValueError as error:
			logger.error("Could not find expected ] for log at offset {} of chunk:\n{}".format(offset, data))
			logger.error(str(error))
			return (None, get_next_line_index(data, offset))
		# attempt to parse log timestamp
		timestampStr = data[(offset+1):endBracketIndex]
		logtime = cls.parse_log_timestamp(timestampStr)
		# attempt to parse event type + value
		next_line_index = get_next_line_index(data, endBracketIndex+1)
		try:
			colonIndex = data.index(":", endBracketIndex+1)
		except ValueError as error:
			colonIndex = next_line_index
		event_type = data[endBracketIndex+1:next_line_index].strip()
		if colonIndex >= next_line_index:
			event_value = None
		else:
			event_value = data[colonIndex+1:next_line_index].strip()
		# create header
		header = UPowerMonitorEventHeader(
			logtime=logtime,
			event_type=event_type,
			event_value=event_value)
		return (header, next_line_index)



@dataclass
class UPowerDeviceInfo:
	def __init__(self, info: dict):
		self._info = info
	
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
		for key in self._info:
			val = self._info[key]
			if isinstance(val, dict):
				new_info[key] = val.copy()
			elif isinstance(val, list):
				new_info[key] = val.copy()
			else:
				new_info[key] = val
		return UPowerDeviceInfo(new_info)
	
	def merge_from(self, other_info: 'UPowerDeviceInfo'):
		self._info = merge_dict(self._info, other_info._info, copy=False, copy_inner=True)



class UPowerMonitor:
	main_loop: asyncio.AbstractEventLoop
	monitor_proc: subprocess.Popen = None
	monitor_reader_thread: threading.Thread = None
	last_logtime: datetime.datetime = None
	device_infos: Dict[str,UPowerDeviceInfo] = dict()
	when_device_updated: Callable[[UPowerMonitorEventHeader, UPowerDeviceInfo], None] = None
	
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
		proc = subprocess.Popen(
			['upower', '--show-info', name],
			stdout = subprocess.PIPE)
		output = proc.stdout.read()
		output_str = output.decode('utf-8')
		(info, offset) = UPowerDeviceInfo.parse(output_str, 0)
		if info is None:
			logger.error("Couldn't parse device info from output chunk "+output_str)
		return info

	async def start(self):
		if self.monitor_proc is not None and self.monitor_proc.poll() is None \
			and self.monitor_reader_thread is not None and self.monitor_reader_thread.is_alive():
			# upower monitor is already running
			return
		if self.monitor_proc is not None or self.monitor_reader_thread is not None:
			# upower process was killed or is ended
			# stop to ensure process is dead
			await self.stop()
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
		# run monitor process
		self.monitor_proc = subprocess.Popen(
			['upower', '--monitor-detail'],
			stdout = subprocess.PIPE)
		# read monitor output on separate thread
		monitor_stdout = self.monitor_proc.stdout
		self.monitor_reader_thread = threading.Thread(target=self._consume_monitor_output, args=(monitor_stdout, ))
		self.monitor_reader_thread.start()

	async def stop(self):
		# kill upower process
		if self.monitor_proc is not None:
			self.monitor_proc.kill()
			self.monitor_proc = None
		# wait for monitor thread to end
		if self.monitor_reader_thread is not None:
			thread = self.monitor_reader_thread
			if thread.is_alive():
				await asyncio.sleep(0.05)
			while thread.is_alive():
				await asyncio.sleep(0.1)
			if self.monitor_reader_thread is thread:
				self.monitor_reader_thread = None
			thread.join()
	
	def on_monitor_device_update(self, header: UPowerMonitorEventHeader, new_info: UPowerDeviceInfo):
		if header.event_value is not None and len(header.event_value) > 0:
			if header.event_value in self.device_infos:
				new_device_info = self.device_infos[header.event_value].copy()
				new_device_info.merge_from(new_info)
			else:
				logger.warn("new device entry "+header.event_value)
				new_device_info = new_info
			self.device_infos[header.event_value] = new_device_info
			# call device update event property
			if self.when_device_updated is not None:
				self.when_device_updated(header, new_device_info)
	
	def on_monitor_end(self):
		self.monitor_proc = None
		pass

	def parse_output_chunk(self, chunk: str, index: int) -> Tuple[UPowerMonitorEventHeader,UPowerDeviceInfo,int]:
		pass
	
	def _consume_monitor_output(self, stdout: IO[bytes]):
		is_first_line = True
		reading_chunks = True
		lines = []
		while reading_chunks:
			# read a line
			line = stdout.readline()
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
						(header, offset) = UPowerMonitorEventHeader.parse(chunk_str, offset)
						if header is None:
							logger.error("No header found for monitor output:\n"+chunk_str)
						else:
							(info, offset) = UPowerDeviceInfo.parse(chunk_str, offset)
							if info is None:
								logger.error("failed to read chunk:\n"+chunk_str)
							else:
								logger.info("got event {} for {} at timestamp {}".format(header.event_type, str(header.event_value), str(header.logtime)))
								self.main_loop.call_soon_threadsafe(lambda:self.on_monitor_device_update(header, info))
					else:
						# ignore empty line
						logger.info("Ignoring empty line")
			except BaseException as error:
				logger.error("Error reading line:\n"+str(error))
		self.main_loop.call_soon_threadsafe(lambda:self.on_monitor_end())
