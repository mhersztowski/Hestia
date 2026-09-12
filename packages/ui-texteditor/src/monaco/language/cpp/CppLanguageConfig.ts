import type * as monaco from 'monaco-editor';

/**
 * C++ language configuration for Monaco editor
 */
export const cppLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>', notIn: ['string'] },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  folding: {
    markers: {
      start: /^\s*#pragma\s+region\b/,
      end: /^\s*#pragma\s+endregion\b/,
    },
  },
  wordPattern:
    /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
  indentationRules: {
    increaseIndentPattern:
      /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/,
    decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/,
  },
};

/**
 * C++ keywords
 */
export const cppKeywords = [
  // Storage class specifiers
  'auto', 'register', 'static', 'extern', 'mutable', 'thread_local',
  // Type specifiers
  'void', 'bool', 'char', 'short', 'int', 'long', 'float', 'double',
  'signed', 'unsigned', 'wchar_t', 'char8_t', 'char16_t', 'char32_t',
  // Complex types
  'class', 'struct', 'union', 'enum',
  // CV qualifiers
  'const', 'volatile',
  // Function specifiers
  'inline', 'virtual', 'explicit', 'constexpr', 'consteval', 'constinit',
  // Class access
  'public', 'private', 'protected',
  // Control flow
  'if', 'else', 'switch', 'case', 'default',
  'for', 'while', 'do', 'break', 'continue', 'goto',
  'return', 'throw', 'try', 'catch',
  // Operators
  'new', 'delete', 'sizeof', 'alignof', 'typeid', 'decltype',
  'noexcept', 'co_await', 'co_return', 'co_yield',
  // Other keywords
  'namespace', 'using', 'typedef', 'typename', 'template',
  'this', 'friend', 'operator',
  'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast',
  'nullptr', 'true', 'false',
  'final', 'override', 'requires', 'concept', 'export', 'import', 'module',
  // Preprocessor
  '#include', '#define', '#undef', '#ifdef', '#ifndef', '#if', '#else',
  '#elif', '#endif', '#pragma', '#error', '#warning', '#line',
];

/**
 * C++ standard library types
 */
export const cppStdTypes = [
  // Containers
  'vector', 'list', 'deque', 'array', 'forward_list',
  'set', 'multiset', 'map', 'multimap',
  'unordered_set', 'unordered_multiset', 'unordered_map', 'unordered_multimap',
  'stack', 'queue', 'priority_queue',
  // Strings
  'string', 'wstring', 'u8string', 'u16string', 'u32string',
  'string_view', 'basic_string',
  // Smart pointers
  'unique_ptr', 'shared_ptr', 'weak_ptr', 'auto_ptr',
  // Utility
  'pair', 'tuple', 'optional', 'variant', 'any',
  'function', 'bind', 'reference_wrapper',
  // IO
  'iostream', 'istream', 'ostream', 'fstream', 'ifstream', 'ofstream',
  'stringstream', 'istringstream', 'ostringstream',
  'cin', 'cout', 'cerr', 'clog',
  // Threading
  'thread', 'mutex', 'recursive_mutex', 'shared_mutex',
  'lock_guard', 'unique_lock', 'shared_lock', 'scoped_lock',
  'condition_variable', 'future', 'promise', 'async',
  'atomic', 'atomic_flag',
  // Iterators
  'iterator', 'const_iterator', 'reverse_iterator',
  'begin', 'end', 'cbegin', 'cend', 'rbegin', 'rend',
  // Algorithms
  'sort', 'find', 'find_if', 'count', 'count_if',
  'transform', 'copy', 'move', 'swap', 'fill',
  'accumulate', 'reduce', 'inner_product',
  // Memory
  'allocator', 'make_unique', 'make_shared',
  // Other
  'size_t', 'ptrdiff_t', 'nullptr_t', 'byte',
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
];

/**
 * Common C++ functions
 */
export const cppFunctions = [
  // IO
  'printf', 'scanf', 'sprintf', 'sscanf', 'fprintf', 'fscanf',
  'puts', 'gets', 'getchar', 'putchar', 'getline',
  // Memory
  'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memmove', 'memset',
  // String C
  'strlen', 'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp',
  'strchr', 'strrchr', 'strstr', 'strtok',
  // Math
  'abs', 'fabs', 'sqrt', 'pow', 'exp', 'log', 'log10', 'log2',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'ceil', 'floor', 'round', 'trunc', 'fmod',
  'min', 'max', 'clamp',
  // Utility
  'exit', 'abort', 'atexit', 'system', 'getenv',
  'rand', 'srand', 'time',
  // STL algorithms
  'std::sort', 'std::find', 'std::count', 'std::transform',
  'std::copy', 'std::move', 'std::swap', 'std::fill',
  'std::for_each', 'std::any_of', 'std::all_of', 'std::none_of',
  'std::remove', 'std::remove_if', 'std::replace', 'std::replace_if',
  'std::unique', 'std::reverse', 'std::rotate',
  'std::lower_bound', 'std::upper_bound', 'std::binary_search',
  'std::merge', 'std::set_union', 'std::set_intersection',
  'std::accumulate', 'std::reduce', 'std::inner_product',
  'std::make_pair', 'std::make_tuple', 'std::tie', 'std::get',
  'std::make_unique', 'std::make_shared',
];
