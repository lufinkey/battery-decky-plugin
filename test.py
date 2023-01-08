#!/usr/bin/env python3

import sys
import asyncio
import logging
from upower_monitor import UPowerMonitor;

logging.basicConfig(stream=sys.stdout, level=logging.INFO)

async def run_tests():
	monitor = UPowerMonitor()
	print("starting search for devices")
	await monitor.start()
	await asyncio.sleep(50)
	await monitor.stop()
	await asyncio.sleep(5)
	for device_name in monitor.device_infos:
		print("found device "+device_name+"\n"+str(monitor.device_infos[device_name]))

asyncio.run(run_tests())
