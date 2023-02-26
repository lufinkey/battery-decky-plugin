import os
import sys
# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code one directory up
# or add the `decky-loader/plugin` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky_plugin
PYTHON_LIB_DIR = '/usr/lib/python{}.{}'.format(sys.version_info[0], sys.version_info[1])
PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
PYTHON_PATHS = [
	PYTHON_LIB_DIR,
	PYTHON_LIB_DIR+'/lib-dynload',
	PYTHON_LIB_DIR+'/site-packages',
	PLUGIN_DIR+'/py_modules',
	PLUGIN_DIR+'/backend'
]
sys.path.extend(PYTHON_PATHS)

import asyncio
import subprocess
import logging
from dataclasses import dataclass
from typing import Any, Dict, Callable

logging.basicConfig(filename="/tmp/battery-analytics-decky-main.log",
					format='[BatteryAnalytics] %(asctime)s %(levelname)s %(message)s',
					filemode='w+',
					force=True)
logger=logging.getLogger()
logger.setLevel(logging.INFO) # can be changed to logging.DEBUG for debugging issues

from pipetalk import PipeTalker

class Plugin:
	proc: subprocess.Popen = None
	proc_pipetalker: PipeTalker = None
	
	# Asyncio-compatible long-running code, executed in a task when the plugin is loaded
	async def _main(self):
		logger.info("Loading Battery Analytics plugin")
		try:
			# start child process
			backend_path = PLUGIN_DIR+"/backend"
			procenv = os.environ.copy()
			procenv["PYTHONPATH"] = ":".join(PYTHON_PATHS)
			logger.info("starting subprocess "+backend_path)
			proc = subprocess.Popen(
				["python3", backend_path],
				env=procenv,
				stdin=subprocess.PIPE,
				stdout=subprocess.PIPE)
			self.proc = proc
			# attach child process pipetalker
			pipetalker = PipeTalker(
				reader = proc.stdout,
				writer = proc.stdin,
				request_handler = None)
			self.proc_pipetalker = pipetalker
			pipetalker.listen()
			# call _main
			await pipetalker.request("_main")
			logger.info("Done loading Battery Analytics plugin")
		except BaseException as error:
			logger.exception(error)
	
	# Function called first during the unload process, utilize this to handle your plugin being removed
	async def _unload(self):
		logger.info("Unloading Battery Analytics plugin")
		try:
			proc_pipetalker = self.proc_pipetalker
			proc = self.proc
			if proc is not None:
				if proc_pipetalker is not None:
					await proc_pipetalker.request("_unload")
				# kill child process
				proc.terminate()
				# wait for 3.5 seconds for process to die
				for i in range(35):
					if proc.poll() is not None:
						break
					await asyncio.sleep(0.1)
				# kill process if not dead
				if proc.poll() is None:
					proc.kill()
				if self.proc is proc:
					self.proc = None
			# wait for pipetalker to die
			if proc_pipetalker is not None:
				await proc_pipetalker.unlisten()
				if self.proc_pipetalker is proc_pipetalker:
					self.proc_pipetalker = None
			logger.info("Done unloading Battery Analytics plugin")
		except BaseException as error:
			logger.exception(error)
	
	async def get_battery_state_logs(self, **kwargs):
		try:
			proc_pipetalker = self.proc_pipetalker
			if proc_pipetalker is None:
				raise RuntimeError("No process pipetalker available")
			return await proc_pipetalker.request("get_battery_state_logs", kwargs)
		except BaseException as error:
			logger.exception(error)
	
	async def get_system_event_logs(self, **kwargs):
		try:
			proc_pipetalker = self.proc_pipetalker
			if proc_pipetalker is None:
				raise RuntimeError("No process pipetalker available")
			return await proc_pipetalker.request("get_system_event_logs", kwargs)
		except BaseException as error:
			logger.exception(error)
