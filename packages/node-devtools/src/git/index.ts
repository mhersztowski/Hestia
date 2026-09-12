/**
 * git — a wrapper around the `git` CLI for `.repo.json` clones.
 *
 * Independent of `codemap/`: neither layer imports the other.
 */
export { GitRepoService, parseRepoJson, stringifyRepoJson } from './GitRepoService.js';
export type { RepoJson, GitRef, GitStatus, GitInfo, GitCommandResult } from './GitRepoService.js';
