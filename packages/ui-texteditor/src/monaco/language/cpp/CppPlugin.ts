import * as monaco from 'monaco-editor';
import { definePlugin } from '../../plugins/PluginSystem';
import type { PluginContext } from '../../plugins/PluginSystem';
import type { Disposable } from '../../utils/types';
import { cppLanguageConfiguration } from './CppLanguageConfig';
import { createCppCompletionProvider } from './CppCompletionProvider';
import { createCppHoverProvider } from './CppHoverProvider';

/**
 * C++ Language Support Plugin
 * Provides full C++ language support including:
 * - Syntax highlighting (built-in Monaco)
 * - Code completion with keywords, STL types, and snippets
 * - Hover documentation
 * - Language configuration (comments, brackets, etc.)
 */
export const CppLanguagePlugin = definePlugin(
  {
    id: 'cpp-language',
    name: 'C++ Language Support',
    version: '1.0.0',
    description: 'Full C++ language support with IntelliSense, snippets, and documentation',
  },
  (_context: PluginContext) => {
    const disposables: Disposable[] = [];

    // Register language configuration
    const languageConfig = monaco.languages.setLanguageConfiguration(
      'cpp',
      cppLanguageConfiguration
    );
    disposables.push(languageConfig);

    // Also register for C
    const cLanguageConfig = monaco.languages.setLanguageConfiguration(
      'c',
      cppLanguageConfiguration
    );
    disposables.push(cLanguageConfig);

    // Register completion provider
    const completionProvider = monaco.languages.registerCompletionItemProvider(
      'cpp',
      createCppCompletionProvider()
    );
    disposables.push(completionProvider);

    // Also for C
    const cCompletionProvider = monaco.languages.registerCompletionItemProvider(
      'c',
      createCppCompletionProvider()
    );
    disposables.push(cCompletionProvider);

    // Register hover provider
    const hoverProvider = monaco.languages.registerHoverProvider(
      'cpp',
      createCppHoverProvider()
    );
    disposables.push(hoverProvider);

    // Also for C
    const cHoverProvider = monaco.languages.registerHoverProvider(
      'c',
      createCppHoverProvider()
    );
    disposables.push(cHoverProvider);

    // Register signature help provider for function calls
    const signatureProvider = monaco.languages.registerSignatureHelpProvider(
      'cpp',
      {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp(
          model: monaco.editor.ITextModel,
          position: monaco.Position
        ): monaco.languages.ProviderResult<monaco.languages.SignatureHelpResult> {
          // Get the text before cursor
          const lineContent = model.getLineContent(position.lineNumber);
          const textUntil = lineContent.substring(0, position.column - 1);

          // Find the function name
          const match = textUntil.match(/(\w+)\s*\([^)]*$/);
          if (!match) {
            return null;
          }

          const funcName = match[1];

          // Common function signatures
          const signatures: Record<string, monaco.languages.SignatureInformation> = {
            'printf': {
              label: 'printf(const char* format, ...)',
              documentation: 'Prints formatted output to stdout',
              parameters: [
                { label: 'format', documentation: 'Format string with conversion specifiers' },
                { label: '...', documentation: 'Additional arguments' },
              ],
            },
            'malloc': {
              label: 'void* malloc(size_t size)',
              documentation: 'Allocates memory block of given size',
              parameters: [
                { label: 'size', documentation: 'Number of bytes to allocate' },
              ],
            },
            'memcpy': {
              label: 'void* memcpy(void* dest, const void* src, size_t count)',
              documentation: 'Copies bytes from source to destination',
              parameters: [
                { label: 'dest', documentation: 'Destination buffer' },
                { label: 'src', documentation: 'Source buffer' },
                { label: 'count', documentation: 'Number of bytes to copy' },
              ],
            },
            'strlen': {
              label: 'size_t strlen(const char* str)',
              documentation: 'Returns the length of a null-terminated string',
              parameters: [
                { label: 'str', documentation: 'Null-terminated string' },
              ],
            },
            'strcmp': {
              label: 'int strcmp(const char* lhs, const char* rhs)',
              documentation: 'Compares two null-terminated strings lexicographically',
              parameters: [
                { label: 'lhs', documentation: 'First string to compare' },
                { label: 'rhs', documentation: 'Second string to compare' },
              ],
            },
          };

          const sig = signatures[funcName];
          if (!sig) {
            return null;
          }

          // Count commas to determine active parameter
          const afterParen = textUntil.substring(textUntil.lastIndexOf('('));
          const commaCount = (afterParen.match(/,/g) ?? []).length;

          return {
            value: {
              signatures: [sig],
              activeSignature: 0,
              activeParameter: Math.min(commaCount, (sig.parameters?.length ?? 1) - 1),
            },
            dispose: () => {},
          };
        },
      }
    );
    disposables.push(signatureProvider);

    // Store cleanup function
    (CppLanguagePlugin as { cleanup?: () => void }).cleanup = () => {
      disposables.forEach((d) => d.dispose());
    };

    console.log('C++ Language Support activated');
  },
  () => {
    (CppLanguagePlugin as { cleanup?: () => void }).cleanup?.();
    console.log('C++ Language Support deactivated');
  }
);
