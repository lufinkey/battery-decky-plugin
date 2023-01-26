import os
import sys
import select
import asyncio
import json
import logging
import traceback
import threading
from dataclasses import dataclass
import typing
from typing import Any, Awaitable, IO, BinaryIO, Callable, Dict, Tuple

from utils import try_logexcept, AsyncValue

logger = logging.getLogger()

MSG_PREFIX_REQUEST = '>'
MSG_PREFIX_RESPONSE = '<'

RESPONSE_TYPE_RESULT = 'result'
RESPONSE_TYPE_ERROR = 'error'

MAX_REQUEST_IDS = 9999999

PipeTalkData = typing.Union[dict, list, int, float, None]

# Request
#  >{request_id}:{method_name}:{args}
#  request_id: a unique id for the request
#  method_name: the name of the method that should be called
#  data: a json representation of the request data

@dataclass
class PipeTalkRequest:
	request_id: str
	method_name: str
	data_str: str

	def get_data(self) -> PipeTalkData:
		if self.data_str is None:
			return None
		data_str = self.data_str.strip()
		if len(data_str) == 0:
			return None
		return json.loads(data_str)
	
	def set_data(self, data: PipeTalkData):
		if data is not None:
			self.data_str = json.dumps(data)
		else:
			self.data_str = None

	@classmethod
	def create(cls, request_id: str, method_name: str, data: PipeTalkData = None) -> 'PipeTalkRequest':
		if data is not None:
			data_str = json.dumps(data)
		else:
			data_str = None
		return PipeTalkRequest(
			request_id = request_id,
			method_name = method_name,
			data_str = data_str)

	@classmethod
	def parse(cls, line: str) -> 'PipeTalkRequest':
		line_len = len(line)
		if line_len == 0:
			raise ValueError("Empty line is not a valid request")
		if line[0] != MSG_PREFIX_REQUEST:
			raise ValueError("Unexpected message type {} for doesn't match expected type {} for request".format(line[0], MSG_PREFIX_REQUEST))
		elif line_len == 1:
			raise ValueError("Empty request is not valid")
		section_start = 1
		# parse request id
		colon_index = line.find(':', section_start)
		if colon_index == -1:
			return PipeTalkRequest(
				request_id = line[section_start:],
				method_name = None,
				data_str = None)
		req_id = line[section_start:colon_index]
		section_start = colon_index + 1
		# parse method name
		colon_index = line.find(':', section_start)
		if colon_index == -1:
			return PipeTalkRequest(
				request_id = req_id,
				method_name = line[section_start:].strip(),
				data_str = None)
		method_name = line[section_start:colon_index].strip()
		section_start = colon_index + 1
		# parse data
		data_str = line[section_start:]
		return PipeTalkRequest(
				request_id = req_id,
				method_name = method_name,
				data_str = data_str)
	
	def validate(self):
		if self.request_id is None:
			raise ValueError("missing request_id")
		if self.method_name is None:
			raise ValueError("missing method_name")
	
	def stringify(self) -> str:
		req_str = MSG_PREFIX_REQUEST
		# add request id
		req_str += self.request_id
		# bail if no method_name or data is available
		if self.method_name is None and self.data is None:
			return req_str
		# add method name
		req_str += ":"
		req_str += (self.method_name or "")
		# add data
		if self.data_str is not None and len(self.data_str) > 0:
			req_str += ":"
			req_str += self.data_str
		return req_str


# Response
#  <{request_id}:{response_type}:{data}
#  request_id: a unique id for the request
#  response_type: the type of response (result or error)
#  data: a json representation of the response data

@dataclass
class PipeTalkResponse:
	request_id: str
	response_type: str
	data_str: str

	def get_data(self) -> PipeTalkData:
		if self.data_str is None:
			return None
		data_str = self.data_str.strip()
		if len(data_str) == 0:
			return None
		return json.loads(data_str)
	
	def set_data(self, data: PipeTalkData):
		if data is not None:
			self.data_str = json.dumps(data)
		else:
			self.data_str = None
	
	def get_result_data(self) -> PipeTalkData:
		if self.response_type != RESPONSE_TYPE_RESULT:
			return None
		return self.get_data()
	
	def get_error_data(self) -> PipeTalkData:
		if self.response_type != RESPONSE_TYPE_ERROR:
			return None
		return self.get_data()
	
	def get_error(self) -> Exception:
		errordata = self.get_error_data()
		if errordata is None:
			return None
		if not isinstance(errordata, dict):
			logger.error("Unexpected type for error data: "+self.data_str)
			return RuntimeError("Unknown error")
		return PipeTalkRequestError.parse_dict(errordata)
	

	@classmethod
	def from_result_data(cls, request_id: str, result: PipeTalkData) -> 'PipeTalkResponse':
		if result is not None:
			data_str = json.dumps(result)
		else:
			data_str = None
		return PipeTalkResponse(
			request_id = request_id,
			response_type = RESPONSE_TYPE_RESULT,
			data_str = data_str)
	
	@classmethod
	def from_error_data(cls, request_id: str, error: PipeTalkData) -> 'PipeTalkResponse':
		return PipeTalkResponse(
			request_id = request_id,
			response_type = RESPONSE_TYPE_ERROR,
			data_str = json.dumps(error))
	
	@classmethod
	def from_error(cls, request_id: str, error: BaseException) -> 'PipeTalkResponse':
		errordata = error_to_pipetalkdata(error)
		return cls.from_error_data(request_id, errordata)

	@classmethod
	def parse(cls, line: str) -> 'PipeTalkResponse':
		line_len = len(line)
		if line_len == 0:
			raise ValueError("Empty line is not a valid response")
		elif line[0] != MSG_PREFIX_RESPONSE:
			raise ValueError("Unexpected message type {} for doesn't match expected type {} for response".format(line[0], MSG_PREFIX_REQUEST))
		elif line_len == 1:
			raise ValueError("Empty request is not valid")
		section_start = 1
		# parse request id
		colon_index = line.find(':', section_start)
		if colon_index == -1:
			return PipeTalkResponse(
				request_id = line[section_start:],
				response_type = None,
				data_str = None)
		req_id = line[section_start:colon_index]
		section_start = colon_index + 1
		# parse response type
		colon_index = line.find(':', section_start)
		if colon_index == -1:
			return PipeTalkResponse(
				request_id = req_id,
				response_type = line[section_start:].strip(),
				data_str = None)
		res_type = line[section_start:colon_index].strip()
		section_start = colon_index + 1
		# parse data
		data_str = line[section_start:]
		return PipeTalkResponse(
				request_id = req_id,
				response_type = res_type,
				data_str = data_str)
	
	def validate(self):
		if self.request_id is None:
			raise ValueError("missing request_id")
		if self.response_type is None:
			raise ValueError("missing response_type")
	
	def stringify(self) -> str:
		req_str = MSG_PREFIX_RESPONSE
		# add request id
		req_str += self.request_id
		# bail if no method_name or data is available
		if self.response_type is None and self.data is None:
			return req_str
		# add response type
		req_str += ":"
		req_str += (self.response_type or "")
		# add data
		if self.data_str is not None and len(self.data_str) > 0:
			req_str += ":"
			req_str += self.data_str
		return req_str



# Error
# {"m": "error message", "d": "full debug error (sometimes with stacktrace if possible)"}

class PipeTalkRequestError(Exception):
	def __init__(self, message: str, debug_message: str = None):
		super().__init__(message or "Request failed")
		self.message = message
		self.debug_message = debug_message
	
	def __str__(self) -> str:
		return self.debug_message or super().__str__()
		
	@staticmethod
	def parse_dict(data: dict) -> 'PipeTalkRequestError':
		msg = data.get("m", None)
		debug_msg = data.get("d", None)
		return PipeTalkRequestError(msg, debug_msg)

def error_to_pipetalkdata(error: BaseException) -> dict:
	msg = getattr(error, 'message', repr(error))
	debug_msg = "".join(traceback.format_exception(type(error), error, error.__traceback__))
	return {
		"m": msg,
		"d": debug_msg
	}



# Communicator

RequestHandler = Callable[[PipeTalkRequest],Awaitable[PipeTalkData]]

class PipeTalker:
	reader: IO
	writer: IO
	write_bytes: bool
	_quit_pipe_writer: int = None
	_quit_pipe_reader: int = None

	request_handler: RequestHandler = None

	_next_request_id: int = 0
	_loop: asyncio.AbstractEventLoop
	_reader_thread: threading.Thread = None
	_reader_finish_evt: asyncio.Event = None
	_running: bool = False
	_waiting_requests: Dict[str,Tuple[asyncio.AbstractEventLoop,asyncio.Event]] = dict()
	_responses: Dict[str,PipeTalkResponse] = dict()


	def __init__(self, reader: IO, writer: IO, request_handler: RequestHandler = None):
		self.reader = reader
		self.writer = writer
		self.request_handler = request_handler
	

	# start listening for requests/responses
	def listen(self):
		if self._reader_thread is not None:
			return
		loop = asyncio.get_event_loop()
		self._loop = loop
		# open quit pipe
		(quit_pipe_reader, quit_pipe_writer) = os.pipe()
		self._quit_pipe_writer = quit_pipe_writer
		self._quit_pipe_reader = quit_pipe_reader
		# create finish event for reader
		reader_finish_evt = asyncio.Event()
		self._reader_finish_evt = reader_finish_evt
		# start reader thread
		self._running = True
		self._reader_thread = threading.Thread(target=lambda:self._consume_reader(
			quit_pipe = quit_pipe_reader,
			finished_evt = reader_finish_evt,
			loop = loop))
		self._reader_thread.start()
	
	# stop listening for requests / responses
	async def unlisten(self):
		loop = self._loop
		finish_evt = self._reader_finish_evt
		thread = self._reader_thread
		quit_pipe_writer = self._quit_pipe_writer
		quit_pipe_reader = self._quit_pipe_reader
		if thread is None:
			return
		# unset running to stop reader loop
		self._running = False
		# write to quit pipe to stop blocking select.select call
		try:
			os.write(self._quit_pipe_writer, b'.')
		except BaseException as error:
			logger.exception(error)
		# wait for finish event and reader thread
		if finish_evt is not None:
			await finish_evt.wait()
		thread.join()
		# close quit pipe writer
		try:
			os.close(quit_pipe_writer)
		except BaseException as error:
			logger.error("Error closing quit pipe writer: "+str(error))
		# close quit pipe reader
		try:
			os.close(quit_pipe_reader)
		except BaseException as error:
			logger.error("Error closing quit pipe reader: "+str(error))
		# unset properties
		if self._quit_pipe_writer == quit_pipe_writer:
			self._quit_pipe_writer = None
		if self._quit_pipe_reader == quit_pipe_reader:
			self._quit_pipe_reader = None
		if self._reader_finish_evt is finish_evt:
			self._reader_finish_evt = None
		if self._reader_thread is thread:
			self._reader_thread = None
		if self._loop is loop:
			self._loop = None
	
	async def wait(self):
		finish_evt = self._reader_finish_evt
		if finish_evt is None:
			return
		await finish_evt.wait()

	async def send_request(self, method_name: str, data: PipeTalkData = None) -> PipeTalkResponse:
		# prepare request
		req_id = self._get_next_request_id()
		req = PipeTalkRequest.create(
			request_id = req_id,
			method_name = method_name,
			data = data)
		evtloop = asyncio.get_event_loop()
		evt = asyncio.Event()
		self._waiting_requests[req_id] = (evtloop, evt)
		# send request and wait for response
		try:
			self._write_request(req)
		except:
			self._waiting_requests.pop(req_id)
			raise
		await evt.wait()
		# get response
		res = self._responses.pop(req_id, None)
		self._waiting_requests.pop(req_id, None)
		return res
	
	async def request(self, method_name: str, data: PipeTalkData = None) -> PipeTalkData:
		res = await self.send_request(
			method_name = method_name,
			data = data)
		if res.response_type == RESPONSE_TYPE_RESULT:
			return res.get_result_data()
		elif res.response_type == RESPONSE_TYPE_ERROR:
			raise (res.get_error() or RuntimeError("Unknown error response"))
		else:
			raise RuntimeError("Unknown error response type "+res.response_type)
	
	
	
	def _increment_request_id(self):
		self._next_request_id += 1
		if self._next_request_id >= MAX_REQUEST_IDS:
			self._next_request_id = 0
	
	def _get_next_request_id(self) -> str:
		if len(self._waiting_requests) >= MAX_REQUEST_IDS:
			raise RuntimeError("Too many pending requests")
		next_id = str(self._next_request_id)
		self._increment_request_id()
		while next_id in self._waiting_requests or next_id in next_id in self._responses:
			next_id = str(self._next_request_id)
			self._increment_request_id()
		return next_id
	
	
	# consume output from the reader pipe
	def _consume_reader(self, quit_pipe: int, finished_evt: asyncio.Event, loop: asyncio.AbstractEventLoop):
		try:
			while self._running:
				# wait for readable pipe
				(readable, _, _) = select.select([self.reader, quit_pipe], [], [])
				if quit_pipe in readable:
					# quit pipe was written to, so listener loop needs to exit
					break
				# read line
				line = self.reader.readline()
				if isinstance(line, bytes):
					line: str = line.decode('utf8')
				if line and len(line) > 0:
					try:
						self._handle_reader_line(line)
					except BaseException as error:
						logger.exception(error)
		except BaseException as error:
			logger.exception(error)
		finally:
			# trigger finished event
			loop.call_soon_threadsafe(finished_evt.set)
	
	# handle a received line from the reader pipe
	def _handle_reader_line(self, line: str):
		# ignore if empty
		if len(line) == 0:
			return
		loop = self._loop
		# check message type
		msg_type = line[0]

		if msg_type == MSG_PREFIX_REQUEST:
			# request message
			req = PipeTalkRequest.parse(line)
			# check for request_id
			if req.request_id is None:
				logger.error("Received invalid request with no ID: "+line)
				return
			# validate request
			try:
				req.validate()
			except BaseException as error:
				# send error response
				res = PipeTalkResponse.from_error(req.request_id, error)
				loop.call_soon_threadsafe(try_logexcept, args=(lambda:self._write_response(res),))
				return
			# handle request on main loop
			loop.call_soon_threadsafe(lambda:loop.create_task(self._handle_request(req)))

		elif msg_type == MSG_PREFIX_RESPONSE:
			# response message
			res = PipeTalkResponse.parse(line)
			# check for request_id
			if res.request_id is None:
				logger.error("Received invalid response with no ID: "+line)
				return
			# handle response
			loop.call_soon_threadsafe(lambda:self._handle_response(res))

		else:
			logger.error("Unknown message type {} for input line: {}".format(msg_type, line))
	
	# handle a parsed request
	async def _handle_request(self, req: PipeTalkRequest):
		try:
			try:
				# ensure a request handler is available
				if self.request_handler is None:
					raise RuntimeError("No request handler available")
				# call request handler
				result = await self.request_handler(req)
				res = PipeTalkResponse.from_result_data(req.request_id, result)
			except BaseException as error:
				# handle error
				res = PipeTalkResponse.from_error(req.request_id, error)
			self._write_response(res)
		except BaseException as error:
			logger.exception(error)
	
	# handle a parsed response
	def _handle_response(self, res: PipeTalkResponse):
		try:
			# check for conflicting response
			req_id = res.request_id
			if req_id in self._responses:
				logger.error("cannot overwrite existing response for request_id "+req_id)
				return
			if req_id not in self._waiting_requests:
				logger.error("no waiting requests found matching response with request_id "+req_id)
				return
			# set response and trigger event
			(evtloop,evt) = self._waiting_requests[req_id]
			self._responses[res.request_id] = res
			evtloop.call_soon_threadsafe(evt.set)
		except BaseException as error:
			logger.exception(error)

	# writes a request to the writer pipe
	def _write_request(self, req: PipeTalkRequest):
		req_str = req.stringify()+"\n"
		if 'b' in self.writer.mode:
			self.writer.write(req_str.encode('utf8'))
		else:
			self.writer.write(req_str)
		self.writer.flush()
	
	# writes a response to the writer pipe
	def _write_response(self, res: PipeTalkResponse):
		res_str = res.stringify()+"\n"
		if 'b' in self.writer.mode:
			self.writer.write(res_str.encode('utf8'))
		else:
			self.writer.write(res_str)
		self.writer.flush()
