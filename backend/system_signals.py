import sys
import signal
import asyncio
import dbussy
import datetime
import threading
import logging
from typing import Callable

logger = logging.getLogger()

def log_info(info: str):
	if __name__ == "__main__":
		print(info, file=sys.stderr)
	else:
		logger.info(info)

def log_warning(warning: str):
	if __name__ == "__main__":
		print("Warning: "+warning, file=sys.stderr)
	else:
		logger.warn(warning)

def log_error(error: str):
	if __name__ == "__main__":
		print(error, file=sys.stderr)
	else:
		logger.error(error)


class SystemSignalListener:
	_thread: threading.Thread = None
	_loop: asyncio.AbstractEventLoop = None
	_conn: dbussy.Connection = None
	_listening: bool = False
	
	on_system_suspend: Callable[[],None]
	on_system_resume: Callable[[],None]
	on_system_shutdown: Callable[[],None]

	def run(self):
		asyncio.set_event_loop(self._loop)
		self._loop.run_until_complete(self.run_async(loop=self._loop))
	
	async def run_async(self, loop: asyncio.AbstractEventLoop):
		iface_name = 'org.freedesktop.login1.Manager'
		bus_name = 'org.freedesktop.login1'
		try:
			if not self._listening:
				return
			# create dbus connection
			self._conn = await dbussy.Connection.bus_get_async(dbussy.DBUS.BUS_SESSION, private=True, loop=loop)
			self._conn.bus_add_match({
				"type": "signal",
				"interface": iface_name,
				"member": 'PrepareForSleep'
			})
			self._conn.bus_add_match({
				"type": "signal",
				"interface": iface_name,
				"member": 'PrepareForShutdown'
			})
			self._conn.enable_receive_message({dbussy.DBUS.MESSAGE_TYPE_SIGNAL})
			# listen for dbus messages
			while self._listening:
				# receive dbus message
				try:
					message: dbussy.Message = await self._conn.receive_message_async()
				except BaseException as error:
					# log error and delay for 2 seconds before retrying
					log_error("Error while receiving dbus message:\n"+str(error))
					for i in range(20):
						if not self._listening or self._conn is None:
							break
						await asyncio.sleep(0.1)
					continue
				# handle dbus message
				args = message.all_objects
				if message.member == 'PrepareForSleep':
					# handle sleep message
					if len(args) == 0:
						log_error("Invalid number of arguments for signal {}".format(message.member))
						continue
					arg: bool = args[0]
					if not isinstance(arg, bool):
						log_error("Invalid type {} for argument 0 of signal {}".format(str(type(arg)), message.member))
						continue
					self._on_sleep_signal(arg)
				elif message.member == 'PrepareForShutdown':
					# handle shutdown message
					if len(args) == 0:
						log_error("Invalid number of arguments for signal {}".format(message.member))
						continue
					arg: bool = args[0]
					if not isinstance(arg, bool):
						log_error("Invalid type {} for argument 0 of signal {}".format(str(type(arg)), message.member))
						continue
					self._on_shutdown_signal(arg)
		finally:
			# close dbus connection
			try:
				if self._conn is not None:
					self._conn.close()
					self._conn = None
			except BaseException as error:
				log_error("Error closing dbus connection: "+str(error))
	
	def _close_conn(self):
		try:
			if self._conn is not None:
				self._conn.close()
				self._conn = None
		except BaseException as error:
			log_error("Error while closing connection: "+str(error))

	
	def listen(self):
		if self._thread is not None and self._thread.is_alive():
			log_warning("Starting SystemSignalListener while already listening")
			return
		self._loop = asyncio.new_event_loop()
		self._thread = threading.Thread(target=self.run)
		self._listening = True
		self._thread.start()
	
	def unlisten(self):
		thread = self._thread
		if thread is None:
			return
		self._listening = False
		loop = self._loop
		if loop is not None:
			loop.call_soon_threadsafe(self._close_conn)
		thread.join()
		if loop is not None:
			loop.close()
		if thread is self._thread:
			self._thread = None
		if loop is self._loop:
			self._loop = None
	
	def wait(self):
		thread = self._thread
		if thread is not None:
			thread.join()
	
	async def wait_async(self):
		thread = self._thread
		while thread is not None and thread.is_alive():
			await asyncio.sleep(0.1)

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



# run test if executing directly
if __name__ == "__main__":
	def log_system_state(state: str):
		print(state+": "+datetime.datetime.utcnow().isoformat())

	def on_system_suspend():
		log_system_state("suspend")
	
	def on_system_resume():
		log_system_state("resume")
	
	def on_system_shutdown():
		log_system_state("shutdown")
	
	signal_listener = SystemSignalListener()
	signal_listener.on_system_suspend = on_system_suspend
	signal_listener.on_system_resume = on_system_resume
	signal_listener.on_system_shutdown = on_system_shutdown
	signal_listener.listen()

	def on_signal(sig, frame):
		log_info("signal {} received".format(str(sig)))
		signal_listener.unlisten()
	
	signal.signal(signal.SIGINT, on_signal)
	signal.signal(signal.SIGTERM, on_signal)

	asyncio.run(signal_listener.wait_async())
	log_info("finished listening for dbus signals")
