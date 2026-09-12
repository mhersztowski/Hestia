/**
 * Test regresyjny ustawień kompilatora edytora.
 *
 * Pilnuje jednej rzeczy, którą łatwo zepsuć i trudno zauważyć: żeby TypeScript
 * budował program **z plikami lib**. Bez nich edytor wygląda na sprawny —
 * podpowiedzi ze słów w pliku nadal się pokazują — ale `Array`, `string`,
 * `Promise` i `document` są nieznane, więc po kropce nie ma nic.
 *
 * Opcje sprawdzamy prawdziwym kompilatorem, bo tylko on odpowie, czy program
 * naprawdę powstał z libami; zgodność wartości wyliczeń z Monaco jest
 * gwarantowana tym, że Monaco kopiuje je z TypeScriptu.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { buildCompilerOptions, type EditorCompilerOptions } from './tsCompilerOptions';

/** Buduje program z jednego pliku w pamięci i mówi, co o nim wie. */
function analiza(options: EditorCompilerOptions, kod = 'const a = [1, 2]; const b = a;') {
  const plik = '/probe.ts';
  const opcje = options as unknown as ts.CompilerOptions;
  const host = ts.createCompilerHost(opcje);
  const origGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, langVer, onError, shouldCreate) =>
    (fileName === plik
      ? ts.createSourceFile(fileName, kod, langVer)
      : origGetSourceFile(fileName, langVer, onError, shouldCreate));
  const origFileExists = host.fileExists.bind(host);
  host.fileExists = (f) => f === plik || origFileExists(f);

  const program = ts.createProgram([plik], opcje, host);
  const liby = program.getSourceFiles()
    .map((f) => f.fileName.split('/').pop() ?? '')
    .filter((n) => n.startsWith('lib.'));
  const checker = program.getTypeChecker();
  const zna = (nazwa: string) =>
    !!checker.resolveName(nazwa, undefined, ts.SymbolFlags.Type | ts.SymbolFlags.Value, false);
  return { liby, zna };
}

/** Wyliczenia Monaco mają te same wartości co TypeScriptu — stąd podstawienie. */
const monacoLike = {
  ScriptTarget: { ES2020: ts.ScriptTarget.ES2020 },
  ModuleKind: { ESNext: ts.ModuleKind.ESNext },
  ModuleResolutionKind: { NodeJs: ts.ModuleResolutionKind.NodeJs },
  JsxEmit: { React: ts.JsxEmit.React },
};

describe('ustawienia kompilatora edytora', () => {
  const options = buildCompilerOptions(monacoLike);

  it('program powstaje z plikami lib', () => {
    expect(analiza(options).liby.length).toBeGreaterThan(10);
  });

  it('zna wbudowane typy języka', () => {
    const { zna } = analiza(options);
    for (const nazwa of ['Array', 'String', 'Promise', 'Object', 'Map', 'JSON']) {
      expect(zna(nazwa), nazwa).toBe(true);
    }
  });

  it('zna typy przeglądarki', () => {
    // „typy z aplikacji web": DOM wchodzi razem z domyślnym zestawem dla ES2020.
    const { zna } = analiza(options);
    for (const nazwa of ['Document', 'HTMLElement', 'Response', 'Window']) {
      expect(zna(nazwa), nazwa).toBe(true);
    }
  });

  it('nie ustawia `lib` — domyślny zestaw dla celu jest pełniejszy', () => {
    expect(options.lib).toBeUndefined();
  });

  // To jest właśnie pułapka, przez którą podpowiedzi zniknęły: skróty działają
  // w `tsconfig.json`, ale nie w opcjach podawanych programowo.
  it('skróty nazw lib dają program BEZ libów — dlatego ich tu nie ma', () => {
    const zeSkrotami = analiza({ ...options, lib: ['es2020', 'dom'] });
    expect(zeSkrotami.liby).toHaveLength(0);
    expect(zeSkrotami.zna('Array')).toBe(false);

    // Pełne nazwy plików działają — gdyby kiedyś trzeba było zawęzić zestaw.
    const zPelnymi = analiza({ ...options, lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'] });
    expect(zPelnymi.liby.length).toBeGreaterThan(10);
    expect(zPelnymi.zna('Array')).toBe(true);
  });

  it('rozwiązuje moduły po node’owemu i przyjmuje pliki spoza rozszerzeń TS', () => {
    // Jedno i drugie zniknęło wcześniej razem z nadpisaniem opcji — bez nich
    // import z `node_modules` daje `any`, a część plików z Drive wypada z programu.
    expect(options.moduleResolution).toBe(ts.ModuleResolutionKind.NodeJs);
    expect(options.allowNonTsExtensions).toBe(true);
    expect(options.allowJs).toBe(true);
  });
});
