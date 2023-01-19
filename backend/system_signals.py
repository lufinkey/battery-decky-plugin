import sys
import asyncio
import dbussy
import datetime
import threading
import logging
from typing import Callable

logger = logging.getLogger()

class SystemSignalListener:
	_thread: threading.Thread = None
	_dbus_connection: dbussy.Connection = None
	_listening: bool = False

	on_system_suspend: Callable[[],None]
	on_system_resume: Callable[[],None]
	on_system_shutdown: Callable[[],None]

	def _run(self):
		loop = asyncio.new_event_loop()
		asyncio.set_event_loop(loop)
		try:
			loop.run_until_complete(self._run_async())
		finally:
			loop.close()
			loop = None
	
	async def _run_async(self, loop: asyncio.AbstractEventLoop):
		iface_name = 'org.freedesktop.login1.Manager'
		bus_name = 'org.freedesktop.login1'
		conn: dbussy.Connection = None
		try:
			# create dbus connection
			conn = await dbussy.Connection.bus_get_async(dbussy.DBUS.BUS_SESSION, private=False, loop=loop)
			conn.bus_add_match({
				"type": "signal",
				"interface": iface_name,
				"member": 'PrepareForSleep'
			})
			conn.bus_add_match({
				"type": "signal",
				"interface": iface_name,
				"member": 'PrepareForShutdown'
			})
			conn.enable_receive_message({dbussy.DBUS.MESSAGE_TYPE_SIGNAL})
			# listen for dbus messages
			while self._listening:
				# receive dbus message
				try:
					message: dbussy.Message = await conn.receive_message_async()
				except BaseException as error:
					# log error and delay for 2 seconds before retrying
					logger.error("Error while receiving dbus message:\n"+str(error))
					for i in range(20):
						await asyncio.sleep(0.1)
						if not self._listening:
							break
					continue
				# handle dbus message
				args = message.all_objects
				if message.member == 'PrepareForSleep':
					# handle sleep message
					if len(args) == 0:
						logger.error("Invalid number of arguments for signal {}".format(message.member))
						continue
					arg: bool = args[0]
					if not isinstance(arg, bool):
						logger.error("Invalid type {} for argument 0 of signal {}".format(str(type(arg)), message.member))
						continue
					self._on_sleep_signal(arg)
				elif message.member == 'PrepareForShutdown':
					# handle shutdown message
					if len(args) == 0:
						logger.error("Invalid number of arguments for signal {}".format(message.member))
						continue
					arg: bool = args[0]
					if not isinstance(arg, bool):
						logger.error("Invalid type {} for argument 0 of signal {}".format(str(type(arg)), message.member))
						continue
					self._on_shutdown_signal(arg)
		except BaseException as error:
			# close dbus connection
			try:
				if conn is not None:
					conn.close()
					conn = None
			except BaseException as error:
				logger.error("Error closing dbus connection: "+str(error))

	
	def listen(self):
		if self._thread is not None and self._thread.is_alive():
			logger.warn("Starting SystemSignalListener while already listening")
			return
		self._thread = threading.Thread(self._run)
		self._thread.start()

	def unlisten(self):
		thread = self._thread
		if thread is None:
			return
		self._listening = False
		thread.join()
		if thread is self._thread:
			self._thread = None

	def _on_sleep_signal(self, arg):
		if arg:
			if self.on_system_suspend is not None:
				self.on_system_suspend()
		else:
			if self.on_system_resume is not None:
				self.on_system_resume()

	def _on_shutdown_signal(self, arg):
		if arg:
			if self.on_system_shutdown is not None:
				self.on_system_shutdown()
