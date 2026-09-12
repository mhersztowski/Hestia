import { CodeModel, CodeSymbol, Visibility } from '../model/CodeModel.js';

const vis = (v: Visibility): string => (v === 'private' ? 'private ' : v === 'protected' ? 'protected ' : '');
const paramList = (params: { name: string; type?: string }[] = []): string =>
  params.map((p) => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ');

function genClass(s: CodeSymbol): string {
  const heritage = [s.extends.length ? `extends ${s.extends[0]}` : '', s.implements.length ? `implements ${s.implements.join(', ')}` : ''].filter(Boolean).join(' ');
  const head = `export ${s.isAbstract ? 'abstract ' : ''}class ${s.name}${heritage ? ' ' + heritage : ''} {`;
  const lines: string[] = [];
  for (const m of s.members.filter((x) => x.kind === 'field')) {
    lines.push(`  ${vis(m.visibility)}${m.isStatic ? 'static ' : ''}${m.name}${m.type ? `: ${m.type}` : ''};`);
  }
  for (const m of s.members.filter((x) => x.kind === 'method')) {
    if (m.isAbstract) { lines.push(`  abstract ${m.name}(${paramList(m.params)})${m.type ? `: ${m.type}` : ''};`); continue; }
    lines.push(`  ${vis(m.visibility)}${m.isStatic ? 'static ' : ''}${m.isAsync ? 'async ' : ''}${m.name}(${paramList(m.params)})${m.type ? `: ${m.type}` : ''} {`);
    lines.push('    throw new Error(\'Not implemented\');');
    lines.push('  }');
  }
  return `${head}\n${lines.join('\n')}\n}\n`;
}

function genInterface(s: CodeSymbol): string {
  const head = `export interface ${s.name}${s.extends.length ? ` extends ${s.extends.join(', ')}` : ''} {`;
  const lines = s.members.map((m) => (m.kind === 'field'
    ? `  ${m.name}${m.type ? `: ${m.type}` : ''};`
    : `  ${m.name}(${paramList(m.params)})${m.type ? `: ${m.type}` : ''};`));
  return `${head}\n${lines.join('\n')}\n}\n`;
}

const genEnum = (s: CodeSymbol): string => `export enum ${s.name} {\n${s.members.map((m) => `  ${m.name},`).join('\n')}\n}\n`;

export function generateTsSymbol(s: CodeSymbol): string {
  if (s.kind === 'interface') return genInterface(s);
  if (s.kind === 'enum') return genEnum(s);
  return genClass(s);
}

export function generateTs(model: CodeModel): { file: string; content: string }[] {
  return model.symbols.map((s) => ({ file: `${s.name}.ts`, content: generateTsSymbol(s) }));
}
