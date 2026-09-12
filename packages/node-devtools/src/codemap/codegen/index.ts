import { CodeModel, Language } from '../model/CodeModel.js';
import { generateCpp } from './cppCodegen.js';
import { generatePython } from './pyCodegen.js';
import { generateTs } from './tsCodegen.js';

export interface GeneratedFile { file: string; content: string }

/** Generate source-code skeletons from a model for the given target language. */
export function generateCode(model: CodeModel, language: Language): GeneratedFile[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return generateTs(model);
    case 'python':
      return generatePython(model);
    case 'c':
    case 'cpp':
      return generateCpp(model);
    default:
      return [];
  }
}

export { generateTs, generateTsSymbol } from './tsCodegen.js';
export { generatePython, generatePythonSymbol } from './pyCodegen.js';
export { generateCpp, generateCppSymbol } from './cppCodegen.js';
