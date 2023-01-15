import os
import sys
import dbus
import logging
from typing import Callable

logger = logging.getLogger()

class SleepInhibitor:
	when_system_suspend: Callable = None
	when_system_resume: Callable = None

	when_system_shutdown: Callable = None

	def __init__(self):
		self.fd = None
		self.bus = dbus.SystemBus()
		self.proxy = self.bus.get_object( 'org.freedesktop.login1',
			'/org/freedesktop/login1' )
		self.login1 = dbus.Interface(self.proxy, 'org.freedesktop.login1.Manager')
		for signal in ['PrepareForSleep', 'PrepareForShutdown']:
			self.login1.connect_to_signal(signal, self.signal_handler, member_keyword='member')

	def inhibit(self):
		if self.fd is not None:
			logger.warn("Calling inhibit while already inhibiting")
		self.fd = self.login1.Inhibit( 'shutdown:sleep', 'battery-analytics-decky', 'logging before shutdown ...', 'delay' )
	
	def uninhibit(self):
		if not self.fd:
			return
		os.close( self.fd.take() )
		self.fd = None
	
	def signal_handler(self, suspending: bool, signal: str = None):
		if suspending:
			# going to suspend or shutdown
			logger.log("going down for suspend? "+str(signal))
			if signal == "PrepareForShutdown":
				# shutting down
				try:
					if self.when_system_shutdown is not None:
						self.when_system_shutdown()
				except BaseException as error:
					print(str(error), file=sys.stderr)
					logger.error(str(error))
			else:
				# sleeping
				try:
					if self.when_system_suspend is not None:
						self.when_system_suspend()
				except BaseException as error:
					print(str(error), file=sys.stderr)
					logger.error(str(error))
			self.uninhibit()
		else:
			# resuming from suspend
			if signal == 'PrepareForSleep':
				self.inhibit()
				try:
					if self.when_system_resume is not None:
						self.when_system_resume()
				except BaseException as error:
					print(str(error), file=sys.stderr)
					logger.error(str(error))
