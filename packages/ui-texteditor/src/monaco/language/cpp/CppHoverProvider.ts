import * as monaco from 'monaco-editor';

/**
 * C++ documentation database
 */
const cppDocs: Record<string, { signature: string; description: string; example?: string }> = {
  // Keywords
  'auto': {
    signature: 'auto',
    description: 'Automatic type deduction. The compiler deduces the type from the initializer.',
    example: 'auto x = 42; // x is int\nauto s = "hello"s; // s is std::string',
  },
  'const': {
    signature: 'const',
    description: 'Declares a variable as constant (immutable). Can also be used for const-correctness in member functions.',
    example: 'const int x = 10;\nvoid foo() const; // const member function',
  },
  'constexpr': {
    signature: 'constexpr',
    description: 'Specifies that the value of a variable or function can be evaluated at compile time.',
    example: 'constexpr int square(int n) { return n * n; }\nconstexpr int x = square(5); // evaluated at compile time',
  },
  'nullptr': {
    signature: 'nullptr',
    description: 'Null pointer literal of type std::nullptr_t. Preferred over NULL or 0 for null pointers.',
    example: 'int* ptr = nullptr;',
  },
  'override': {
    signature: 'override',
    description: 'Specifies that a virtual function overrides a base class virtual function.',
    example: 'void foo() override; // Compiler error if not overriding',
  },
  'final': {
    signature: 'final',
    description: 'Prevents a class from being inherited or a virtual function from being overridden.',
    example: 'class Derived final : Base {};\nvoid foo() final;',
  },
  'noexcept': {
    signature: 'noexcept',
    description: 'Specifies that a function does not throw exceptions.',
    example: 'void foo() noexcept;\nvoid bar() noexcept(true);',
  },
  'decltype': {
    signature: 'decltype(expression)',
    description: 'Yields the type of an expression without evaluating it.',
    example: 'int x = 0;\ndecltype(x) y = 1; // y is int',
  },

  // STL Containers
  'vector': {
    signature: 'template<class T, class Allocator = std::allocator<T>> class vector',
    description: 'Dynamic array that can grow and shrink. Provides random access and efficient insertion at the end.',
    example: 'std::vector<int> v = {1, 2, 3};\nv.push_back(4);\nv[0] = 10;',
  },
  'map': {
    signature: 'template<class Key, class T, class Compare = std::less<Key>> class map',
    description: 'Sorted associative container with unique keys. Implemented as a red-black tree.',
    example: 'std::map<std::string, int> m;\nm["one"] = 1;\nm.insert({"two", 2});',
  },
  'unordered_map': {
    signature: 'template<class Key, class T, class Hash = std::hash<Key>> class unordered_map',
    description: 'Hash table based associative container. Average O(1) lookup.',
    example: 'std::unordered_map<std::string, int> m;\nm["key"] = 42;',
  },
  'set': {
    signature: 'template<class Key, class Compare = std::less<Key>> class set',
    description: 'Sorted container with unique elements.',
    example: 'std::set<int> s = {3, 1, 4, 1, 5}; // {1, 3, 4, 5}',
  },
  'string': {
    signature: 'using string = basic_string<char>',
    description: 'Standard string class for character sequences.',
    example: 'std::string s = "Hello";\ns += " World";\nsize_t len = s.length();',
  },
  'array': {
    signature: 'template<class T, std::size_t N> struct array',
    description: 'Fixed-size array container. Size is known at compile time.',
    example: 'std::array<int, 5> arr = {1, 2, 3, 4, 5};',
  },

  // Smart Pointers
  'unique_ptr': {
    signature: 'template<class T, class Deleter = std::default_delete<T>> class unique_ptr',
    description: 'Smart pointer with exclusive ownership semantics. Cannot be copied, only moved.',
    example: 'auto ptr = std::make_unique<int>(42);\nint value = *ptr;',
  },
  'shared_ptr': {
    signature: 'template<class T> class shared_ptr',
    description: 'Smart pointer with shared ownership. Uses reference counting.',
    example: 'auto ptr = std::make_shared<int>(42);\nauto ptr2 = ptr; // Both point to same object',
  },
  'weak_ptr': {
    signature: 'template<class T> class weak_ptr',
    description: 'Non-owning reference to an object managed by shared_ptr. Prevents circular references.',
    example: 'std::weak_ptr<int> wp = sp; // sp is shared_ptr\nif (auto locked = wp.lock()) { }',
  },

  // Functions
  'make_unique': {
    signature: 'template<class T, class... Args> unique_ptr<T> make_unique(Args&&... args)',
    description: 'Creates a unique_ptr that manages a new object.',
    example: 'auto p = std::make_unique<MyClass>(arg1, arg2);',
  },
  'make_shared': {
    signature: 'template<class T, class... Args> shared_ptr<T> make_shared(Args&&... args)',
    description: 'Creates a shared_ptr with a single memory allocation for both object and control block.',
    example: 'auto p = std::make_shared<MyClass>(arg1, arg2);',
  },
  'move': {
    signature: 'template<class T> remove_reference_t<T>&& move(T&& t) noexcept',
    description: 'Converts an lvalue to an rvalue, enabling move semantics.',
    example: 'std::vector<int> v2 = std::move(v1); // v1 is now empty',
  },
  'forward': {
    signature: 'template<class T> T&& forward(remove_reference_t<T>& t) noexcept',
    description: 'Perfect forwarding - preserves the value category of an argument.',
    example: 'template<class T> void wrapper(T&& arg) { foo(std::forward<T>(arg)); }',
  },
  'sort': {
    signature: 'template<class RandomIt> void sort(RandomIt first, RandomIt last)',
    description: 'Sorts elements in ascending order using introsort (quicksort + heapsort + insertion sort).',
    example: 'std::sort(v.begin(), v.end());\nstd::sort(v.begin(), v.end(), std::greater<>());',
  },
  'find': {
    signature: 'template<class InputIt, class T> InputIt find(InputIt first, InputIt last, const T& value)',
    description: 'Finds the first element equal to value.',
    example: 'auto it = std::find(v.begin(), v.end(), 42);\nif (it != v.end()) { /* found */ }',
  },
  'find_if': {
    signature: 'template<class InputIt, class Pred> InputIt find_if(InputIt first, InputIt last, Pred pred)',
    description: 'Finds the first element satisfying the predicate.',
    example: 'auto it = std::find_if(v.begin(), v.end(), [](int x) { return x > 0; });',
  },
  'transform': {
    signature: 'template<class InputIt, class OutputIt, class UnaryOp> OutputIt transform(...)',
    description: 'Applies a function to each element and stores the result.',
    example: 'std::transform(v.begin(), v.end(), v.begin(), [](int x) { return x * 2; });',
  },
  'accumulate': {
    signature: 'template<class InputIt, class T> T accumulate(InputIt first, InputIt last, T init)',
    description: 'Computes the sum of elements (or applies a binary operation).',
    example: 'int sum = std::accumulate(v.begin(), v.end(), 0);',
  },
  'cout': {
    signature: 'extern ostream cout',
    description: 'Standard output stream object associated with stdout.',
    example: 'std::cout << "Hello, World!" << std::endl;',
  },
  'cin': {
    signature: 'extern istream cin',
    description: 'Standard input stream object associated with stdin.',
    example: 'int x;\nstd::cin >> x;',
  },
  'endl': {
    signature: 'template<class CharT, class Traits> basic_ostream<CharT,Traits>& endl(...)',
    description: 'Outputs a newline character and flushes the stream.',
    example: 'std::cout << "Line" << std::endl;',
  },

  // Threading
  'thread': {
    signature: 'class thread',
    description: 'Represents a single thread of execution.',
    example: 'std::thread t([]{ /* work */ });\nt.join();',
  },
  'mutex': {
    signature: 'class mutex',
    description: 'Mutual exclusion primitive for protecting shared data.',
    example: 'std::mutex m;\nm.lock();\n// critical section\nm.unlock();',
  },
  'lock_guard': {
    signature: 'template<class Mutex> class lock_guard',
    description: 'RAII wrapper for mutex. Locks on construction, unlocks on destruction.',
    example: 'std::lock_guard<std::mutex> lock(m);\n// mutex released when lock goes out of scope',
  },
  'async': {
    signature: 'template<class F, class... Args> future<...> async(F&& f, Args&&... args)',
    description: 'Runs a function asynchronously and returns a future for the result.',
    example: 'auto future = std::async(std::launch::async, computeValue);\nint result = future.get();',
  },
  'atomic': {
    signature: 'template<class T> struct atomic',
    description: 'Atomic type for lock-free programming.',
    example: 'std::atomic<int> counter{0};\ncounter.fetch_add(1);',
  },
};

/**
 * Creates a C++ hover provider
 */
export function createCppHoverProvider(): monaco.languages.HoverProvider {
  return {
    provideHover(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.ProviderResult<monaco.languages.Hover> {
      const word = model.getWordAtPosition(position);
      if (!word) {
        return null;
      }

      const token = word.word;

      // Look up documentation
      let doc = cppDocs[token];

      // Try without std:: prefix
      if (!doc && token.startsWith('std::')) {
        doc = cppDocs[token.substring(5)];
      }

      if (!doc) {
        return null;
      }

      const contents: monaco.IMarkdownString[] = [
        {
          value: '```cpp\n' + doc.signature + '\n```',
        },
        {
          value: doc.description,
        },
      ];

      if (doc.example) {
        contents.push({
          value: '**Example:**\n```cpp\n' + doc.example + '\n```',
        });
      }

      return {
        contents,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        },
      };
    },
  };
}
