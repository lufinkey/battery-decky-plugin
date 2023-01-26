from typing import Callable, Awaitable
import asyncio
import datetime
import inspect
import logging

logger = logging.getLogger()

def skip_to_occurance_of_chars(data: str, offset: int, chars: str) -> int:
	data_len = len(data)
	while offset < data_len:
		c = data[offset]
		if chars.find(c) != -1:
			break
		offset += 1
	return offset

def get_line_end_index(data: str, offset: int) -> int:
	return skip_to_occurance_of_chars(data, offset, "\r\n")

def get_next_line_index(data: str, offset: int) -> int:
	lineEnd = get_line_end_index(data, offset=offset)
	data_len = len(data)
	if lineEnd == data_len:
		return data_len
	c = data[lineEnd]
	if c == '\r':
		lineEnd += 1
		if lineEnd == data_len:
			return data_len
		c = data[lineEnd]
	if c == '\n':
		lineEnd += 1
	return lineEnd

def merge_dict(d: dict, patch: dict, copy: bool = True, copy_inner: bool = True) -> dict:
	if copy:
		d = d.copy()
	for key in patch:
		d_val = d[key] if key in d else None
		p_val = patch[key]
		if d_val is None:
			d[key] = p_val
			continue
		elif isinstance(p_val, dict):
			if isinstance(d_val, dict):
				d_val = merge_dict(d_val, p_val, copy=copy_inner, copy_inner=copy_inner)
			else:
				if copy_inner:
					d_val = p_val.copy()
				else:
					d_val = p_val
			d[key] = d_val
		elif p_val is not None:
			d[key] = p_val
	return d

def try_logexcept(callable: Callable):
	try:
		callable()
	except BaseException as error:
		logger.exception(error)

async def try_logexcept_async(callable: Callable[[], Awaitable]):
	try:
		await callable()
	except BaseException as error:
		logger.exception(error)

async def try_logexcept_awaitable(awaitable: Awaitable):
	try:
		await awaitable
	except BaseException as error:
		logger.exception(error)

def datetime_from_isoformat(datestr: str):
	return datetime.datetime.strptime(datestr, "%Y-%m-%dT%H:%M:%S.%f%z")



class AsyncValue:
	loop: asyncio.AbstractEventLoop
	ready_event: asyncio.Event
	state: bool = None
	result = None
	error: BaseException = None

	def __init__(self):
		self.loop = asyncio.get_event_loop()
		self.ready_event = asyncio.Event()

	def resolve(self, result):
		self.result = result
		self.state = True
		self.loop.call_soon_threadsafe(lambda:self.ready_event.set())
	
	def reject(self, error: BaseException):
		self.error = error
		self.state = False
		self.loop.call_soon_threadsafe(lambda:self.ready_event.set())
	
	def clear(self):
		self.error = None
		self.result = None
		self.state = None
		self.ready_event.clear()
	
	async def get(self):
		await self.ready_event.wait()
		if not self.state:
			raise self.error
		return self.result

	@classmethod
	async def _main_sync(cls, val: 'AsyncValue', callable: Callable):
		try:
			if inspect.iscoroutinefunction(callable):
				result = await callable()
			else:
				result = callable()
				if inspect.isawaitable(result):
					result = await result
		except BaseException as error:
			val.reject(error)
			return
		val.resolve(result)
	
	@classmethod
	async def run_on_loop(cls, loop: asyncio.AbstractEventLoop, callable: Callable):
		val = AsyncValue()
		loop.call_soon_threadsafe(lambda:loop.create_task(cls._main_sync(val, callable)))
		return await val.get()
