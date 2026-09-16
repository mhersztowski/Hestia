/**
 * The knowledge base that a handful of tests read from a user's drive.
 *
 * Those documents are **not** in the repository: they are somebody's own
 * library under `data/`, which is ignored. A machine without them has to skip
 * those tests, not fail them — and `describe.runIf` alone does not achieve
 * that, because vitest still runs the body of a skipped suite to collect it.
 * So the reading happens here and returns `null` when the library is absent,
 * and the suite guards on that value instead of on the file system.
 *
 * The paths resolve against this file rather than the working directory, for
 * the reason given in `documents.ts`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const usersDir = resolve(__dirname, '../../../../data/Minis/Users');

/** A user's knowledge base on their drive. */
export const knowledgeDir = (user: string): string => resolve(usersDir, user, 'drive/knowledge');

/** The physics textbook several tests quote from. */
export const bookDir = resolve(knowledgeDir('marcin'), 'book/Resnick-Halliday-Fizyka-tom-1');

export const hasKnowledge = (user: string): boolean => existsSync(knowledgeDir(user));
export const hasBook = (): boolean => existsSync(bookDir);

/** A document of the book, or `null` when the library is not on this machine. */
export function readBook(relativePath: string): string | null {
  const path = resolve(bookDir, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Every `.md` below a directory, the way the page over the VFS collects them. */
export function collectMarkdown(
  dir: string,
  prefix = ''
): Array<{ path: string; markdown: string }> {
  if (!existsSync(dir)) return [];
  const out: Array<{ path: string; markdown: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collectMarkdown(resolve(dir, entry.name), path));
    else if (entry.name.endsWith('.md'))
      out.push({ path, markdown: readFileSync(resolve(dir, entry.name), 'utf8') });
  }
  return out;
}
