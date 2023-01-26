import os
import sys
import asyncio
import signal
import logging
import inspect
from typing import Set, Tuple, Awaitable

logging.basicConfig(filename="/tmp/battery-analytics-decky.log",
					format='[BatteryAnalytics] %(asctime)s %(levelname)s %(message)s',
					filemode='w+',
					force=True)
logger=logging.getLogger()
logger.setLevel(logging.INFO) # can be changed to logging.DEBUG for debugging issues

from utils import try_logexcept_awaitable
from pipetalk import PipeTalker, PipeTalkRequest, PipeTalkData
from plugin import Plugin

current_tasks: Set[Tuple[str,Awaitable]] = set()

async def handle_request(req: PipeTalkRequest) -> PipeTalkData:
	req_data = req.get_data()
	if req_data is None:
		req_data = dict()
	elif not isinstance(req_data, dict):
		raise ValueError("Invalid request data type "+str(type(req_data)))
	return await call_plugin_method(req.method_name, req_data)


async def call_plugin_method(name: str, kwargs: dict):
	global plugin
	global current_tasks
	func = getattr(plugin, name)
	if asyncio.iscoroutinefunction(func):
		task = func(**kwargs)
		task_tuple = (name, task)
		current_tasks.add(task_tuple)
		try:
			return await task
		finally:
			current_tasks.remove(task_tuple)
	else:
		return func(**kwargs)

async def run():
	global current_tasks
	global plugin
	try:
		loop = asyncio.get_event_loop()
		pipetalker = PipeTalker(
			reader=sys.stdin,
			writer=sys.stdout,
			request_handler=lambda res:handle_request(res))
		
		# handle signals
		def on_signal(sig):
			logger.info("signal {} received".format(str(sig)))
			asyncio.create_task(try_logexcept_awaitable(pipetalker.unlisten()))
		for sig in (signal.SIGINT, signal.SIGTERM):
			loop.add_signal_handler(sig, lambda s=sig:on_signal(int(s)))
		
		# start listening for input
		pipetalker.listen()
		await pipetalker.wait()
		
		# unload plugin or wait for unload to finish
		if plugin.started:
			await plugin._unload()
		else:
			# search for _unload tasks and await them
			remaining_tasks = current_tasks.copy()
			for (task_name, task) in remaining_tasks:
				if task_name == "_unload":
					await task
	except BaseException as error:
		logger.exception(error)

plugin = Plugin()

logger.info("running plugin")
asyncio.run(run())
