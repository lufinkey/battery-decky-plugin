
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
