import { describe, it, expect } from 'vitest';
import {
  dialectForPath, dialectById, allDialects, callExpressionIn, statementIn, commentIn,
} from './dialects';

describe('dialectForPath — rozpoznanie po rozszerzeniu', () => {
  it('warianty JavaScriptu trafiają do jednego dialektu', () => {
    for (const p of ['/a/b.js', '/a/b.mjs', '/a/b.cjs', '/a/b.jsx']) {
      expect(dialectForPath(p)?.id).toBe('javascript');
    }
  });

  it('TypeScript jest osobnym dialektem, choć generuje JavaScript', () => {
    // Osobny wpis, a nie alias: podpis zakładki ma mówić „TypeScript", a plik
    // `.ts` bez adnotacji typów jest poprawnym JavaScriptem — generator jest
    // ten sam, tożsamość nie.
    expect(dialectForPath('/a/b.ts')?.id).toBe('typescript');
    expect(dialectForPath('/a/b.tsx')?.id).toBe('typescript');
  });

  it('C++ obejmuje nagłówki i szkice Arduino', () => {
    for (const p of ['/a/b.cpp', '/a/b.cc', '/a/b.hpp', '/a/b.h', '/a/b.ino']) {
      expect(dialectForPath(p)?.id).toBe('cpp');
    }
  });

  it('pozostałe języki Blockly też są rozpoznawane', () => {
    expect(dialectForPath('/a/b.py')?.id).toBe('python');
    expect(dialectForPath('/a/b.lua')?.id).toBe('lua');
    expect(dialectForPath('/a/b.php')?.id).toBe('php');
    expect(dialectForPath('/a/b.dart')?.id).toBe('dart');
  });

  it('wielkość liter w rozszerzeniu nie ma znaczenia', () => {
    expect(dialectForPath('/a/B.CPP')?.id).toBe('cpp');
  });

  it('plik bez obsługiwanego rozszerzenia nie ma dialektu', () => {
    // Zwracamy `undefined`, a nie dialekt domyślny: wtyczka ma się **nie
    // odzywać** dla pliku, którego nie umie obsłużyć. Podstawienie
    // JavaScriptu dla `.md` dawałoby edytor generujący kod donikąd.
    expect(dialectForPath('/a/readme.md')).toBeUndefined();
    expect(dialectForPath('/a/plik')).toBeUndefined();
  });

  it('schemat zakładki wtyczki nie przeszkadza w rozpoznaniu', () => {
    // Zakładki wtyczek mają własny schemat (`blockly:///user/…`), a ścieżka
    // z niego jest tym samym plikiem.
    expect(dialectForPath('blockly:///user/drive/a.cpp')?.id).toBe('cpp');
  });
});

describe('dialectById', () => {
  it('zna każdy dialekt z listy', () => {
    for (const d of allDialects()) expect(dialectById(d.id)).toBe(d);
  });

  it('nieznany identyfikator nie jest podmieniany na domyślny', () => {
    expect(dialectById('brainfuck')).toBeUndefined();
  });
});

describe('callExpressionIn — składnia wywołania', () => {
  const callable = (over: Partial<{ callee: string; owner: string; ownerKind: 'class' | 'module'; isAsync: boolean }> = {}) => ({
    callee: 'Api.load', owner: 'Api', ownerKind: 'class' as const, isAsync: false, ...over,
  });

  it('JavaScript: kropka i await', () => {
    const js = dialectById('javascript')!;
    expect(callExpressionIn(js, callable(), ['1'])).toBe('Api.load(1)');
    expect(callExpressionIn(js, callable({ isAsync: true }), [])).toBe('await Api.load()');
  });

  it('C++: metoda statyczna klasy przez `::`', () => {
    // `Api.load()` w C++ znaczy wywołanie na **obiekcie** `Api`, a UML opisuje
    // metodę statyczną. Kropka skompilowałaby się tylko przypadkiem.
    const cpp = dialectById('cpp')!;
    expect(callExpressionIn(cpp, callable(), ['1'])).toBe('Api::load(1)');
  });

  it('C++: funkcja globalna zostaje bez kwalifikatora', () => {
    const cpp = dialectById('cpp')!;
    expect(callExpressionIn(cpp, callable({ callee: 'setup', ownerKind: 'module' }), [])).toBe('setup()');
  });

  it('C++ nie zna await — asynchroniczność jest pojęciem języka, nie UML-a', () => {
    const cpp = dialectById('cpp')!;
    expect(callExpressionIn(cpp, callable({ isAsync: true }), [])).toBe('Api::load()');
  });

  it('PHP: statyczne przez `::`, tak jak w C++', () => {
    const php = dialectById('php')!;
    expect(callExpressionIn(php, callable(), [])).toBe('Api::load()');
  });

  it('Python i Lua używają kropki', () => {
    expect(callExpressionIn(dialectById('python')!, callable(), [])).toBe('Api.load()');
    expect(callExpressionIn(dialectById('lua')!, callable(), [])).toBe('Api.load()');
  });

  it('Python zna await, Lua nie', () => {
    expect(callExpressionIn(dialectById('python')!, callable({ isAsync: true }), [])).toBe('await Api.load()');
    expect(callExpressionIn(dialectById('lua')!, callable({ isAsync: true }), [])).toBe('Api.load()');
  });
});

describe('statementIn — zakończenie instrukcji', () => {
  it('języki nawiasowe dostają średnik', () => {
    for (const id of ['javascript', 'typescript', 'cpp', 'php', 'dart']) {
      expect(statementIn(dialectById(id)!, 'f()')).toBe('f();\n');
    }
  });

  it('Python i Lua nie', () => {
    // Średnik w Pythonie jest legalny, ale w wygenerowanym kodzie wygląda jak
    // pomyłka narzędzia i podważa zaufanie do reszty.
    for (const id of ['python', 'lua']) {
      expect(statementIn(dialectById(id)!, 'f()')).toBe('f()\n');
    }
  });
});

describe('commentIn — komentarz w składni języka', () => {
  it('dobiera znacznik do języka', () => {
    expect(commentIn(dialectById('cpp')!, 'uwaga')).toBe('// uwaga');
    expect(commentIn(dialectById('python')!, 'uwaga')).toBe('# uwaga');
    expect(commentIn(dialectById('lua')!, 'uwaga')).toBe('-- uwaga');
  });
});
