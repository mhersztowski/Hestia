/**
 * git — a wrapper around the `git` CLI for `.repo.json` clones.
 *
 * Independent of `codemap/`: neither layer imports the other.
 */
export { GitRepoService, parseRepoJson, stringifyRepoJson } from './GitRepoService.js';
export type {
    RepoJson, GitRef, GitStatus, GitInfo, GitCommandResult, GitLogEntry, GitStashEntry,
} from './GitRepoService.js';
// Reading `git status --porcelain` — the one part of talking to git that is
// pure parsing, and therefore the one part worth testing on its own.
export { parsePorcelain, groupChanges, statusLetter } from './porcelain.js';
export type { GitChange, GitFileState, GroupedChanges } from './porcelain.js';
