/**
 * Deterministic id helpers. Re-parsing the same code must produce the same ids
 * so that: (a) UML nodes keep their identity (manual layout is preserved on
 * re-sync) and (b) the diff engine can match components across versions.
 */

/** djb2 → base36. Stable, collision-resistant enough for symbol/member keys. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const symbolId = (name: string): string => name;
export const nodeId = (symId: string): string => `cls_${hashId(symId)}`;
// Member identity is name+kind ONLY (not parameter arity): changing a method's
// signature must read as "modified", not remove+add. Overloads with the same
// name are disambiguated by the callers' de-dup suffix.
export const memberId = (symId: string, kind: string, name: string): string =>
  `${symId}#${kind}:${name}`;
export const umlMemberId = (memId: string): string => `mem_${hashId(memId)}`;
export const relationId = (fromId: string, toId: string, type: string): string =>
  `${fromId}->${toId}:${type}`;
export const edgeId = (relId: string): string => `edge_${hashId(relId)}`;
export const diagramId = (key: string): string => `dia_${hashId(key)}`;
export const commitId = (key: string): string => `c_${hashId(key)}`;
