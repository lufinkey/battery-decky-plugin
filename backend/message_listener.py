from typing import Any, Callable, Awaitable
import asyncio
from asyncio import IncompleteReadError, LimitOverrunError, StreamReader, StreamWriter, start_unix_server, AbstractServer
import json
import logging

logger = logging.getLogger()

BUFFER_LIMIT = 2 ** 20  # 1 MiB

class MessageListener:
	def __init__(self, path: str, callback: Callable[[Any]]):
		self._path = path
		self._callback = callback
		self._loop = asyncio.get_event_loop()
		self._running = False
	
	async def open(self):
		if self._socket is not None:
			if not self._running:
				logger.warn("called open while MessageListener was closing")
			else:
				logger.warn("called open when MessageListener was already open")
			return
		self._running = True
		self._socket = await start_unix_server(self._run, path=self._path, limit=BUFFER_LIMIT)
	
	async def close(self):
		if self._socket is None:
			return
		self._running = False
		self._socket.close()
		await self._socket.wait_closed()
		self._socket = None
	
	
	async def _run(self, reader: StreamReader, writer: StreamWriter):
		while self._running:
			line = bytearray()
			while True:
				try:
					line.extend(await reader.readuntil())
				except LimitOverrunError:
					line.extend(await reader.read(reader._limit))
					continue
				except IncompleteReadError as err:
					line.extend(err.partial)
					break
				else:
					break
			try:
				data = json.loads(line.decode("utf-8"))
			except BaseException as error:
				logger.error(str(error))
				continue
			self._loop.call_soon_threadsafe(lambda:self._callback(data))

