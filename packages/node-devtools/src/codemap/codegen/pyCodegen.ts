import { CodeModel, CodeSymbol, Visibility } from '../model/CodeModel.js';

const nameFor = (name: string, v: Visibility): string => (v === 'private' ? `__${name}` : v === 'protected' ? `_${name}` : name);

function genClass(s: CodeSymbol): string {
  const bases = [...s.extends, ...s.implements];
  const head = `class ${s.name}${bases.length ? `(${bases.join(', ')})` : ''}:`;
  const lines: string[] = [];
  const fields = s.members.filter((m) => m.kind === 'field');
  const methods = s.members.filter((m) => m.kind === 'method');

  if (fields.length) {
    lines.push('    def __init__(self):');
    for (const f of fields) lines.push(`        self.${nameFor(f.name, f.visibility)} = None${f.type ? `  # ${f.type}` : ''}`);
    lines.push('');
  }
  for (const m of methods) {
    if (m.name === '__init__' && fields.length) continue;
    const params = ['self', ...(m.params ?? []).map((p) => (p.type ? `${p.name}: ${p.type}` : p.name))].join(', ');
    lines.push(`    ${m.isAsync ? 'async ' : ''}def ${nameFor(m.name, m.visibility)}(${params})${m.type ? ` -> ${m.type}` : ''}:`);
    lines.push('        pass');
    lines.push('');
  }
  if (!lines.length) lines.push('    pass');
  return `${head}\n${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function generatePythonSymbol(s: CodeSymbol): string {
  if (s.kind === 'enum') {
    return `from enum import Enum\n\n\nclass ${s.name}(Enum):\n${s.members.map((m, i) => `    ${m.name} = ${i + 1}`).join('\n')}\n`;
  }
  return genClass(s);
}

export function generatePython(model: CodeModel): { file: string; content: string }[] {
  return model.symbols.map((s) => ({ file: `${s.name.toLowerCase()}.py`, content: generatePythonSymbol(s) }));
}
