import * as monaco from 'monaco-editor';
import type { FileSystemProvider } from '@hestia/core';
import type { IPlugin } from '../monaco';

// ── URI / VFS path helpers ────────────────────────────────────────────────────

function uriToVfsPath(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function dirOf(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '/';
}

// ── Symbol types ──────────────────────────────────────────────────────────────

interface PySymbol {
  name: string;
  kind: monaco.languages.CompletionItemKind;
  detail?: string;
  doc?: string;
  /** Return type name — used by inferLocalTypes to resolve `r = mod.func()` → class */
  returns?: string;
}

// ── Python builtins ───────────────────────────────────────────────────────────

const CK = monaco.languages.CompletionItemKind;

const PYTHON_BUILTINS: PySymbol[] = [
  // Functions
  { name: 'print', kind: CK.Function, detail: 'print(*objects, sep=" ", end="\\n", file=sys.stdout, flush=False)', doc: 'Print objects to the text stream.' },
  { name: 'len', kind: CK.Function, detail: 'len(s)', doc: 'Return the number of items in an object.' },
  { name: 'range', kind: CK.Function, detail: 'range(stop) / range(start, stop[, step])', doc: 'Return a range object.' },
  { name: 'list', kind: CK.Class, detail: 'list([iterable])', doc: 'Create a new list.' },
  { name: 'dict', kind: CK.Class, detail: 'dict(**kwarg)', doc: 'Create a new dictionary.' },
  { name: 'set', kind: CK.Class, detail: 'set([iterable])', doc: 'Create a new set.' },
  { name: 'tuple', kind: CK.Class, detail: 'tuple([iterable])', doc: 'Create a new tuple.' },
  { name: 'str', kind: CK.Class, detail: 'str(object="")', doc: 'Create a new string.' },
  { name: 'int', kind: CK.Class, detail: 'int(x=0, base=10)', doc: 'Create a new integer.' },
  { name: 'float', kind: CK.Class, detail: 'float(x=0.0)', doc: 'Create a new float.' },
  { name: 'bool', kind: CK.Class, detail: 'bool(x=False)', doc: 'Create a boolean value.' },
  { name: 'bytes', kind: CK.Class, detail: 'bytes(source)', doc: 'Create an immutable bytes object.' },
  { name: 'bytearray', kind: CK.Class, detail: 'bytearray(source)', doc: 'Create a mutable bytearray.' },
  { name: 'type', kind: CK.Function, detail: 'type(object)', doc: 'Return the type of an object.' },
  { name: 'isinstance', kind: CK.Function, detail: 'isinstance(object, classinfo)', doc: 'Return True if object is an instance of classinfo.' },
  { name: 'issubclass', kind: CK.Function, detail: 'issubclass(class, classinfo)', doc: 'Return True if class is a subclass of classinfo.' },
  { name: 'hasattr', kind: CK.Function, detail: 'hasattr(object, name)', doc: 'Return True if object has the named attribute.' },
  { name: 'getattr', kind: CK.Function, detail: 'getattr(object, name[, default])', doc: 'Get a named attribute from an object.' },
  { name: 'setattr', kind: CK.Function, detail: 'setattr(object, name, value)', doc: 'Set a named attribute on an object.' },
  { name: 'delattr', kind: CK.Function, detail: 'delattr(object, name)', doc: 'Delete the named attribute from the object.' },
  { name: 'open', kind: CK.Function, detail: 'open(file, mode="r", encoding=None)', doc: 'Open file and return a stream.' },
  { name: 'input', kind: CK.Function, detail: 'input(prompt="")', doc: 'Read a string from standard input.' },
  { name: 'abs', kind: CK.Function, detail: 'abs(x)', doc: 'Return the absolute value of a number.' },
  { name: 'max', kind: CK.Function, detail: 'max(iterable) / max(*args)', doc: 'Return the largest item.' },
  { name: 'min', kind: CK.Function, detail: 'min(iterable) / min(*args)', doc: 'Return the smallest item.' },
  { name: 'sum', kind: CK.Function, detail: 'sum(iterable, start=0)', doc: 'Return the sum of items.' },
  { name: 'sorted', kind: CK.Function, detail: 'sorted(iterable, key=None, reverse=False)', doc: 'Return a new sorted list.' },
  { name: 'reversed', kind: CK.Function, detail: 'reversed(seq)', doc: 'Return a reverse iterator.' },
  { name: 'enumerate', kind: CK.Function, detail: 'enumerate(iterable, start=0)', doc: 'Return an enumerate object.' },
  { name: 'zip', kind: CK.Function, detail: 'zip(*iterables)', doc: 'Make an iterator that aggregates elements.' },
  { name: 'map', kind: CK.Function, detail: 'map(function, iterable)', doc: 'Return an iterator that applies function to every item.' },
  { name: 'filter', kind: CK.Function, detail: 'filter(function, iterable)', doc: 'Return an iterator yielding items for which function returns True.' },
  { name: 'any', kind: CK.Function, detail: 'any(iterable)', doc: 'Return True if any element is true.' },
  { name: 'all', kind: CK.Function, detail: 'all(iterable)', doc: 'Return True if all elements are true.' },
  { name: 'next', kind: CK.Function, detail: 'next(iterator[, default])', doc: 'Retrieve the next item from the iterator.' },
  { name: 'iter', kind: CK.Function, detail: 'iter(object)', doc: 'Return an iterator object.' },
  { name: 'id', kind: CK.Function, detail: 'id(object)', doc: 'Return the identity of an object.' },
  { name: 'hash', kind: CK.Function, detail: 'hash(object)', doc: 'Return the hash value of the object.' },
  { name: 'hex', kind: CK.Function, detail: 'hex(x)', doc: 'Convert an integer to a lowercase hexadecimal string.' },
  { name: 'oct', kind: CK.Function, detail: 'oct(x)', doc: 'Convert an integer to an octal string.' },
  { name: 'bin', kind: CK.Function, detail: 'bin(x)', doc: 'Convert an integer to a binary string.' },
  { name: 'ord', kind: CK.Function, detail: 'ord(c)', doc: 'Return the Unicode code point for the given character.' },
  { name: 'chr', kind: CK.Function, detail: 'chr(i)', doc: 'Return the string representing a character whose Unicode code point is i.' },
  { name: 'repr', kind: CK.Function, detail: 'repr(object)', doc: 'Return a string representation of the object.' },
  { name: 'vars', kind: CK.Function, detail: 'vars([object])', doc: 'Return the __dict__ attribute for the object.' },
  { name: 'dir', kind: CK.Function, detail: 'dir([object])', doc: 'Return a list of names in the current local scope or attributes of object.' },
  { name: 'callable', kind: CK.Function, detail: 'callable(object)', doc: 'Return True if the object appears callable.' },
  { name: 'super', kind: CK.Function, detail: 'super([type[, object]])', doc: 'Return a proxy object delegating method calls to a parent class.' },
  { name: 'object', kind: CK.Class, detail: 'object()', doc: 'Base class for all classes.' },
  { name: 'property', kind: CK.Function, detail: 'property(fget=None, fset=None, fdel=None, doc=None)', doc: 'Return a property attribute.' },
  { name: 'staticmethod', kind: CK.Function, detail: 'staticmethod(function)', doc: 'Transform a method into a static method.' },
  { name: 'classmethod', kind: CK.Function, detail: 'classmethod(function)', doc: 'Transform a method into a class method.' },
  { name: 'round', kind: CK.Function, detail: 'round(number[, ndigits])', doc: 'Round a number to a given precision.' },
  { name: 'pow', kind: CK.Function, detail: 'pow(base, exp[, mod])', doc: 'Return base to the power exp.' },
  { name: 'divmod', kind: CK.Function, detail: 'divmod(a, b)', doc: 'Return a pair (a // b, a % b).' },
  { name: 'globals', kind: CK.Function, detail: 'globals()', doc: 'Return a dictionary of the global symbol table.' },
  { name: 'locals', kind: CK.Function, detail: 'locals()', doc: 'Return the local symbol table.' },
  { name: 'exec', kind: CK.Function, detail: 'exec(object)', doc: 'Execute dynamically created Python code.' },
  { name: 'eval', kind: CK.Function, detail: 'eval(expression)', doc: 'Evaluate a Python expression.' },
  { name: 'compile', kind: CK.Function, detail: 'compile(source, filename, mode)', doc: 'Compile source into a code object.' },
  { name: 'format', kind: CK.Function, detail: 'format(value[, format_spec])', doc: 'Convert a value to a formatted representation.' },
  { name: 'memoryview', kind: CK.Class, detail: 'memoryview(obj)', doc: 'Create a memory view object.' },
  // Exceptions
  { name: 'Exception', kind: CK.Class, detail: 'Exception', doc: 'Base class for non-system exceptions.' },
  { name: 'ValueError', kind: CK.Class, detail: 'ValueError', doc: 'Raised when an operation receives an argument with the right type but wrong value.' },
  { name: 'TypeError', kind: CK.Class, detail: 'TypeError', doc: 'Raised when an operation is applied to an object of inappropriate type.' },
  { name: 'KeyError', kind: CK.Class, detail: 'KeyError', doc: 'Raised when a mapping key is not found.' },
  { name: 'IndexError', kind: CK.Class, detail: 'IndexError', doc: 'Raised when a sequence index is out of range.' },
  { name: 'AttributeError', kind: CK.Class, detail: 'AttributeError', doc: 'Raised when attribute reference or assignment fails.' },
  { name: 'ImportError', kind: CK.Class, detail: 'ImportError', doc: 'Raised when an import statement fails.' },
  { name: 'OSError', kind: CK.Class, detail: 'OSError', doc: 'Raised when a system-related operation fails.' },
  { name: 'IOError', kind: CK.Class, detail: 'IOError', doc: 'Alias for OSError.' },
  { name: 'RuntimeError', kind: CK.Class, detail: 'RuntimeError', doc: 'Raised when an error does not fall in any other category.' },
  { name: 'StopIteration', kind: CK.Class, detail: 'StopIteration', doc: 'Raised by an iterator when no more items are produced.' },
  { name: 'StopAsyncIteration', kind: CK.Class, detail: 'StopAsyncIteration', doc: 'Raised by an async iterator when no more items are produced.' },
  { name: 'NotImplementedError', kind: CK.Class, detail: 'NotImplementedError', doc: 'Raised when an abstract method is not implemented.' },
  { name: 'MemoryError', kind: CK.Class, detail: 'MemoryError', doc: 'Raised when an operation runs out of memory.' },
  { name: 'OverflowError', kind: CK.Class, detail: 'OverflowError', doc: 'Raised when an arithmetic operation exceeds limits.' },
  { name: 'ZeroDivisionError', kind: CK.Class, detail: 'ZeroDivisionError', doc: 'Raised when division by zero is attempted.' },
  { name: 'FileNotFoundError', kind: CK.Class, detail: 'FileNotFoundError', doc: 'Raised when a file is not found.' },
  { name: 'PermissionError', kind: CK.Class, detail: 'PermissionError', doc: 'Raised when an operation is not permitted.' },
  { name: 'TimeoutError', kind: CK.Class, detail: 'TimeoutError', doc: 'Raised when a system function times out.' },
  { name: 'KeyboardInterrupt', kind: CK.Class, detail: 'KeyboardInterrupt', doc: 'Raised when the user presses Ctrl+C.' },
  { name: 'SystemExit', kind: CK.Class, detail: 'SystemExit', doc: 'Raised by sys.exit().' },
  { name: 'AssertionError', kind: CK.Class, detail: 'AssertionError', doc: 'Raised when an assert statement fails.' },
  { name: 'NameError', kind: CK.Class, detail: 'NameError', doc: 'Raised when a name is not found.' },
  { name: 'SyntaxError', kind: CK.Class, detail: 'SyntaxError', doc: 'Raised when a syntax error is encountered.' },
  { name: 'UnicodeError', kind: CK.Class, detail: 'UnicodeError', doc: 'Raised when a Unicode-related error occurs.' },
  { name: 'UnicodeDecodeError', kind: CK.Class, detail: 'UnicodeDecodeError', doc: 'Raised when decoding with a codec fails.' },
  { name: 'UnicodeEncodeError', kind: CK.Class, detail: 'UnicodeEncodeError', doc: 'Raised when encoding with a codec fails.' },
  // Constants
  { name: 'True', kind: CK.Constant, detail: 'True', doc: 'Boolean true.' },
  { name: 'False', kind: CK.Constant, detail: 'False', doc: 'Boolean false.' },
  { name: 'None', kind: CK.Constant, detail: 'None', doc: 'The None object.' },
  { name: 'NotImplemented', kind: CK.Constant, detail: 'NotImplemented', doc: 'Should be returned when binary operations are not implemented.' },
  { name: 'Ellipsis', kind: CK.Constant, detail: 'Ellipsis', doc: 'The Ellipsis object (...).' },
  { name: '__name__', kind: CK.Variable, detail: '__name__: str', doc: 'Name of the module.' },
  { name: '__file__', kind: CK.Variable, detail: '__file__: str', doc: 'Path to the file.' },
  { name: '__doc__', kind: CK.Variable, detail: '__doc__: str', doc: 'Module docstring.' },
];

// ── MicroPython / Python stdlib module stubs ─────────────────────────────────

type ModuleMap = Record<string, PySymbol[]>;

const MODULE_STUBS: ModuleMap = {
  machine: [
    { name: 'Pin', kind: CK.Class, detail: 'Pin(id, mode=-1, pull=-1, value=None, alt=-1)', doc: 'Access and control I/O pins. `mode`: `Pin.IN`, `Pin.OUT`, `Pin.OPEN_DRAIN`. `pull`: `Pin.PULL_UP`, `Pin.PULL_DOWN`, `Pin.PULL_HOLD`.' },
    { name: 'ADC', kind: CK.Class, detail: 'ADC(id)', doc: 'Provides an interface to analog-to-digital converters.' },
    { name: 'PWM', kind: CK.Class, detail: 'PWM(pin, freq=None, duty_u16=None, duty_ns=None)', doc: 'Provides Pulse Width Modulation output.' },
    { name: 'UART', kind: CK.Class, detail: 'UART(id, baudrate=9600, bits=8, parity=None, stop=1, tx=None, rx=None)', doc: 'Full duplex serial protocol.' },
    { name: 'SPI', kind: CK.Class, detail: 'SPI(id, baudrate=1000000, polarity=0, phase=0, bits=8, firstbit=SPI.MSB, sck=None, mosi=None, miso=None)', doc: 'Serial Peripheral Interface bus.' },
    { name: 'I2C', kind: CK.Class, detail: 'I2C(id, scl=None, sda=None, freq=400000)', doc: 'Two-wire serial protocol.' },
    { name: 'SoftI2C', kind: CK.Class, detail: 'SoftI2C(scl, sda, freq=400000, timeout=50000)', doc: 'Software-based I2C implementation.' },
    { name: 'SoftSPI', kind: CK.Class, detail: 'SoftSPI(baudrate=500000, polarity=0, phase=0, bits=8, firstbit=SPI.MSB, sck=None, mosi=None, miso=None)', doc: 'Software-based SPI implementation.' },
    { name: 'Timer', kind: CK.Class, detail: 'Timer(id=-1, mode=Timer.PERIODIC, period=-1, callback=None)', doc: 'Hardware timer.' },
    { name: 'RTC', kind: CK.Class, detail: 'RTC()', doc: 'Real-time clock.' },
    { name: 'WDT', kind: CK.Class, detail: 'WDT(id=0, timeout=5000)', doc: 'Watchdog timer. Resets the system if not fed.' },
    { name: 'reset', kind: CK.Function, detail: 'reset()', doc: 'Performs a hard reset of the device.' },
    { name: 'soft_reset', kind: CK.Function, detail: 'soft_reset()', doc: 'Performs a soft reset of the interpreter.' },
    { name: 'reset_cause', kind: CK.Function, detail: 'reset_cause() -> int', doc: 'Returns the reset cause.' },
    { name: 'freq', kind: CK.Function, detail: 'freq(hz?) -> int', doc: 'Returns the CPU running frequency, or sets it if hz is given.' },
    { name: 'enable_irq', kind: CK.Function, detail: 'enable_irq(state)', doc: 'Re-enable interrupt requests. Returns the previous IRQ state.' },
    { name: 'disable_irq', kind: CK.Function, detail: 'disable_irq() -> state', doc: 'Disables interrupt requests. Returns previous IRQ state.' },
    { name: 'idle', kind: CK.Function, detail: 'idle()', doc: 'Gates the clock to the CPU, useful for reducing power consumption.' },
    { name: 'sleep', kind: CK.Function, detail: 'sleep()', doc: 'Stops execution to reduce power consumption (deep sleep until interrupt).' },
    { name: 'deepsleep', kind: CK.Function, detail: 'deepsleep(time_ms?)', doc: 'Stops execution in an attempt to enter a low power state. Device wakes after time_ms ms.' },
    { name: 'lightsleep', kind: CK.Function, detail: 'lightsleep(time_ms?)', doc: 'Light sleep. Execution resumes from the point where it was stopped.' },
    { name: 'unique_id', kind: CK.Function, detail: 'unique_id() -> bytes', doc: 'Returns a byte string with a unique identifier of a board/SoC.' },
    { name: 'time_pulse_us', kind: CK.Function, detail: 'time_pulse_us(pin, pulse_level, timeout_us=1000000)', doc: 'Time a pulse on the given pin.' },
    { name: 'bitstream', kind: CK.Function, detail: 'bitstream(pin, encoding, timing, data)', doc: 'Transmits data by bit-banging the specified pin.' },
    { name: 'mem8', kind: CK.Variable, detail: 'mem8: IndexedMemory', doc: 'Read/write 8-bit memory.' },
    { name: 'mem16', kind: CK.Variable, detail: 'mem16: IndexedMemory', doc: 'Read/write 16-bit memory.' },
    { name: 'mem32', kind: CK.Variable, detail: 'mem32: IndexedMemory', doc: 'Read/write 32-bit memory.' },
    { name: 'IN', kind: CK.Constant, detail: 'Pin.IN = 1', doc: 'Pin mode: input.' },
    { name: 'OUT', kind: CK.Constant, detail: 'Pin.OUT = 3', doc: 'Pin mode: output.' },
    { name: 'OPEN_DRAIN', kind: CK.Constant, detail: 'Pin.OPEN_DRAIN = 7', doc: 'Pin mode: open drain.' },
    { name: 'PULL_UP', kind: CK.Constant, detail: 'Pin.PULL_UP = 1', doc: 'Enable pull-up resistor.' },
    { name: 'PULL_DOWN', kind: CK.Constant, detail: 'Pin.PULL_DOWN = 2', doc: 'Enable pull-down resistor.' },
    { name: 'PULL_HOLD', kind: CK.Constant, detail: 'Pin.PULL_HOLD = 4', doc: 'Enable pull hold.' },
    { name: 'IRQ_RISING', kind: CK.Constant, detail: 'Pin.IRQ_RISING', doc: 'Trigger on rising edge.' },
    { name: 'IRQ_FALLING', kind: CK.Constant, detail: 'Pin.IRQ_FALLING', doc: 'Trigger on falling edge.' },
    { name: 'PWROFF', kind: CK.Constant, detail: 'machine.PWROFF', doc: 'Power off reset cause.' },
    { name: 'HARD_RESET', kind: CK.Constant, detail: 'machine.HARD_RESET', doc: 'Hard reset cause.' },
    { name: 'WDT_RESET', kind: CK.Constant, detail: 'machine.WDT_RESET', doc: 'Watchdog reset cause.' },
    { name: 'DEEPSLEEP_RESET', kind: CK.Constant, detail: 'machine.DEEPSLEEP_RESET', doc: 'Deep sleep reset cause.' },
    { name: 'SOFT_RESET', kind: CK.Constant, detail: 'machine.SOFT_RESET', doc: 'Soft reset cause.' },
  ],

  network: [
    { name: 'WLAN', kind: CK.Class, detail: 'WLAN(interface_id)', doc: 'Provides a driver for WiFi network processors.' },
    { name: 'STA_IF', kind: CK.Constant, detail: 'network.STA_IF = 0', doc: 'Station (client) interface — connects to an access point.' },
    { name: 'AP_IF', kind: CK.Constant, detail: 'network.AP_IF = 1', doc: 'Access point interface — accepts connections from clients.' },
  ],

  time: [
    { name: 'sleep', kind: CK.Function, detail: 'sleep(secs)', doc: 'Sleep for the given number of seconds.' },
    { name: 'sleep_ms', kind: CK.Function, detail: 'sleep_ms(ms)', doc: 'Delay for given number of milliseconds.' },
    { name: 'sleep_us', kind: CK.Function, detail: 'sleep_us(us)', doc: 'Delay for given number of microseconds.' },
    { name: 'ticks_ms', kind: CK.Function, detail: 'ticks_ms() -> int', doc: 'Returns an increasing millisecond counter (wraps around).' },
    { name: 'ticks_us', kind: CK.Function, detail: 'ticks_us() -> int', doc: 'Returns an increasing microsecond counter (wraps around).' },
    { name: 'ticks_cpu', kind: CK.Function, detail: 'ticks_cpu() -> int', doc: 'Returns an increasing CPU cycle counter (wraps around).' },
    { name: 'ticks_add', kind: CK.Function, detail: 'ticks_add(ticks, delta) -> int', doc: 'Offset ticks value by a given number.' },
    { name: 'ticks_diff', kind: CK.Function, detail: 'ticks_diff(ticks1, ticks2) -> int', doc: 'Measure ticks difference. Returns signed value.' },
    { name: 'time', kind: CK.Function, detail: 'time() -> int', doc: 'Returns the number of seconds since the Epoch (2000-01-01).' },
    { name: 'time_ns', kind: CK.Function, detail: 'time_ns() -> int', doc: 'Returns the number of nanoseconds since the Epoch.' },
    { name: 'gmtime', kind: CK.Function, detail: 'gmtime([secs]) -> tuple', doc: 'Convert a time expressed in seconds to a tuple (year, month, mday, hour, min, sec, weekday, yearday).' },
    { name: 'localtime', kind: CK.Function, detail: 'localtime([secs]) -> tuple', doc: 'Like gmtime() but converts to local time.' },
    { name: 'mktime', kind: CK.Function, detail: 'mktime(t) -> int', doc: 'Inverse of localtime(). Returns seconds since the Epoch.' },
  ],

  utime: [], // alias — filled after definition

  json: [
    { name: 'loads', kind: CK.Function, detail: 'loads(str) -> object', doc: 'Parse the JSON str and return a Python object.' },
    { name: 'dumps', kind: CK.Function, detail: 'dumps(obj, separators=None) -> str', doc: 'Return the JSON representation of obj as a str.' },
    { name: 'load', kind: CK.Function, detail: 'load(stream) -> object', doc: 'Parse JSON from a file-like object.' },
    { name: 'dump', kind: CK.Function, detail: 'dump(obj, stream)', doc: 'Write JSON representation of obj to stream.' },
  ],

  ujson: [], // alias

  os: [
    { name: 'listdir', kind: CK.Function, detail: 'listdir([dir="/"]) -> list', doc: 'List the contents of the directory.' },
    { name: 'mkdir', kind: CK.Function, detail: 'mkdir(path)', doc: 'Create a new directory.' },
    { name: 'rmdir', kind: CK.Function, detail: 'rmdir(path)', doc: 'Remove a directory.' },
    { name: 'remove', kind: CK.Function, detail: 'remove(path)', doc: 'Remove a file.' },
    { name: 'rename', kind: CK.Function, detail: 'rename(old_path, new_path)', doc: 'Rename a file.' },
    { name: 'getcwd', kind: CK.Function, detail: 'getcwd() -> str', doc: 'Get the current directory.' },
    { name: 'chdir', kind: CK.Function, detail: 'chdir(path)', doc: 'Change the current directory.' },
    { name: 'stat', kind: CK.Function, detail: 'stat(path) -> tuple', doc: 'Get the status of a file or directory.' },
    { name: 'statvfs', kind: CK.Function, detail: 'statvfs(path) -> tuple', doc: 'Get the status of a filesystem.' },
    { name: 'ilistdir', kind: CK.Function, detail: 'ilistdir([dir]) -> iterator', doc: 'List directory, returning an iterator of tuples (name, type, inode, size).' },
    { name: 'sync', kind: CK.Function, detail: 'sync()', doc: 'Sync all filesystems.' },
    { name: 'urandom', kind: CK.Function, detail: 'urandom(n) -> bytes', doc: 'Return n random bytes.' },
    { name: 'dupterm', kind: CK.Function, detail: 'dupterm(stream_object, index=0)', doc: 'Duplicate or switch the MicroPython terminal.' },
    { name: 'mount', kind: CK.Function, detail: 'mount(fsobj, mount_point, readonly=False)', doc: 'Mount a filesystem.' },
    { name: 'umount', kind: CK.Function, detail: 'umount(path)', doc: 'Unmount a filesystem.' },
    { name: 'sep', kind: CK.Constant, detail: 'os.sep = "/"', doc: 'Path separator.' },
    { name: 'O_RDONLY', kind: CK.Constant, detail: 'os.O_RDONLY', doc: 'Open for reading only.' },
    { name: 'O_WRONLY', kind: CK.Constant, detail: 'os.O_WRONLY', doc: 'Open for writing only.' },
    { name: 'O_RDWR', kind: CK.Constant, detail: 'os.O_RDWR', doc: 'Open for reading and writing.' },
    { name: 'O_CREAT', kind: CK.Constant, detail: 'os.O_CREAT', doc: 'Create file if it does not exist.' },
    { name: 'O_TRUNC', kind: CK.Constant, detail: 'os.O_TRUNC', doc: 'Truncate file to zero length.' },
    { name: 'O_APPEND', kind: CK.Constant, detail: 'os.O_APPEND', doc: 'Writes append to file.' },
  ],

  uos: [], // alias

  sys: [
    { name: 'exit', kind: CK.Function, detail: 'exit([retval=0])', doc: 'Raise SystemExit with the given retval.' },
    { name: 'print_exception', kind: CK.Function, detail: 'print_exception(exc, file=sys.stdout)', doc: 'Print exception with a traceback.' },
    { name: 'path', kind: CK.Variable, detail: 'sys.path: list[str]', doc: 'List of directories searched for modules.' },
    { name: 'modules', kind: CK.Variable, detail: 'sys.modules: dict', doc: 'Dictionary of loaded modules.' },
    { name: 'version', kind: CK.Variable, detail: 'sys.version: str', doc: 'Python version as a string.' },
    { name: 'version_info', kind: CK.Variable, detail: 'sys.version_info: tuple', doc: 'Python version as a tuple.' },
    { name: 'implementation', kind: CK.Variable, detail: 'sys.implementation', doc: 'Implementation information.' },
    { name: 'platform', kind: CK.Variable, detail: 'sys.platform: str', doc: 'Platform identifier.' },
    { name: 'byteorder', kind: CK.Variable, detail: 'sys.byteorder: str', doc: '"little" or "big".' },
    { name: 'maxsize', kind: CK.Variable, detail: 'sys.maxsize: int', doc: 'Maximum value a native integer type can hold.' },
    { name: 'stdin', kind: CK.Variable, detail: 'sys.stdin', doc: 'Standard input stream.' },
    { name: 'stdout', kind: CK.Variable, detail: 'sys.stdout', doc: 'Standard output stream.' },
    { name: 'stderr', kind: CK.Variable, detail: 'sys.stderr', doc: 'Standard error stream.' },
    { name: 'argv', kind: CK.Variable, detail: 'sys.argv: list[str]', doc: 'Command line arguments.' },
  ],

  usys: [], // alias

  gc: [
    { name: 'enable', kind: CK.Function, detail: 'gc.enable()', doc: 'Enable automatic garbage collection.' },
    { name: 'disable', kind: CK.Function, detail: 'gc.disable()', doc: 'Disable automatic garbage collection.' },
    { name: 'collect', kind: CK.Function, detail: 'gc.collect()', doc: 'Run a garbage collection.' },
    { name: 'mem_free', kind: CK.Function, detail: 'gc.mem_free() -> int', doc: 'Return the number of bytes of heap RAM available.' },
    { name: 'mem_alloc', kind: CK.Function, detail: 'gc.mem_alloc() -> int', doc: 'Return the number of bytes of heap RAM allocated.' },
    { name: 'threshold', kind: CK.Function, detail: 'gc.threshold([amount])', doc: 'Set or return the allocation threshold.' },
  ],

  micropython: [
    { name: 'const', kind: CK.Function, detail: 'micropython.const(expr)', doc: 'Declare a constant. Allows the compiler to optimize it. Use: CONST = micropython.const(123).' },
    { name: 'opt_level', kind: CK.Function, detail: 'micropython.opt_level([level])', doc: 'Get or set the compiler optimisation level for the current file.' },
    { name: 'mem_info', kind: CK.Function, detail: 'micropython.mem_info([verbose])', doc: 'Print information about currently used memory.' },
    { name: 'qstr_info', kind: CK.Function, detail: 'micropython.qstr_info([verbose])', doc: 'Print information about currently interned strings.' },
    { name: 'stack_use', kind: CK.Function, detail: 'micropython.stack_use() -> int', doc: 'Return the number of bytes used by the stack.' },
    { name: 'heap_lock', kind: CK.Function, detail: 'micropython.heap_lock()', doc: 'Lock the heap.' },
    { name: 'heap_unlock', kind: CK.Function, detail: 'micropython.heap_unlock()', doc: 'Unlock the heap.' },
    { name: 'kbd_intr', kind: CK.Function, detail: 'micropython.kbd_intr(chr)', doc: 'Set the character to trigger a KeyboardInterrupt exception.' },
    { name: 'schedule', kind: CK.Function, detail: 'micropython.schedule(func, arg)', doc: 'Schedule func to be called "very soon".' },
    { name: 'native', kind: CK.Keyword, detail: '@micropython.native', doc: 'Decorator: compile the function to native machine code.' },
    { name: 'viper', kind: CK.Keyword, detail: '@micropython.viper', doc: 'Decorator: compile with the Viper emitter for fast execution.' },
  ],

  uasyncio: [
    { name: 'run', kind: CK.Function, detail: 'uasyncio.run(coro)', doc: 'Create a new event loop and run the given coroutine.' },
    { name: 'get_event_loop', kind: CK.Function, detail: 'uasyncio.get_event_loop() -> EventLoop', doc: 'Return the event loop for the current context.' },
    { name: 'new_event_loop', kind: CK.Function, detail: 'uasyncio.new_event_loop() -> EventLoop', doc: 'Return a new event loop.' },
    { name: 'sleep', kind: CK.Function, detail: 'await uasyncio.sleep(secs)', doc: 'Sleep for the given number of seconds.' },
    { name: 'sleep_ms', kind: CK.Function, detail: 'await uasyncio.sleep_ms(ms)', doc: 'Sleep for the given number of milliseconds (more efficient than sleep()).' },
    { name: 'create_task', kind: CK.Function, detail: 'uasyncio.create_task(coro) -> Task', doc: 'Create a task from a coroutine and schedule it to run.' },
    { name: 'gather', kind: CK.Function, detail: 'await uasyncio.gather(*coros)', doc: 'Run multiple coroutines concurrently.' },
    { name: 'wait_for', kind: CK.Function, detail: 'await uasyncio.wait_for(coro, timeout)', doc: 'Wait for coro to complete with a timeout.' },
    { name: 'wait_for_ms', kind: CK.Function, detail: 'await uasyncio.wait_for_ms(coro, timeout_ms)', doc: 'Wait for coro to complete with a timeout in ms.' },
    { name: 'current_task', kind: CK.Function, detail: 'uasyncio.current_task() -> Task', doc: 'Return the currently running Task.' },
    { name: 'Task', kind: CK.Class, detail: 'Task', doc: 'A running coroutine. Created by create_task().' },
    { name: 'Lock', kind: CK.Class, detail: 'Lock()', doc: 'An asynchronous mutex lock.' },
    { name: 'Event', kind: CK.Class, detail: 'Event()', doc: 'An asynchronous event. Coroutines can wait for it.' },
    { name: 'Queue', kind: CK.Class, detail: 'Queue(maxsize=0)', doc: 'A queue for communicating between tasks.' },
    { name: 'StreamReader', kind: CK.Class, detail: 'StreamReader', doc: 'A stream reader for async I/O.' },
    { name: 'StreamWriter', kind: CK.Class, detail: 'StreamWriter', doc: 'A stream writer for async I/O.' },
    { name: 'open_connection', kind: CK.Function, detail: 'await uasyncio.open_connection(host, port)', doc: 'Open a TCP connection. Returns (reader, writer).' },
    { name: 'start_server', kind: CK.Function, detail: 'await uasyncio.start_server(callback, host, port)', doc: 'Start a TCP server.' },
  ],

  asyncio: [], // alias to uasyncio

  math: [
    { name: 'pi', kind: CK.Constant, detail: 'math.pi = 3.141592653589793', doc: 'The mathematical constant π.' },
    { name: 'e', kind: CK.Constant, detail: 'math.e = 2.718281828459045', doc: "Euler's number." },
    { name: 'sqrt', kind: CK.Function, detail: 'math.sqrt(x) -> float', doc: 'Return the square root of x.' },
    { name: 'pow', kind: CK.Function, detail: 'math.pow(x, y) -> float', doc: 'Return x raised to the power y.' },
    { name: 'exp', kind: CK.Function, detail: 'math.exp(x) -> float', doc: 'Return e raised to the power x.' },
    { name: 'log', kind: CK.Function, detail: 'math.log(x[, base]) -> float', doc: 'Return the logarithm of x.' },
    { name: 'log2', kind: CK.Function, detail: 'math.log2(x) -> float', doc: 'Return log base 2 of x.' },
    { name: 'log10', kind: CK.Function, detail: 'math.log10(x) -> float', doc: 'Return log base 10 of x.' },
    { name: 'sin', kind: CK.Function, detail: 'math.sin(x) -> float', doc: 'Return the sine of x radians.' },
    { name: 'cos', kind: CK.Function, detail: 'math.cos(x) -> float', doc: 'Return the cosine of x radians.' },
    { name: 'tan', kind: CK.Function, detail: 'math.tan(x) -> float', doc: 'Return the tangent of x radians.' },
    { name: 'asin', kind: CK.Function, detail: 'math.asin(x) -> float', doc: 'Return the arc sine of x.' },
    { name: 'acos', kind: CK.Function, detail: 'math.acos(x) -> float', doc: 'Return the arc cosine of x.' },
    { name: 'atan', kind: CK.Function, detail: 'math.atan(x) -> float', doc: 'Return the arc tangent of x.' },
    { name: 'atan2', kind: CK.Function, detail: 'math.atan2(y, x) -> float', doc: 'Return atan(y / x).' },
    { name: 'ceil', kind: CK.Function, detail: 'math.ceil(x) -> int', doc: 'Return the ceiling of x.' },
    { name: 'floor', kind: CK.Function, detail: 'math.floor(x) -> int', doc: 'Return the floor of x.' },
    { name: 'trunc', kind: CK.Function, detail: 'math.trunc(x) -> int', doc: 'Return the truncated integer value of x.' },
    { name: 'fabs', kind: CK.Function, detail: 'math.fabs(x) -> float', doc: 'Return the absolute value of x as float.' },
    { name: 'fmod', kind: CK.Function, detail: 'math.fmod(x, y) -> float', doc: 'Return the remainder of x / y.' },
    { name: 'modf', kind: CK.Function, detail: 'math.modf(x) -> (float, float)', doc: 'Return fractional and integer parts of x.' },
    { name: 'frexp', kind: CK.Function, detail: 'math.frexp(x) -> (float, int)', doc: 'Decompose x into mantissa and exponent.' },
    { name: 'ldexp', kind: CK.Function, detail: 'math.ldexp(x, i) -> float', doc: 'Return x * 2**i.' },
    { name: 'isnan', kind: CK.Function, detail: 'math.isnan(x) -> bool', doc: 'Return True if x is a NaN.' },
    { name: 'isinf', kind: CK.Function, detail: 'math.isinf(x) -> bool', doc: 'Return True if x is infinite.' },
    { name: 'isfinite', kind: CK.Function, detail: 'math.isfinite(x) -> bool', doc: 'Return True if x is finite.' },
    { name: 'degrees', kind: CK.Function, detail: 'math.degrees(x) -> float', doc: 'Convert angle x from radians to degrees.' },
    { name: 'radians', kind: CK.Function, detail: 'math.radians(x) -> float', doc: 'Convert angle x from degrees to radians.' },
    { name: 'copysign', kind: CK.Function, detail: 'math.copysign(x, y) -> float', doc: 'Return x with the sign of y.' },
    { name: 'factorial', kind: CK.Function, detail: 'math.factorial(x) -> int', doc: 'Return x factorial.' },
    { name: 'gcd', kind: CK.Function, detail: 'math.gcd(*integers) -> int', doc: 'Return the greatest common divisor.' },
    { name: 'inf', kind: CK.Constant, detail: 'math.inf', doc: 'Positive infinity.' },
    { name: 'nan', kind: CK.Constant, detail: 'math.nan', doc: 'Not a Number.' },
  ],

  random: [
    { name: 'random', kind: CK.Function, detail: 'random.random() -> float', doc: 'Return a random float N such that 0.0 <= N < 1.0.' },
    { name: 'uniform', kind: CK.Function, detail: 'random.uniform(a, b) -> float', doc: 'Return a random float N such that a <= N <= b.' },
    { name: 'randint', kind: CK.Function, detail: 'random.randint(a, b) -> int', doc: 'Return a random integer N such that a <= N <= b.' },
    { name: 'randrange', kind: CK.Function, detail: 'random.randrange(stop) / randrange(start, stop[, step]) -> int', doc: 'Return a randomly selected element from range(start, stop, step).' },
    { name: 'choice', kind: CK.Function, detail: 'random.choice(seq)', doc: 'Return a random element from a non-empty sequence.' },
    { name: 'shuffle', kind: CK.Function, detail: 'random.shuffle(x)', doc: 'Shuffle the sequence x in place.' },
    { name: 'seed', kind: CK.Function, detail: 'random.seed([n])', doc: 'Initialize the random number generator.' },
    { name: 'getrandbits', kind: CK.Function, detail: 'random.getrandbits(k) -> int', doc: 'Return an integer with k random bits.' },
  ],

  struct: [
    { name: 'pack', kind: CK.Function, detail: 'struct.pack(fmt, v1, v2, ...) -> bytes', doc: 'Pack values according to the format string.' },
    { name: 'pack_into', kind: CK.Function, detail: 'struct.pack_into(fmt, buffer, offset, v1, v2, ...)', doc: 'Pack values into a buffer at a given offset.' },
    { name: 'unpack', kind: CK.Function, detail: 'struct.unpack(fmt, data) -> tuple', doc: 'Unpack from the data according to the format string.' },
    { name: 'unpack_from', kind: CK.Function, detail: 'struct.unpack_from(fmt, data, offset=0) -> tuple', doc: 'Unpack from data starting at offset.' },
    { name: 'calcsize', kind: CK.Function, detail: 'struct.calcsize(fmt) -> int', doc: 'Return the size of the struct (number of bytes) corresponding to the format string.' },
  ],

  ustruct: [], // alias

  re: [
    { name: 'compile', kind: CK.Function, detail: 're.compile(pattern, flags=0)', doc: 'Compile a regular expression pattern into a regex object.' },
    { name: 'match', kind: CK.Function, detail: 're.match(pattern, string, flags=0)', doc: 'Try to apply the pattern at the start of the string.' },
    { name: 'search', kind: CK.Function, detail: 're.search(pattern, string, flags=0)', doc: 'Scan through string looking for a match.' },
    { name: 'sub', kind: CK.Function, detail: 're.sub(pattern, repl, string, count=0, flags=0)', doc: 'Return a string with all occurrences of pattern replaced.' },
    { name: 'split', kind: CK.Function, detail: 're.split(pattern, string, maxsplit=0, flags=0) -> list', doc: 'Split the string by occurrences of pattern.' },
    { name: 'findall', kind: CK.Function, detail: 're.findall(pattern, string, flags=0) -> list', doc: 'Return all non-overlapping matches.' },
    { name: 'DOTALL', kind: CK.Constant, detail: 're.DOTALL', doc: 'Make . match any char including newline.' },
    { name: 'MULTILINE', kind: CK.Constant, detail: 're.MULTILINE', doc: 'Multi-line matching mode.' },
    { name: 'IGNORECASE', kind: CK.Constant, detail: 're.IGNORECASE', doc: 'Case-insensitive matching.' },
  ],

  ure: [], // alias

  socket: [
    { name: 'socket', kind: CK.Class, detail: 'socket.socket(af=AF_INET, type=SOCK_STREAM, proto=0)', doc: 'Create a new socket.' },
    { name: 'getaddrinfo', kind: CK.Function, detail: 'socket.getaddrinfo(host, port) -> list', doc: 'Translate the host/port argument into a sequence of 5-tuples.' },
    { name: 'AF_INET', kind: CK.Constant, detail: 'socket.AF_INET', doc: 'IPv4 address family.' },
    { name: 'AF_INET6', kind: CK.Constant, detail: 'socket.AF_INET6', doc: 'IPv6 address family.' },
    { name: 'SOCK_STREAM', kind: CK.Constant, detail: 'socket.SOCK_STREAM', doc: 'TCP socket type.' },
    { name: 'SOCK_DGRAM', kind: CK.Constant, detail: 'socket.SOCK_DGRAM', doc: 'UDP socket type.' },
    { name: 'SOCK_RAW', kind: CK.Constant, detail: 'socket.SOCK_RAW', doc: 'Raw socket type.' },
    { name: 'IPPROTO_TCP', kind: CK.Constant, detail: 'socket.IPPROTO_TCP', doc: 'TCP protocol number.' },
    { name: 'IPPROTO_UDP', kind: CK.Constant, detail: 'socket.IPPROTO_UDP', doc: 'UDP protocol number.' },
  ],

  usocket: [], // alias

  binascii: [
    { name: 'hexlify', kind: CK.Function, detail: 'binascii.hexlify(data[, sep]) -> bytes', doc: 'Convert binary data to a hexadecimal representation.' },
    { name: 'unhexlify', kind: CK.Function, detail: 'binascii.unhexlify(data) -> bytes', doc: 'Convert hexadecimal data to binary.' },
    { name: 'b2a_base64', kind: CK.Function, detail: 'binascii.b2a_base64(data) -> bytes', doc: 'Encode data in base64.' },
    { name: 'a2b_base64', kind: CK.Function, detail: 'binascii.a2b_base64(data) -> bytes', doc: 'Decode base64 encoded data.' },
    { name: 'crc32', kind: CK.Function, detail: 'binascii.crc32(data[, crc]) -> int', doc: 'Compute CRC-32.' },
  ],

  ubinascii: [], // alias

  hashlib: [
    { name: 'new', kind: CK.Function, detail: 'hashlib.new(name, data=None)', doc: 'Create new hash object using the algorithm name.' },
    { name: 'sha256', kind: CK.Function, detail: 'hashlib.sha256(data=None)', doc: 'Create SHA-256 hash object.' },
    { name: 'sha1', kind: CK.Function, detail: 'hashlib.sha1(data=None)', doc: 'Create SHA-1 hash object.' },
    { name: 'md5', kind: CK.Function, detail: 'hashlib.md5(data=None)', doc: 'Create MD5 hash object.' },
  ],

  uhashlib: [], // alias

  io: [
    { name: 'BytesIO', kind: CK.Class, detail: 'io.BytesIO([initial_bytes])', doc: 'An in-memory stream for bytes I/O.' },
    { name: 'StringIO', kind: CK.Class, detail: 'io.StringIO([initial_value])', doc: 'An in-memory stream for text I/O.' },
    { name: 'FileIO', kind: CK.Class, detail: 'io.FileIO(name, mode="r")', doc: 'File I/O using raw bytes.' },
    { name: 'TextIOWrapper', kind: CK.Class, detail: 'io.TextIOWrapper', doc: 'Buffered text stream providing higher-level access to a binary stream.' },
  ],

  uio: [], // alias

  collections: [
    { name: 'OrderedDict', kind: CK.Class, detail: 'collections.OrderedDict([pairs])', doc: 'A dict subclass that remembers insertion order.' },
    { name: 'namedtuple', kind: CK.Function, detail: 'collections.namedtuple(typename, field_names)', doc: 'Create a tuple subclass with named fields.' },
    { name: 'deque', kind: CK.Class, detail: 'collections.deque(iterable, maxlen?)', doc: 'A double-ended queue.' },
  ],

  ucollections: [], // alias

  // ── Standard / popular third-party libraries ─────────────────────────────
  requests: [
    { name: 'get',     kind: CK.Function, detail: 'get(url, params=None, **kwargs) -> Response',         doc: 'HTTP GET request.',    returns: 'Response' },
    { name: 'post',    kind: CK.Function, detail: 'post(url, data=None, json=None, **kwargs) -> Response', doc: 'HTTP POST request.',  returns: 'Response' },
    { name: 'put',     kind: CK.Function, detail: 'put(url, data=None, **kwargs) -> Response',           doc: 'HTTP PUT request.',    returns: 'Response' },
    { name: 'delete',  kind: CK.Function, detail: 'delete(url, **kwargs) -> Response',                   doc: 'HTTP DELETE request.', returns: 'Response' },
    { name: 'patch',   kind: CK.Function, detail: 'patch(url, data=None, **kwargs) -> Response',         doc: 'HTTP PATCH request.',  returns: 'Response' },
    { name: 'head',    kind: CK.Function, detail: 'head(url, **kwargs) -> Response',                     doc: 'HTTP HEAD request.',   returns: 'Response' },
    { name: 'request', kind: CK.Function, detail: 'request(method, url, **kwargs) -> Response',          doc: 'Generic HTTP request.', returns: 'Response' },
    { name: 'Session', kind: CK.Class,    detail: 'Session()',                                           doc: 'HTTP session with persistent settings.' },
    { name: 'Response', kind: CK.Class,   detail: 'Response',                                            doc: 'HTTP Response object.' },
  ],
};

// Populate aliases
MODULE_STUBS['utime'] = MODULE_STUBS['time'];
MODULE_STUBS['ujson'] = MODULE_STUBS['json'];
MODULE_STUBS['uos'] = MODULE_STUBS['os'];
MODULE_STUBS['usys'] = MODULE_STUBS['sys'];
MODULE_STUBS['asyncio'] = MODULE_STUBS['uasyncio'];
MODULE_STUBS['ustruct'] = MODULE_STUBS['struct'];
MODULE_STUBS['ure'] = MODULE_STUBS['re'];
MODULE_STUBS['usocket'] = MODULE_STUBS['socket'];
MODULE_STUBS['ubinascii'] = MODULE_STUBS['binascii'];
MODULE_STUBS['uhashlib'] = MODULE_STUBS['hashlib'];
MODULE_STUBS['uio'] = MODULE_STUBS['io'];
MODULE_STUBS['ucollections'] = MODULE_STUBS['collections'];

/** All known module names (for import completion). */
const ALL_MODULE_NAMES = Object.keys(MODULE_STUBS);

/** Returns true for known stdlib / MicroPython modules. */
function isKnownModule(name: string): boolean {
  return name in MODULE_STUBS;
}

// ── Symbol extraction from Python source ─────────────────────────────────────

function extractSymbols(code: string): PySymbol[] {
  const symbols: PySymbol[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    // Top-level `def name(`
    const fnMatch = line.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (fnMatch) {
      symbols.push({
        name: fnMatch[1],
        kind: CK.Function,
        detail: `def ${fnMatch[1]}(${fnMatch[2]})`,
      });
      continue;
    }

    // Top-level `async def name(`
    const asyncFnMatch = line.match(/^async\s+def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (asyncFnMatch) {
      symbols.push({
        name: asyncFnMatch[1],
        kind: CK.Function,
        detail: `async def ${asyncFnMatch[1]}(${asyncFnMatch[2]})`,
      });
      continue;
    }

    // Top-level `class Name`
    const classMatch = line.match(/^class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      symbols.push({
        name: classMatch[1],
        kind: CK.Class,
        detail: line.trim(),
      });
      continue;
    }

    // Top-level variable assignment (not indented)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      const varMatch = line.match(/^([A-Za-z_]\w*)\s*=/);
      if (varMatch && !['def', 'class', 'import', 'from', 'if', 'while', 'for', 'with', 'try', 'except', 'return', 'elif', 'else', 'pass', 'break', 'continue', 'raise', 'yield', 'del', 'assert', 'global', 'nonlocal', 'lambda', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None'].includes(varMatch[1])) {
        symbols.push({
          name: varMatch[1],
          kind: CK.Variable,
          detail: line.trim().slice(0, 60),
        });
      }
    }
  }

  return symbols;
}

// ── Import extraction ─────────────────────────────────────────────────────────

interface ImportEntry {
  type: 'import' | 'from';
  module: string;
  names?: string[]; // only for 'from X import a, b'
  alias?: string;   // import X as alias
}

function extractImports(code: string): ImportEntry[] {
  const entries: ImportEntry[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    // `import X` or `import X as Y` or `import X, Y`
    const importMatch = line.match(/^import\s+(.+)/);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const m = part.trim().match(/^([\w.]+)(?:\s+as\s+(\w+))?/);
        if (m) entries.push({ type: 'import', module: m[1], alias: m[2] });
      }
      continue;
    }

    // `from X import a, b` or `from X import *`
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromMatch) {
      const names = fromMatch[2].split(',').map(n => {
        const m = n.trim().match(/^(\w+)/);
        return m ? m[1] : '';
      }).filter(Boolean);
      entries.push({ type: 'from', module: fromMatch[1], names });
    }
  }

  return entries;
}

// ── Module path resolution (VFS) ──────────────────────────────────────────────

/** Convert a dotted module name to candidate VFS paths, relative to `fileDir`. */
function moduleToVfsPaths(moduleName: string, fileDir: string): string[] {
  // Only handle relative-looking names (no leading dots handled here) or simple local names
  const parts = moduleName.split('.');
  const rel = parts.join('/');
  return [
    `${fileDir}/${rel}.py`,
    `${fileDir}/${rel}/__init__.py`,
    `${fileDir}/lib/${rel}.py`,
    `${fileDir}/lib/${rel}/__init__.py`,
  ];
}

// ── Context detection ─────────────────────────────────────────────────────────

type CompletionContext =
  | { type: 'import-module'; prefix: string }
  | { type: 'from-module'; prefix: string }
  | { type: 'from-names'; module: string; prefix: string }
  | { type: 'dot'; object: string; prefix: string }
  | { type: 'general'; word: string };

function detectContext(lineUntilCursor: string): CompletionContext {
  // `from module import partial`
  const fromImportMatch = lineUntilCursor.match(/^from\s+([\w.]+)\s+import\s+([\w,\s]*)$/);
  if (fromImportMatch) {
    // The prefix is the last name after the last comma
    const lastPart = fromImportMatch[2].split(',').pop()?.trim() ?? '';
    return { type: 'from-names', module: fromImportMatch[1], prefix: lastPart };
  }

  // `import partial`
  const importMatch = lineUntilCursor.match(/^import\s+([\w.]*)$/);
  if (importMatch) {
    return { type: 'import-module', prefix: importMatch[1] };
  }

  // `from partial`
  const fromMatch = lineUntilCursor.match(/^from\s+([\w.]*)$/);
  if (fromMatch) {
    return { type: 'from-module', prefix: fromMatch[1] };
  }

  // `obj.partial` — attribute access
  const dotMatch = lineUntilCursor.match(/([\w.]+)\.([\w]*)$/);
  if (dotMatch) {
    return { type: 'dot', object: dotMatch[1], prefix: dotMatch[2] };
  }

  // General: get current word
  const wordMatch = lineUntilCursor.match(/(\w*)$/);
  return { type: 'general', word: wordMatch?.[1] ?? '' };
}

// ── Symbol → CompletionItem conversion ───────────────────────────────────────

function symbolToItem(
  sym: PySymbol,
  range: monaco.IRange,
  sortPrefix = '0',
): monaco.languages.CompletionItem {
  return {
    label: sym.name,
    kind: sym.kind,
    detail: sym.detail,
    documentation: sym.doc ? { value: sym.doc } : undefined,
    insertText: sym.name,
    range,
    sortText: `${sortPrefix}_${sym.name}`,
  };
}

// ── Class info (from stub files) ─────────────────────────────────────────────

/** Rich description of a Python class parsed from a .pyi / .py stub file. */
interface PyClassInfo {
  name: string;
  doc?: string;
  members: PySymbol[]; // methods + properties + constants (self/cls already stripped)
}

interface StubParseResult {
  classes: Map<string, PyClassInfo>;
  symbols: PySymbol[]; // top-level functions + constants
}

/**
 * Parse a `.pyi` (or annotated `.py`) file and extract class/function information.
 *
 * Handles:
 *  - Multi-line `def` signatures (collects until matching `)`)
 *  - `@property`, `@classmethod`, `@staticmethod` decorators
 *  - Inline attribute annotations: `name: Type`
 *  - Triple-quoted docstrings immediately following a `class` or `def`
 *  - Return-type annotations: `-> Type`
 *  - Strips `self` / `cls` from method parameter lists
 */
function parsePyStubCode(code: string): StubParseResult {
  const classes = new Map<string, PyClassInfo>();
  const symbols: PySymbol[] = [];
  const lines = code.split('\n');
  const n = lines.length;

  const indentOf = (line: string): number => {
    let col = 0;
    for (const ch of line) {
      if (ch === ' ') col++;
      else if (ch === '\t') col += 4;
      else break;
    }
    return col;
  };

  /**
   * Collect a (potentially multi-line) `def` signature starting at `startIdx`.
   * Counts open/close parentheses; stops once balanced.
   * Returns the compact single-line signature and the next unread line index.
   */
  const collectDef = (startIdx: number): { sig: string; next: number } => {
    let raw = '';
    let depth = 0;
    let started = false;
    let i = startIdx;
    while (i < n) {
      const chunk = lines[i].trim();
      raw += (raw ? ' ' : '') + chunk;
      for (const ch of chunk) {
        if (ch === '(' || ch === '[') { depth++; started = true; }
        else if (ch === ')' || ch === ']') depth--;
      }
      i++;
      if (started && depth === 0) break;
    }
    // Keep everything up to and including the last `)`; add return type if present.
    const lastParen = raw.lastIndexOf(')');
    let sig = raw.slice(0, lastParen + 1);
    const retMatch = raw.slice(lastParen + 1).match(/\s*->\s*([^:{]+)/);
    if (retMatch) sig += ' -> ' + retMatch[1].trim();
    // Strip `def ` / `async def ` prefix
    sig = sig.replace(/^(?:async\s+)?def\s+/, '').trim();
    // Remove leading `self` / `cls` parameter (with optional type annotation)
    sig = sig.replace(/\(\s*(?:self|cls)\s*(?::\s*[\w\[\], ]+)?\s*(?:,\s*)?/, '(');
    // Normalise whitespace
    sig = sig.replace(/\s+/g, ' ');
    return { sig, next: i };
  };

  /**
   * Extract the first triple-quoted docstring starting at `lineIdx`.
   * Returns the text or undefined if the line isn't a docstring.
   */
  const extractDocstring = (lineIdx: number): string | undefined => {
    if (lineIdx >= n) return undefined;
    const ln = lines[lineIdx].trimStart();
    const q = ln.startsWith('"""') ? '"""' : ln.startsWith("'''") ? "'''" : null;
    if (!q) return undefined;
    const firstContent = ln.slice(3);
    if (firstContent.includes(q)) return firstContent.slice(0, firstContent.indexOf(q)).trim() || undefined;
    const parts: string[] = [firstContent.trim()];
    let k = lineIdx + 1;
    while (k < n) {
      const l = lines[k];
      if (l.includes(q)) { parts.push(l.slice(0, l.indexOf(q)).trim()); break; }
      parts.push(l.trim());
      k++;
    }
    return parts.filter(Boolean).join(' ').trim() || undefined;
  };

  let i = 0;
  while (i < n) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = indentOf(line);

    if (indent === 0 && trimmed && !trimmed.startsWith('#')) {

      // ── Top-level class ────────────────────────────────────────────────────
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
      if (classMatch) {
        const className = classMatch[1];
        i++;
        const doc = extractDocstring(i);
        const members: PySymbol[] = [];

        let isProperty = false;
        let isStatic = false;
        let isClassMethod = false;

        while (i < n) {
          const ml = lines[i];
          const mt = ml.trimStart();
          const mi = indentOf(ml);

          // Back to top level (non-blank, non-comment)
          if (mi === 0 && mt && !mt.startsWith('#')) break;
          if (!mt || mt.startsWith('#')) { i++; continue; }

          // Decorators
          if (mt.startsWith('@')) {
            isProperty   = isProperty   || mt.startsWith('@property');
            isStatic     = isStatic     || mt.startsWith('@staticmethod');
            isClassMethod = isClassMethod || mt.startsWith('@classmethod');
            i++; continue;
          }

          // Method
          if (mt.startsWith('def ') || mt.startsWith('async def ')) {
            const { sig, next } = collectDef(i);
            const methodMatch = sig.match(/^(\w+)/);
            if (methodMatch) {
              const methodDoc = extractDocstring(next);
              members.push({
                name: methodMatch[1],
                kind: isProperty ? CK.Property : (isStatic ? CK.Function : CK.Method),
                detail: sig,
                doc: methodDoc,
              });
            }
            i = next;
            isProperty = isStatic = isClassMethod = false;
            continue;
          }

          // Attribute annotation: `name: Type` or `name: Type = value`
          const attrMatch = mt.match(/^(\w+)\s*:\s*([^=\n]+)/);
          if (attrMatch) {
            members.push({
              name: attrMatch[1],
              kind: CK.Property,
              detail: `${attrMatch[1]}: ${attrMatch[2].trim()}`,
            });
          }

          // Class-level constant: `NAME = value`
          const constMatch = mt.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
          if (constMatch) {
            members.push({
              name: constMatch[1],
              kind: CK.Constant,
              detail: mt.slice(0, 60).trim(),
            });
          }

          i++;
          isProperty = isStatic = isClassMethod = false;
        }

        classes.set(className, { name: className, doc, members });
        continue;
      }

      // ── Top-level function ─────────────────────────────────────────────────
      if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
        const { sig, next } = collectDef(i);
        const fnMatch = sig.match(/^(\w+)/);
        if (fnMatch) {
          const fnDoc = extractDocstring(next);
          symbols.push({ name: fnMatch[1], kind: CK.Function, detail: sig, doc: fnDoc });
        }
        i = next;
        continue;
      }

      // ── Top-level constant / annotation ───────────────────────────────────
      const annotMatch = trimmed.match(/^([A-Za-z_]\w*)\s*:\s*([^=\n]+)/);
      if (annotMatch) {
        symbols.push({ name: annotMatch[1], kind: CK.Variable, detail: trimmed.slice(0, 80) });
      }
      const constMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
      if (constMatch) {
        symbols.push({ name: constMatch[1], kind: CK.Constant, detail: trimmed.slice(0, 60) });
      }
    }

    i++;
  }

  return { classes, symbols };
}

// ── Simple local type inference ───────────────────────────────────────────────

/**
 * Scan the current file for variable → class mappings so that `pin.` can
 * resolve to `Pin` members when `pin: Pin` or `pin = Pin(...)` is present.
 *
 * Returns a Map<varName, className>.
 */
function inferLocalTypes(code: string): Map<string, string> {
  const types = new Map<string, string>();
  for (const line of code.split('\n')) {
    const ln = line.trimStart();
    // `var: TypeName` or `var: TypeName = ...`
    const ann = ln.match(/^(\w+)\s*:\s*([\w.]+)/);
    if (ann && !ln.startsWith('def ') && !ln.startsWith('class ')) {
      types.set(ann[1], ann[2].split('.').pop()!);
      continue;
    }
    // `var = module.func(...)` — look up returns type from MODULE_STUBS
    const methodCall = ln.match(/^(\w+)\s*=\s*(\w+)\.(\w+)\s*\(/);
    if (methodCall) {
      const [, varName, modName, funcName] = methodCall;
      const stubs = MODULE_STUBS[modName];
      if (stubs) {
        const sym = stubs.find(s => s.name === funcName);
        if (sym?.returns) {
          types.set(varName, sym.returns);
          continue;
        }
      }
      // Fallback: if funcName looks like a constructor (UpperCase), use it as type
      if (/^[A-Z]/.test(funcName)) {
        types.set(varName, funcName);
        continue;
      }
    }
    // `var = TypeName(...)` or `var = module.TypeName(...)` — direct constructor call
    const ctor = ln.match(/^(\w+)\s*=\s*([\w.]+)\s*\(/);
    if (ctor) {
      const typePart = ctor[2].split('.').pop()!;
      // Only treat as constructor if name starts with uppercase (class convention)
      if (/^[A-Z]/.test(typePart)) {
        types.set(ctor[1], typePart);
      }
    }
  }
  return types;
}

// ── Signature help helpers ───────────────────────────────────────────────────

/**
 * Build a SignatureInformation from a PySymbol's detail string.
 * Uses [start, end] character offsets into the label so Monaco can highlight
 * each parameter individually as the user advances through them.
 *
 * Works with strings like:
 *   "Pin(id, mode=-1, pull=-1, value=None, alt=-1)"
 *   "def foo(a, b=1)"
 *   "sleep_ms(ms)"
 */
function buildSignatureInfo(sym: PySymbol): monaco.languages.SignatureInformation | null {
  const raw = sym.detail;
  if (!raw) return null;

  // Strip optional leading "def " / "async def "
  const detail = raw.replace(/^(?:async\s+)?def\s+/, '');

  const openIdx = detail.indexOf('(');
  if (openIdx === -1) return null;

  // Find matching closing paren
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < detail.length; i++) {
    if (detail[i] === '(') depth++;
    else if (detail[i] === ')') { depth--; if (depth === 0) { closeIdx = i; break; } }
  }
  if (closeIdx === -1) closeIdx = detail.length - 1;

  // The label is everything up to and including the closing paren
  const label = detail.slice(0, closeIdx + 1);

  // Split parameter spans at depth-0 commas, tracking char offsets in `label`
  const parameters: monaco.languages.ParameterInformation[] = [];
  let pDepth = 0;
  let segStart = openIdx + 1;

  const pushParam = (end: number) => {
    // trim whitespace from both ends of the segment
    let s = segStart;
    let e = end;
    while (s < e && label[s] === ' ') s++;
    while (e > s && label[e - 1] === ' ') e--;
    if (s < e) parameters.push({ label: [s, e] as [number, number] });
    segStart = end + 1; // skip the comma
  };

  for (let i = openIdx + 1; i < closeIdx; i++) {
    const ch = label[i];
    if (ch === '(' || ch === '[' || ch === '{') pDepth++;
    else if (ch === ')' || ch === ']' || ch === '}') pDepth--;
    else if (ch === ',' && pDepth === 0) pushParam(i);
  }
  if (segStart <= closeIdx) pushParam(closeIdx);

  if (parameters.length === 0) return null;

  return {
    label,
    documentation: sym.doc ? { value: sym.doc } : undefined,
    parameters,
  };
}

/**
 * Walk backwards from the cursor position to find the innermost unclosed `(`.
 * Returns the function/method name and the 0-based index of the active parameter
 * (counted by depth-0 commas between `(` and the cursor).
 */
function getCallContext(
  lineUntilCursor: string,
): { funcName: string; dotObject: string | undefined; activeParam: number } | null {
  let depth = 0;
  let parenPos = -1;
  let inStr = false;
  let strChar = '';

  for (let i = lineUntilCursor.length - 1; i >= 0; i--) {
    const ch = lineUntilCursor[i];
    // Minimal string detection: toggle inStr on unescaped quotes
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; continue; }
    if (inStr && ch === strChar) { inStr = false; continue; }
    if (inStr) continue;

    if (ch === ')' || ch === ']' || ch === '}') { depth++; continue; }
    if (ch === '(' || ch === '[' || ch === '{') {
      if (depth > 0) { depth--; continue; }
      if (ch === '(') { parenPos = i; break; }
      // unmatched [ or { — not inside a call
      break;
    }
  }

  if (parenPos === -1) return null;

  // Extract the callable expression immediately before '('
  const beforeParen = lineUntilCursor.slice(0, parenPos).trimEnd();
  const calleeMatch = beforeParen.match(/([\w.]+)$/);
  if (!calleeMatch) return null;

  const fullName = calleeMatch[1];
  const dotIdx = fullName.lastIndexOf('.');
  const funcName = dotIdx !== -1 ? fullName.slice(dotIdx + 1) : fullName;
  const dotObject = dotIdx !== -1 ? fullName.slice(0, dotIdx) : undefined;

  // Count depth-0 commas after '(' to determine active parameter index
  let activeParam = 0;
  let d = 0;
  for (let i = parenPos + 1; i < lineUntilCursor.length; i++) {
    const ch = lineUntilCursor[i];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
    else if (ch === ',' && d === 0) activeParam++;
  }

  return { funcName, dotObject, activeParam };
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export function createPythonPlugin(provider: FileSystemProvider): IPlugin {
  // Disposables stored across activate/deactivate cycles
  const pyDisposables: monaco.IDisposable[] = [];

  return {
    manifest: {
      id: 'builtin.python-intellisense',
      name: 'Python IntelliSense',
      version: '1.0.0',
      description: 'Python / MicroPython completions: builtins, stdlib stubs, VFS import resolution',
      contributes: ['statusbar'],
    },

    activate(api) {
      // ── Per-file symbol cache (VFS path → symbols) ──────────────────────────
      const fileSymbols = new Map<string, PySymbol[]>();
      // Tracks which local module paths are being loaded to avoid duplicate fetches
      const loadingPaths = new Set<string>();
      // Tracks VFS paths that returned 404 — skip re-probing them
      const notFoundFiles = new Set<string>();
      // Tracks VFS directories that returned 404 — skip re-probing them
      const notFoundDirs = new Set<string>();

      // ── Local module name cache (populated by directory scan) ──────────────
      // Maps dirPath → Set of module names (stem of .py files in that dir).
      const localModuleCache = new Map<string, Set<string>>();
      const scannedDirs = new Set<string>();

      async function scanLocalModules(dirPath: string): Promise<void> {
        if (scannedDirs.has(dirPath) || notFoundDirs.has(dirPath)) return;
        scannedDirs.add(dirPath);
        try {
          const entries = await provider.readDirectory(dirPath);
          const names = new Set<string>();
          for (const entry of entries) {
            if (entry.name.endsWith('.py') && !entry.name.startsWith('_')) {
              names.add(entry.name.slice(0, -3)); // strip .py
              // Eagerly index every .py file so classInfoCache is populated
              // without needing an explicit import statement.
              const fullPath = `${dirPath}/${entry.name}`;
              loadFileSymbols(fullPath).catch(() => {});
            }
          }
          localModuleCache.set(dirPath, names);
        } catch {
          notFoundDirs.add(dirPath);
        }
      }

      // ── Stub-file class cache ──────────────────────────────────────────────
      // Populated by loadStubFile(); used by completion + signature help.
      // Pre-seeded with well-known classes from MODULE_STUBS (requests.Response, etc.)
      const classInfoCache = new Map<string, PyClassInfo>([
        ['Response', {
          name: 'Response',
          doc: 'HTTP Response object returned by requests.get/post/put/delete/patch/head.',
          members: [
            { name: 'status_code', kind: CK.Property, detail: 'status_code: int',          doc: 'HTTP status code (e.g. 200, 404).' },
            { name: 'ok',          kind: CK.Property, detail: 'ok: bool',                  doc: 'True if status_code < 400.' },
            { name: 'text',        kind: CK.Property, detail: 'text: str',                  doc: 'Response body as decoded text.' },
            { name: 'content',     kind: CK.Property, detail: 'content: bytes',             doc: 'Response body as raw bytes.' },
            { name: 'headers',     kind: CK.Property, detail: 'headers: dict',              doc: 'Response headers dictionary.' },
            { name: 'url',         kind: CK.Property, detail: 'url: str',                   doc: 'Final URL of the response.' },
            { name: 'encoding',    kind: CK.Property, detail: 'encoding: str',              doc: 'Encoding of the response text.' },
            { name: 'json',        kind: CK.Method,   detail: 'json() -> Any',              doc: 'Deserialize response body as JSON.' },
            { name: 'raise_for_status', kind: CK.Method, detail: 'raise_for_status()',      doc: 'Raise HTTPError if status >= 400.' },
            { name: 'iter_content', kind: CK.Method,  detail: 'iter_content(chunk_size=1) -> Iterator[bytes]', doc: 'Iterate over response content.' },
            { name: 'close',       kind: CK.Method,   detail: 'close()',                    doc: 'Release connection back to pool.' },
          ],
        }],
      ]);
      const loadedStubPaths = new Set<string>();

      async function loadStubFile(vfsPath: string): Promise<void> {
        if (loadedStubPaths.has(vfsPath)) return;
        loadedStubPaths.add(vfsPath);
        try {
          const content = await readVfs(vfsPath);
          if (!content) return;
          const result = parsePyStubCode(content);
          for (const [name, cls] of result.classes) {
            classInfoCache.set(name, cls);
          }
          // Top-level stub functions/constants are also available as file symbols
          if (result.symbols.length > 0) {
            fileSymbols.set(vfsPath, result.symbols);
          }
          console.log(`[PyPlugin] stub loaded: ${vfsPath} | classes: ${result.classes.size} symbols: ${result.symbols.length}`);
        } catch (e) {
          console.warn(`[PyPlugin] stub load failed: ${vfsPath}`, e);
        }
      }

      /**
       * Scan ancestor directories for stub files and load them.
       * Looks in: stubs/, typings/, lib/ (for .pyi), and any sibling .pyi files.
       * Results are cached so the same fileDir is never re-scanned.
       */
      const discoveredStubFileDirs = new Set<string>();
      async function discoverStubs(fileDir: string): Promise<void> {
        if (discoveredStubFileDirs.has(fileDir)) return;
        discoveredStubFileDirs.add(fileDir);

        const STUB_DIRS = ['stubs', 'typings'];
        const segs = fileDir.split('/').filter(Boolean);

        for (let depth = segs.length; depth >= 0; depth--) {
          const dir = depth === 0 ? '/' : '/' + segs.slice(0, depth).join('/');

          // stubs/ and typings/ directories
          for (const stubDirName of STUB_DIRS) {
            const stubDir = dir === '/' ? `/${stubDirName}` : `${dir}/${stubDirName}`;
            if (notFoundDirs.has(stubDir)) continue;
            try {
              const entries = await provider.readDirectory(stubDir);
              for (const entry of entries) {
                const lower = entry.name.toLowerCase();
                if (lower.endsWith('.pyi') || lower.endsWith('.py')) {
                  loadStubFile(`${stubDir}/${entry.name}`).catch(() => {});
                }
              }
            } catch {
              notFoundDirs.add(stubDir);
            }
          }

          // lib/ — only .pyi files (actual runtime .py files are handled by loadFileSymbols)
          const libDir = dir === '/' ? '/lib' : `${dir}/lib`;
          if (!notFoundDirs.has(libDir)) {
            try {
              const entries = await provider.readDirectory(libDir);
              for (const entry of entries) {
                if (entry.name.toLowerCase().endsWith('.pyi')) {
                  loadStubFile(`${libDir}/${entry.name}`).catch(() => {});
                }
              }
            } catch {
              notFoundDirs.add(libDir);
            }
          }
        }

        // Also load any .pyi sibling files in the same directory as the current file
        if (!notFoundDirs.has(fileDir)) {
          try {
            const entries = await provider.readDirectory(fileDir);
            for (const entry of entries) {
              if (entry.name.toLowerCase().endsWith('.pyi')) {
                loadStubFile(`${fileDir}/${entry.name}`).catch(() => {});
              }
            }
          } catch {
            notFoundDirs.add(fileDir);
          }
        }
      }

      // ── Status bar item ────────────────────────────────────────────────────
      const statusItem = api.ui.statusbar.register({
        id: 'python-lang-indicator',
        text: '',
        tooltip: 'Python IntelliSense (MicroPython stubs + VFS)',
        alignment: 'right',
        priority: 88,
      });

      // ── Track current file ─────────────────────────────────────────────────
      let currentUri = '';

      api.editor.onDidChangeModel((uri) => {
        currentUri = uri;
        const isPy = uri.toLowerCase().endsWith('.py');
        statusItem.update({ text: isPy ? '$(python)Python' : '' });
        if (isPy) {
          // Verify the Monaco model's language ID — must be 'python' for completions to fire
          setTimeout(() => {
            const allModels = monaco.editor.getModels();
            const match = allModels.find(m => m.uri.toString() === uri || m.uri.toString().endsWith(uri));
            if (match) {
              const lang = match.getLanguageId();
              console.log(`[PyPlugin] Model opened: ${uri} | Monaco languageId=${lang}`);
              if (lang !== 'python') {
                console.warn(`[PyPlugin] WRONG LANGUAGE! Expected 'python', got '${lang}'. Setting language...`);
                monaco.editor.setModelLanguage(match, 'python');
                console.log(`[PyPlugin] Language corrected to: ${match.getLanguageId()}`);
              }
            } else {
              console.warn(`[PyPlugin] Could not find Monaco model for URI: ${uri}`);
              console.log(`[PyPlugin] Available models:`, allModels.map(m => m.uri.toString()));
            }
          }, 0);
        }
      });

      // ── VFS read helper ────────────────────────────────────────────────────
      async function readVfs(vfsPath: string): Promise<string | null> {
        try {
          return new TextDecoder().decode(await provider.readFile(vfsPath));
        } catch {
          return null;
        }
      }

      // ── Parse a Python file and cache both flat symbols and class members ──
      function indexPythonContent(vfsPath: string, content: string): void {
        fileSymbols.set(vfsPath, extractSymbols(content));
        // Also extract class members so `instance.` dot completions work for
        // locally-defined classes (not only .pyi stubs).
        const stubResult = parsePyStubCode(content);
        for (const [name, cls] of stubResult.classes) {
          // Don't overwrite a richer stub already loaded from a .pyi file
          if (!classInfoCache.has(name)) {
            classInfoCache.set(name, cls);
          }
        }
      }

      // ── Load and cache symbols from a VFS Python file ──────────────────────
      async function loadFileSymbols(vfsPath: string): Promise<void> {
        if (fileSymbols.has(vfsPath) || loadingPaths.has(vfsPath) || notFoundFiles.has(vfsPath)) return;
        loadingPaths.add(vfsPath);
        try {
          const content = await readVfs(vfsPath);
          if (content) {
            indexPythonContent(vfsPath, content);
          } else {
            notFoundFiles.add(vfsPath);
          }
        } finally {
          loadingPaths.delete(vfsPath);
        }
      }

      // ── Handle file open / change ─────────────────────────────────────────
      async function handlePythonFile(uri: string, code: string): Promise<void> {
        const vfsPath = uriToVfsPath(uri);
        indexPythonContent(vfsPath, code);

        // Pre-load local imports in background
        const fileDir = dirOf(vfsPath);
        const imports = extractImports(code);
        for (const entry of imports) {
          if (!isKnownModule(entry.module)) {
            const candidates = moduleToVfsPaths(entry.module, fileDir);
            for (const c of candidates) {
              if (notFoundFiles.has(c)) continue;
              const content = await readVfs(c);
              if (content) {
                loadingPaths.delete(c);
                indexPythonContent(c, content);
                break;
              } else {
                notFoundFiles.add(c);
              }
            }
          }
        }
        console.log(`[PyPlugin] handleFile: ${vfsPath} | symbols: ${fileSymbols.get(vfsPath)?.length ?? 0} | classes: ${classInfoCache.size}`);

        // Scan directory for local module names (for import completions)
        scanLocalModules(fileDir).catch(() => {});

        // Discover and load stub files from ancestor directories (background)
        discoverStubs(fileDir).catch(() => {});
      }

      api.editor.onDidOpenDocument((uri, text) => {
        if (uri.toLowerCase().endsWith('.py')) {
          handlePythonFile(uri, text).catch(() => {});
        }
      });

      // On activation, scan already-loaded Monaco models so we don't miss the
      // currently-active file (the modelChanged event fires before plugins subscribe).
      Promise.resolve().then(() => {
        for (const model of monaco.editor.getModels()) {
          const uri = model.uri.toString();
          if (uri.toLowerCase().endsWith('.py') && model.getLanguageId() === 'python') {
            // Use the plain path (without scheme) as VFS path — strip 'file://'
            const vfsUri = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
            handlePythonFile(vfsUri, model.getValue()).catch(() => {});
            // Also set currentUri if not set yet
            if (!currentUri) currentUri = vfsUri;
          }
        }
      });

      let contentDebounce: ReturnType<typeof setTimeout> | null = null;

      api.editor.onDidChangeContent((text) => {
        if (!currentUri.toLowerCase().endsWith('.py')) return;
        if (contentDebounce) clearTimeout(contentDebounce);
        contentDebounce = setTimeout(() => {
          contentDebounce = null;
          const vfsPath = uriToVfsPath(currentUri);
          indexPythonContent(vfsPath, text);
        }, 800);
      });

      // ── Completion item provider ───────────────────────────────────────────
      // Diagnostic: verify Python models and language IDs after a short delay
      setTimeout(() => {
        const allModels = monaco.editor.getModels();
        const pyModels = allModels.filter(m => m.getLanguageId() === 'python');
        console.log(`[PyPlugin] Diagnostics: total models=${allModels.length}, python models=${pyModels.length}`);
        for (const m of pyModels) {
          console.log(`[PyPlugin]   python model: ${m.uri.toString()}`);
        }
        if (allModels.length > 0 && pyModels.length === 0) {
          console.warn('[PyPlugin] WARNING: No models have languageId="python". Completions will not fire!');
          for (const m of allModels) {
            console.log(`[PyPlugin]   model: ${m.uri.toString()} | lang: ${m.getLanguageId()}`);
          }
        }
      }, 500);

      // Use object-form selector — more reliable than string 'python' for scoring
      const completionDisposable = monaco.languages.registerCompletionItemProvider({ language: 'python' }, {
        triggerCharacters: ['.', ' '],

        provideCompletionItems(model, position): monaco.languages.CompletionList {
          const lineUntilCursor = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Word range for replacement
          const word = model.getWordUntilPosition(position);
          const range: monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const ctx = detectContext(lineUntilCursor);
          console.log(`[PyPlugin] complete | ctx=${ctx.type} | currentUri=${currentUri} | fileSymbols=${fileSymbols.size} | classes=${classInfoCache.size} | line="${lineUntilCursor}"`);
          const items: monaco.languages.CompletionItem[] = [];

          if (ctx.type === 'import-module' || ctx.type === 'from-module') {
            // Suggest known stdlib / MicroPython module names
            for (const mod of ALL_MODULE_NAMES) {
              items.push({
                label: mod,
                kind: CK.Module,
                insertText: mod,
                range,
                detail: MODULE_STUBS[mod].length > 0 ? `module (${MODULE_STUBS[mod].length} members)` : 'module',
                sortText: `1_${mod}`,
              });
            }

            const vfsPath = uriToVfsPath(currentUri);
            const fileDir = dirOf(vfsPath);

            // Suggest from directory-scan cache (most reliable — doesn't depend on prior imports)
            const scannedNames = localModuleCache.get(fileDir);
            if (scannedNames) {
              for (const name of scannedNames) {
                if (!ALL_MODULE_NAMES.includes(name) && name !== vfsPath.split('/').pop()?.replace(/\.py$/, '')) {
                  items.push({
                    label: name,
                    kind: CK.Module,
                    insertText: name,
                    range,
                    detail: 'local module',
                    sortText: `0_${name}`,
                  });
                }
              }
            } else {
              // Trigger background scan; next keystroke will get results
              scanLocalModules(fileDir).catch(() => {});
            }

            // Also suggest from already-loaded fileSymbols (fallback / extra coverage)
            for (const [cachedPath] of fileSymbols) {
              if (cachedPath === vfsPath) continue;
              if (cachedPath.startsWith(fileDir + '/')) {
                const rel = cachedPath.slice(fileDir.length + 1).replace(/\.py$/, '').replace(/\//g, '.');
                if (rel && !ALL_MODULE_NAMES.includes(rel) && !items.find(i => i.label === rel)) {
                  items.push({
                    label: rel,
                    kind: CK.Module,
                    insertText: rel,
                    range,
                    detail: 'local module',
                    sortText: `0_${rel}`,
                  });
                }
              }
            }
          } else if (ctx.type === 'from-names') {
            // Members of the module after `from MODULE import `
            const stubs = MODULE_STUBS[ctx.module];
            if (stubs) {
              for (const sym of stubs) {
                items.push(symbolToItem(sym, range, '0'));
              }
            } else {
              // Try to load from VFS
              const vfsPath = uriToVfsPath(currentUri);
              const fileDir = dirOf(vfsPath);
              const candidates = moduleToVfsPaths(ctx.module, fileDir);
              for (const c of candidates) {
                const syms = fileSymbols.get(c);
                if (syms) {
                  for (const sym of syms) items.push(symbolToItem(sym, range, '0'));
                  break;
                }
                // Trigger background load if not cached
                loadFileSymbols(c).catch(() => {});
              }
            }
            // Also add * for wildcard imports
            items.push({
              label: '*',
              kind: CK.Keyword,
              insertText: '*',
              range,
              detail: 'import all',
              sortText: 'z_*',
            });
          } else if (ctx.type === 'dot') {
            // Attribute access: `obj.`
            // Look up `obj` in known modules first
            const objName = ctx.object.split('.').pop() ?? ctx.object;
            const topModule = ctx.object.split('.')[0];

            // Check MODULE_STUBS by the full dotted name first, then by last segment
            const stubs = MODULE_STUBS[ctx.object] ?? MODULE_STUBS[topModule];
            if (stubs) {
              for (const sym of stubs) {
                items.push(symbolToItem(sym, range, '0'));
              }
            }

            // Also provide stubs for the top-level object if it was imported via `import X as alias`
            // by scanning the full model for alias declarations — simple heuristic
            const fullCode = model.getValue();
            const importEntries = extractImports(fullCode);
            for (const entry of importEntries) {
              const resolvedName = entry.alias ?? entry.module.split('.').pop() ?? entry.module;
              if (resolvedName === objName) {
                const moduleStubs = MODULE_STUBS[entry.module];
                if (moduleStubs) {
                  for (const sym of moduleStubs) {
                    if (!items.find(i => i.label === sym.name)) {
                      items.push(symbolToItem(sym, range, '0'));
                    }
                  }
                }
              }
            }

            // Check class info cache: `obj` might be a class name itself (class methods / constants)
            const directClassInfo = classInfoCache.get(ctx.object) ?? classInfoCache.get(objName);
            if (directClassInfo) {
              for (const m of directClassInfo.members) {
                if (!items.find(it => it.label === m.name)) items.push(symbolToItem(m, range, '0'));
              }
            }

            // Check type-inferred local variables: `pin: Pin` or `pin = Pin(...)`
            if (items.length === 0) {
              const localTypes = inferLocalTypes(model.getValue());
              const varTypeName = localTypes.get(ctx.object) ?? localTypes.get(objName);
              if (varTypeName) {
                const cls = classInfoCache.get(varTypeName);
                if (cls) {
                  for (const m of cls.members) items.push(symbolToItem(m, range, '0'));
                }
              }
            }

            // Last resort: scan VFS symbols for a matching class (no stub loaded yet)
            if (items.length === 0) {
              for (const [, syms] of fileSymbols) {
                for (const sym of syms) {
                  if (sym.kind === CK.Class && sym.name === objName) {
                    items.push({ label: '__init__', kind: CK.Method, insertText: '__init__', range, detail: '__init__(self)' });
                    items.push({ label: '__str__', kind: CK.Method, insertText: '__str__', range, detail: '__str__(self) -> str' });
                    items.push({ label: '__repr__', kind: CK.Method, insertText: '__repr__', range, detail: '__repr__(self) -> str' });
                  }
                }
              }
            }
          } else {
            // General completions: builtins + current file symbols + imported names
            const fullCode = model.getValue();
            const importEntries = extractImports(fullCode);

            // 1. Current file symbols
            const vfsPath = uriToVfsPath(currentUri);
            const localSyms = fileSymbols.get(vfsPath) ?? [];
            for (const sym of localSyms) {
              items.push(symbolToItem(sym, range, '0'));
            }

            // 2. Symbols from imported local modules (from X import a, b)
            const fileDir = dirOf(vfsPath);
            for (const entry of importEntries) {
              if (entry.type === 'from' && entry.names) {
                const stubs = MODULE_STUBS[entry.module];
                if (stubs) {
                  for (const name of entry.names) {
                    if (name === '*') {
                      for (const sym of stubs) items.push(symbolToItem(sym, range, '1'));
                    } else {
                      const sym = stubs.find(s => s.name === name);
                      if (sym) items.push(symbolToItem(sym, range, '1'));
                    }
                  }
                } else {
                  // Local VFS module
                  const candidates = moduleToVfsPaths(entry.module, fileDir);
                  for (const c of candidates) {
                    const syms = fileSymbols.get(c);
                    if (syms && entry.names) {
                      for (const name of entry.names) {
                        if (name === '*') {
                          for (const s of syms) items.push(symbolToItem(s, range, '1'));
                        } else {
                          const s = syms.find(x => x.name === name);
                          if (s) items.push(symbolToItem(s, range, '1'));
                        }
                      }
                      break;
                    }
                    loadFileSymbols(c).catch(() => {});
                  }
                }
              }
            }

            // 3. Module names bound via `import X` (as top-level names for dot completions)
            for (const entry of importEntries) {
              if (entry.type === 'import') {
                const alias = entry.alias ?? entry.module.split('.').pop() ?? entry.module;
                items.push({
                  label: alias,
                  kind: CK.Module,
                  insertText: alias,
                  range,
                  detail: `module ${entry.module}`,
                  sortText: `1_${alias}`,
                });
              }
            }

            // 4. Python builtins
            for (const sym of PYTHON_BUILTINS) {
              items.push(symbolToItem(sym, range, '2'));
            }

            // 5. Python keywords
            for (const kw of PY_KEYWORDS) {
              items.push({
                label: kw,
                kind: CK.Keyword,
                insertText: kw,
                range,
                sortText: `3_${kw}`,
              });
            }
          }

          // Deduplicate by label
          const seen = new Set<string>();
          const unique = items.filter(item => {
            const key = `${item.label}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          return { suggestions: unique, incomplete: false };
        },
      });

      // ── Hover provider ─────────────────────────────────────────────────────
      const hoverDisposable = monaco.languages.registerHoverProvider('python', {
        provideHover(model, position): monaco.languages.Hover | null {
          const word = model.getWordAtPosition(position);
          if (!word) return null;

          const name = word.word;
          const range: monaco.IRange = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          // Check builtins
          const builtin = PYTHON_BUILTINS.find(s => s.name === name);
          if (builtin) {
            return {
              range,
              contents: [
                { value: `\`\`\`python\n${builtin.detail ?? name}\n\`\`\`` },
                { value: builtin.doc ?? '' },
              ],
            };
          }

          // Check module stubs — scan all loaded modules for this name
          for (const [mod, stubs] of Object.entries(MODULE_STUBS)) {
            // Skip empty aliases (they're identical to the canonical module)
            if (stubs.length === 0) continue;
            const sym = stubs.find(s => s.name === name);
            if (sym) {
              return {
                range,
                contents: [
                  { value: `\`\`\`python\n${sym.detail ?? sym.name}\n\`\`\`` },
                  { value: `*(from \`${mod}\`)* ${sym.doc ?? ''}` },
                ],
              };
            }
          }

          // Check module names themselves
          if (name in MODULE_STUBS) {
            const count = MODULE_STUBS[name].length;
            return {
              range,
              contents: [
                { value: `\`\`\`python\nimport ${name}\n\`\`\`` },
                { value: count > 0 ? `MicroPython/Python module with ${count} known members.` : 'Python/MicroPython module.' },
              ],
            };
          }

          // Check VFS symbols
          const vfsPath = uriToVfsPath(currentUri);
          const localSyms = fileSymbols.get(vfsPath) ?? [];
          const localSym = localSyms.find(s => s.name === name);
          if (localSym) {
            return {
              range,
              contents: [
                { value: `\`\`\`python\n${localSym.detail ?? localSym.name}\n\`\`\`` },
                { value: localSym.doc ?? '*local symbol*' },
              ],
            };
          }

          return null;
        },
      });

      // ── Signature help provider ──────────────────────────────────────────────
      const signatureDisposable = monaco.languages.registerSignatureHelpProvider('python', {
        signatureHelpTriggerCharacters: ['(', ','],
        signatureHelpRetriggerCharacters: [','],

        provideSignatureHelp(model, position): monaco.languages.SignatureHelpResult | null {
          const lineUntilCursor = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const callCtx = getCallContext(lineUntilCursor);
          if (!callCtx) return null;

          const { funcName, dotObject, activeParam } = callCtx;

          // ── Look up the symbol ──────────────────────────────────────────────
          let sym: PySymbol | undefined;

          if (dotObject) {
            // `module.func(` — look in module stubs by module name
            const stubs = MODULE_STUBS[dotObject] ?? MODULE_STUBS[dotObject.split('.').pop() ?? ''];
            sym = stubs?.find(s => s.name === funcName);

            // Handle aliased imports: `import machine as m` → `m.Pin(`
            if (!sym) {
              const imports = extractImports(model.getValue());
              for (const entry of imports) {
                const alias = entry.alias ?? entry.module.split('.').pop() ?? entry.module;
                if (alias === dotObject) {
                  sym = MODULE_STUBS[entry.module]?.find(s => s.name === funcName);
                  if (sym) break;
                }
              }
            }

            // Check classInfoCache directly: `Pin.value(` where Pin is a stub class
            if (!sym) {
              const classInfo = classInfoCache.get(dotObject)
                ?? classInfoCache.get(dotObject.split('.').pop() ?? '');
              sym = classInfo?.members.find(m => m.name === funcName);
            }

            // Check type inference: `pin.value(` where `pin: Pin` or `pin = Pin(...)`
            if (!sym) {
              const localTypes = inferLocalTypes(model.getValue());
              const varTypeName = localTypes.get(dotObject);
              if (varTypeName) {
                const cls = classInfoCache.get(varTypeName);
                sym = cls?.members.find(m => m.name === funcName);
              }
            }
          } else {
            // Direct call: check builtins → imported names → VFS local symbols → stub classes
            sym = PYTHON_BUILTINS.find(s => s.name === funcName);

            if (!sym) {
              const imports = extractImports(model.getValue());
              for (const entry of imports) {
                if (entry.type === 'from' && entry.names?.includes(funcName)) {
                  sym = MODULE_STUBS[entry.module]?.find(s => s.name === funcName);
                  if (sym) break;
                }
                // `import X` then `X(` where X is a class/function (rare but valid)
                if (entry.type === 'import' && (entry.alias ?? entry.module) === funcName) {
                  sym = MODULE_STUBS[entry.module]?.find(s => s.name === funcName);
                  if (sym) break;
                }
              }
            }

            if (!sym) {
              const vfsPath = uriToVfsPath(currentUri);
              sym = fileSymbols.get(vfsPath)?.find(s => s.name === funcName);
              // Also scan cached VFS files (imported local modules)
              if (!sym) {
                for (const [, syms] of fileSymbols) {
                  const found = syms.find(s => s.name === funcName);
                  if (found) { sym = found; break; }
                }
              }
            }

            // Check classInfoCache: direct constructor call `Pin(` — use __init__ if present
            if (!sym) {
              const classInfo = classInfoCache.get(funcName);
              if (classInfo) {
                const initSym = classInfo.members.find(m => m.name === '__init__');
                sym = initSym ?? { name: funcName, kind: CK.Class, doc: classInfo.doc };
              }
            }
          }

          if (!sym) return null;

          const sigInfo = buildSignatureInfo(sym);
          if (!sigInfo || sigInfo.parameters.length === 0) return null;

          const clampedParam = Math.max(0, Math.min(activeParam, sigInfo.parameters.length - 1));

          return {
            value: {
              signatures: [sigInfo],
              activeSignature: 0,
              activeParameter: clampedParam,
            },
            dispose() {},
          };
        },
      });

      api.logger.info('Python IntelliSense activated (MicroPython stubs + VFS symbol extraction + signature help)');

      // Store disposables for deactivation (via closure variable)
      pyDisposables.push(completionDisposable, hoverDisposable, signatureDisposable, statusItem);
    },

    deactivate() {
      for (const d of pyDisposables) {
        try { d.dispose(); } catch { /* ignore */ }
      }
      pyDisposables.length = 0;
    },
  };
}

// ── Python keywords (for general completions) ────────────────────────────────

const PY_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
];
