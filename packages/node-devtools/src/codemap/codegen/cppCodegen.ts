import { CodeModel, CodeMember, CodeSymbol, Visibility } from '../model/CodeModel.js';

const paramList = (params: { name: string; type?: string }[] = []): string =>
  params.map((p) => `${p.type ?? 'auto'} ${p.name}`.trim()).join(', ');

function section(members: CodeMember[], v: Visibility): string {
  const mine = members.filter((m) => m.visibility === v);
  if (!mine.length) return '';
  const lines = mine.map((m) => (m.kind === 'field'
    ? `  ${m.type ?? 'auto'} ${m.name};`
    : `  ${m.type ?? 'void'} ${m.name}(${paramList(m.params)});`));
  return `${v}:\n${lines.join('\n')}\n`;
}

/** Generate a C++ class/struct header skeleton. */
export function generateCppSymbol(s: CodeSymbol): string {
  const keyword = s.kind === 'struct' ? 'struct' : 'class';
  const bases = s.extends.length ? ` : ${s.extends.map((b) => `public ${b}`).join(', ')}` : '';
  const body = ['public', 'protected', 'private'].map((v) => section(s.members, v as Visibility)).filter(Boolean).join('\n');
  return `${keyword} ${s.name}${bases} {\n${body}};\n`;
}

export function generateCpp(model: CodeModel): { file: string; content: string }[] {
  return model.symbols.map((s) => ({ file: `${s.name}.hpp`, content: `#pragma once\n\n${generateCppSymbol(s)}` }));
}
