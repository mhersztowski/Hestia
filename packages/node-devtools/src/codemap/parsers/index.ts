import { CodeModel, CodeSymbol, Language } from '../model/CodeModel.js';
import { finalizeModel } from '../model/resolve.js';
import { CppParser } from './CppParser.js';
import { PythonParser } from './PythonParser.js';
import { TsParser } from './TsParser.js';
import { detectLanguage, LanguageParser } from './types.js';

const PARSERS: LanguageParser[] = [new TsParser(), new PythonParser(), new CppParser()];
const parserFor = (lang: Language): LanguageParser | undefined => PARSERS.find((p) => p.languages.includes(lang));

/** Parse a single source string into symbols (no cross-file relations yet). */
export async function parseSource(content: string, file: string, language?: Language): Promise<CodeSymbol[]> {
  const lang = language ?? detectLanguage(file);
  if (!lang) return [];
  const parser = parserFor(lang);
  if (!parser) return [];
  return await parser.parse(content, file, lang);
}

export interface SourceFile { file: string; content: string; language?: Language }

/** Parse many files and resolve relations into a complete {@link CodeModel}. */
export async function buildModel(files: SourceFile[]): Promise<CodeModel> {
  const symbols: CodeSymbol[] = [];
  const seen = new Set<string>();
  const fileSet = new Set<string>();
  for (const f of files) {
    fileSet.add(f.file);
    try {
      for (const s of await parseSource(f.content, f.file, f.language)) {
        if (!seen.has(s.id)) { seen.add(s.id); symbols.push(s); }
      }
    } catch { /* skip files that fail to parse rather than abort the whole run */ }
  }
  return finalizeModel({ symbols, relations: [], files: [...fileSet] });
}

export { detectLanguage, SUPPORTED_EXTENSIONS } from './types.js';
export type { LanguageParser } from './types.js';
