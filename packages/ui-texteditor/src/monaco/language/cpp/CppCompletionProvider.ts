import * as monaco from 'monaco-editor';
import { cppKeywords, cppStdTypes, cppFunctions } from './CppLanguageConfig';

/**
 * C++ code snippets
 */
const cppSnippets: Array<{
  label: string;
  insertText: string;
  documentation: string;
}> = [
  {
    label: 'main',
    insertText: [
      'int main(int argc, char* argv[]) {',
      '\t${1:// code}',
      '\treturn 0;',
      '}',
    ].join('\n'),
    documentation: 'Main function with arguments',
  },
  {
    label: 'main-simple',
    insertText: ['int main() {', '\t${1:// code}', '\treturn 0;', '}'].join(
      '\n'
    ),
    documentation: 'Simple main function',
  },
  {
    label: 'class',
    insertText: [
      'class ${1:ClassName} {',
      'public:',
      '\t${1:ClassName}();',
      '\t~${1:ClassName}();',
      '',
      'private:',
      '\t${2:// members}',
      '};',
    ].join('\n'),
    documentation: 'Class declaration with constructor and destructor',
  },
  {
    label: 'struct',
    insertText: ['struct ${1:StructName} {', '\t${2:// members}', '};'].join(
      '\n'
    ),
    documentation: 'Struct declaration',
  },
  {
    label: 'template-class',
    insertText: [
      'template<typename ${1:T}>',
      'class ${2:ClassName} {',
      'public:',
      '\t${3:// methods}',
      '',
      'private:',
      '\t${4:// members}',
      '};',
    ].join('\n'),
    documentation: 'Template class declaration',
  },
  {
    label: 'template-function',
    insertText: [
      'template<typename ${1:T}>',
      '${2:T} ${3:functionName}(${4:T param}) {',
      '\t${5:// code}',
      '}',
    ].join('\n'),
    documentation: 'Template function declaration',
  },
  {
    label: 'for',
    insertText: [
      'for (${1:int} ${2:i} = 0; ${2:i} < ${3:count}; ++${2:i}) {',
      '\t${4:// code}',
      '}',
    ].join('\n'),
    documentation: 'For loop',
  },
  {
    label: 'for-range',
    insertText: ['for (${1:auto}& ${2:item} : ${3:container}) {', '\t${4:// code}', '}'].join(
      '\n'
    ),
    documentation: 'Range-based for loop',
  },
  {
    label: 'for-auto',
    insertText: [
      'for (auto it = ${1:container}.begin(); it != ${1:container}.end(); ++it) {',
      '\t${2:// code}',
      '}',
    ].join('\n'),
    documentation: 'Iterator-based for loop',
  },
  {
    label: 'while',
    insertText: ['while (${1:condition}) {', '\t${2:// code}', '}'].join('\n'),
    documentation: 'While loop',
  },
  {
    label: 'do-while',
    insertText: ['do {', '\t${1:// code}', '} while (${2:condition});'].join(
      '\n'
    ),
    documentation: 'Do-while loop',
  },
  {
    label: 'if',
    insertText: ['if (${1:condition}) {', '\t${2:// code}', '}'].join('\n'),
    documentation: 'If statement',
  },
  {
    label: 'if-else',
    insertText: [
      'if (${1:condition}) {',
      '\t${2:// code}',
      '} else {',
      '\t${3:// code}',
      '}',
    ].join('\n'),
    documentation: 'If-else statement',
  },
  {
    label: 'switch',
    insertText: [
      'switch (${1:expression}) {',
      '\tcase ${2:value1}:',
      '\t\t${3:// code}',
      '\t\tbreak;',
      '\tcase ${4:value2}:',
      '\t\t${5:// code}',
      '\t\tbreak;',
      '\tdefault:',
      '\t\t${6:// code}',
      '\t\tbreak;',
      '}',
    ].join('\n'),
    documentation: 'Switch statement',
  },
  {
    label: 'try-catch',
    insertText: [
      'try {',
      '\t${1:// code}',
      '} catch (const ${2:std::exception}& ${3:e}) {',
      '\t${4:// handle exception}',
      '}',
    ].join('\n'),
    documentation: 'Try-catch block',
  },
  {
    label: 'lambda',
    insertText: '[${1:capture}](${2:params}) ${3:-> returnType }{',
    documentation: 'Lambda expression',
  },
  {
    label: 'lambda-full',
    insertText: [
      'auto ${1:lambdaName} = [${2:capture}](${3:params}) -> ${4:void} {',
      '\t${5:// code}',
      '};',
    ].join('\n'),
    documentation: 'Named lambda expression',
  },
  {
    label: 'enum-class',
    insertText: [
      'enum class ${1:EnumName} {',
      '\t${2:Value1},',
      '\t${3:Value2},',
      '\t${4:Value3}',
      '};',
    ].join('\n'),
    documentation: 'Scoped enum declaration',
  },
  {
    label: 'namespace',
    insertText: ['namespace ${1:name} {', '', '${2:// code}', '', '} // namespace ${1:name}'].join('\n'),
    documentation: 'Namespace declaration',
  },
  {
    label: 'include',
    insertText: '#include <${1:header}>',
    documentation: 'Include system header',
  },
  {
    label: 'include-local',
    insertText: '#include "${1:header}"',
    documentation: 'Include local header',
  },
  {
    label: 'pragma-once',
    insertText: '#pragma once',
    documentation: 'Include guard pragma',
  },
  {
    label: 'header-guard',
    insertText: [
      '#ifndef ${1:HEADER_NAME}_H',
      '#define ${1:HEADER_NAME}_H',
      '',
      '${2:// declarations}',
      '',
      '#endif // ${1:HEADER_NAME}_H',
    ].join('\n'),
    documentation: 'Header include guard',
  },
  {
    label: 'unique_ptr',
    insertText: 'std::unique_ptr<${1:Type}> ${2:name} = std::make_unique<${1:Type}>(${3:args});',
    documentation: 'Create unique_ptr',
  },
  {
    label: 'shared_ptr',
    insertText: 'std::shared_ptr<${1:Type}> ${2:name} = std::make_shared<${1:Type}>(${3:args});',
    documentation: 'Create shared_ptr',
  },
  {
    label: 'vector',
    insertText: 'std::vector<${1:Type}> ${2:name};',
    documentation: 'Declare vector',
  },
  {
    label: 'map',
    insertText: 'std::map<${1:KeyType}, ${2:ValueType}> ${3:name};',
    documentation: 'Declare map',
  },
  {
    label: 'unordered_map',
    insertText: 'std::unordered_map<${1:KeyType}, ${2:ValueType}> ${3:name};',
    documentation: 'Declare unordered_map',
  },
  {
    label: 'cout',
    insertText: 'std::cout << ${1:value} << std::endl;',
    documentation: 'Console output',
  },
  {
    label: 'cin',
    insertText: 'std::cin >> ${1:variable};',
    documentation: 'Console input',
  },
  {
    label: 'cerr',
    insertText: 'std::cerr << ${1:error} << std::endl;',
    documentation: 'Error output',
  },
];

interface DocumentSymbol {
  name: string;
  kind: monaco.languages.CompletionItemKind;
  detail?: string;
  line: number;
}

/**
 * Parses the document to find user-defined symbols (variables, functions, classes, etc.)
 */
function parseDocumentSymbols(model: monaco.editor.ITextModel): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const seenNames = new Set<string>();
  const lineCount = model.getLineCount();

  // Common C++ types for variable detection
  const typePatterns = [
    'int', 'float', 'double', 'char', 'bool', 'void', 'long', 'short',
    'unsigned', 'signed', 'auto', 'const', 'static', 'extern',
    'size_t', 'string', 'wstring',
    'int8_t', 'int16_t', 'int32_t', 'int64_t',
    'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  ];

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
    const line = model.getLineContent(lineNumber);
    const trimmedLine = line.trim();

    // Skip comments and preprocessor directives
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
      continue;
    }

    // Match function definitions: returnType functionName(params) { or ;
    // e.g., "int foo(int x, int y)" or "void bar()"
    const funcMatch = line.match(
      /^\s*(?:(?:inline|static|virtual|explicit|constexpr|const)\s+)*(\w+(?:\s*[*&]+)?(?:\s*<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:override|final|noexcept)?\s*[{;]?/
    );
    if (funcMatch) {
      const returnType = funcMatch[1]?.trim();
      const funcName = funcMatch[2];
      // Exclude control flow keywords and known types
      if (funcName && !['if', 'while', 'for', 'switch', 'catch', 'return'].includes(funcName) &&
          !seenNames.has(funcName)) {
        seenNames.add(funcName);
        symbols.push({
          name: funcName,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: `${returnType ?? ''} ${funcName}(${funcMatch[3] ?? ''})`,
          line: lineNumber,
        });
      }
    }

    // Match class/struct definitions: class/struct Name { or : or ;
    const classMatch = line.match(/^\s*(?:template\s*<[^>]*>\s*)?(class|struct)\s+(\w+)/);
    if (classMatch) {
      const className = classMatch[2];
      if (className && !seenNames.has(className)) {
        seenNames.add(className);
        symbols.push({
          name: className,
          kind: classMatch[1] === 'class'
            ? monaco.languages.CompletionItemKind.Class
            : monaco.languages.CompletionItemKind.Struct,
          detail: `${classMatch[1]} ${className}`,
          line: lineNumber,
        });
      }
    }

    // Match enum definitions
    const enumMatch = line.match(/^\s*enum\s+(?:class\s+)?(\w+)/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      if (enumName && !seenNames.has(enumName)) {
        seenNames.add(enumName);
        symbols.push({
          name: enumName,
          kind: monaco.languages.CompletionItemKind.Enum,
          detail: `enum ${enumName}`,
          line: lineNumber,
        });
      }
    }

    // Match typedef/using type aliases
    const typedefMatch = line.match(/^\s*(?:typedef\s+.+\s+(\w+)|using\s+(\w+)\s*=)/);
    if (typedefMatch) {
      const typeName = typedefMatch[1] ?? typedefMatch[2];
      if (typeName && !seenNames.has(typeName)) {
        seenNames.add(typeName);
        symbols.push({
          name: typeName,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          detail: `type alias ${typeName}`,
          line: lineNumber,
        });
      }
    }

    // Match variable declarations
    // Patterns: "Type name;", "Type name = value;", "Type* name;", "Type& name;"
    // Also: "std::vector<int> name;", "auto name = ..."
    const varPatterns = [
      // Standard types: int x; or int x = 5;
      /^\s*(?:const\s+)?(?:static\s+)?(\w+)\s*([*&]*)\s+(\w+)\s*(?:=|;|\[)/,
      // std:: types: std::string name; std::vector<int> vec;
      /^\s*(?:const\s+)?(?:static\s+)?std::(\w+)(?:<[^>]+>)?\s*([*&]*)\s+(\w+)\s*(?:=|;|\(|\[)/,
      // auto: auto name = ...
      /^\s*(?:const\s+)?auto\s*([*&]*)\s+(\w+)\s*=/,
    ];

    for (const pattern of varPatterns) {
      const varMatch = line.match(pattern);
      if (varMatch) {
        let varName: string | undefined;
        let varType: string | undefined;

        if (pattern.source.includes('auto')) {
          // auto pattern
          varName = varMatch[2];
          varType = 'auto';
        } else if (pattern.source.includes('std::')) {
          // std:: pattern
          varName = varMatch[3];
          varType = `std::${varMatch[1]}`;
        } else {
          // standard pattern
          varType = varMatch[1];
          varName = varMatch[3];
        }

        // Skip if it's a type keyword or function name
        if (varName && varType &&
            !typePatterns.includes(varName) &&
            !['if', 'while', 'for', 'switch', 'return', 'class', 'struct', 'enum', 'namespace'].includes(varName) &&
            !seenNames.has(varName)) {
          seenNames.add(varName);
          symbols.push({
            name: varName,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: varType,
            line: lineNumber,
          });
        }
        break; // Only match one pattern per line
      }
    }

    // Match #define macros
    const defineMatch = line.match(/^\s*#define\s+(\w+)/);
    if (defineMatch) {
      const macroName = defineMatch[1];
      if (macroName && !seenNames.has(macroName)) {
        seenNames.add(macroName);
        symbols.push({
          name: macroName,
          kind: monaco.languages.CompletionItemKind.Constant,
          detail: 'macro',
          line: lineNumber,
        });
      }
    }
  }

  return symbols;
}

/**
 * Creates a C++ completion item provider
 */
export function createCppCompletionProvider(): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.', ':', '<', '"', '/', '#'],

    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineContent = model.getLineContent(position.lineNumber);
      const textUntilPosition = lineContent.substring(0, position.column - 1);

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Check context for better suggestions
      const isInclude = textUntilPosition.includes('#include');
      const isAfterStd = textUntilPosition.endsWith('std::');
      const isAfterScope = textUntilPosition.match(/::\s*$/);

      // Snippets
      for (const snippet of cppSnippets) {
        suggestions.push({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: snippet.documentation,
          range,
        });
      }

      // Keywords
      for (const keyword of cppKeywords) {
        suggestions.push({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
        });
      }

      // Standard library types (with std:: prefix if not already present)
      for (const type of cppStdTypes) {
        const insertText = isAfterStd || isAfterScope ? type : `std::${type}`;
        suggestions.push({
          label: isAfterStd ? type : `std::${type}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: isAfterStd ? type : insertText,
          detail: 'C++ Standard Library',
          range,
        });
      }

      // Functions
      for (const func of cppFunctions) {
        suggestions.push({
          label: func,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: func.includes('::') ? func : `${func}($1)`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }

      // Common includes when in #include context
      if (isInclude) {
        const commonHeaders = [
          'iostream', 'fstream', 'sstream', 'string', 'vector', 'map',
          'set', 'unordered_map', 'unordered_set', 'algorithm', 'functional',
          'memory', 'utility', 'tuple', 'array', 'deque', 'list', 'queue',
          'stack', 'bitset', 'numeric', 'iterator', 'limits', 'cmath',
          'cstdlib', 'cstdio', 'cstring', 'cctype', 'ctime', 'cassert',
          'stdexcept', 'exception', 'typeinfo', 'thread', 'mutex',
          'condition_variable', 'future', 'atomic', 'chrono', 'random',
          'regex', 'filesystem', 'optional', 'variant', 'any', 'span',
          'ranges', 'concepts', 'format', 'source_location',
        ];

        for (const header of commonHeaders) {
          suggestions.push({
            label: header,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: header,
            detail: 'C++ Standard Header',
            range,
          });
        }
      }

      // Parse document for user-defined symbols
      const documentSymbols = parseDocumentSymbols(model);
      for (const symbol of documentSymbols) {
        // Add parentheses for functions
        const insertText = symbol.kind === monaco.languages.CompletionItemKind.Function
          ? `${symbol.name}($1)`
          : symbol.name;

        suggestions.push({
          label: symbol.name,
          kind: symbol.kind,
          insertText,
          insertTextRules: symbol.kind === monaco.languages.CompletionItemKind.Function
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: symbol.detail,
          documentation: `Defined at line ${symbol.line}`,
          sortText: `0_${symbol.name}`, // Sort user symbols first
          range,
        });
      }

      return { suggestions };
    },
  };
}
