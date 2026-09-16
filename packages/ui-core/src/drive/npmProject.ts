/**
 * The npm project behind an open `package.json` — what can be run, and with what.
 *
 * MyCastle kept this on its backend; it is pure reasoning about two files, so
 * here it sits beside the drive and the page uses it directly. Whoever actually
 * starts a process still decides for itself, and should check the same things
 * again: a page can be lied to, a server cannot afford to be.
 */

export type PackageManagerId = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PackageManagerInfo {
  id: PackageManagerId;
  lockfile: string;
  command: string;
}

/**
 * The order matters: after a migration from npm to pnpm the old
 * `package-lock.json` is often left in the tree while the project is already
 * built with pnpm.
 */
export const PACKAGE_MANAGERS: readonly PackageManagerInfo[] = [
  { id: 'pnpm', lockfile: 'pnpm-lock.yaml', command: 'pnpm' },
  { id: 'yarn', lockfile: 'yarn.lock', command: 'yarn' },
  { id: 'bun', lockfile: 'bun.lockb', command: 'bun' },
  { id: 'npm', lockfile: 'package-lock.json', command: 'npm' },
];

export interface DetectedManager extends PackageManagerInfo {
  /** `false` = a guess, made because nothing in the project said anything. */
  detected: boolean;
  /** Whether the lockfile is there — it decides which install variant to use. */
  hasLockfile: boolean;
}

const byId = (id: PackageManagerId): PackageManagerInfo =>
  PACKAGE_MANAGERS.find((m) => m.id === id)!;

/**
 * Which tool builds this project.
 *
 * This is not a detail: `npm install` in a pnpm project is not a slower pnpm —
 * it lays out a different dependency tree than `pnpm-lock.yaml` describes, flat
 * instead of strict, with different transitive versions. The project then
 * builds differently than it does for its author, and the symptom is usually an
 * error inside somebody else's library that looks like a bug in it.
 *
 * The absence of a lockfile does not mean "npm" — it means "unknown", and
 * `detected` carries that difference so the interface can say it is guessing
 * rather than assert something it does not know.
 */
export function detectPackageManager(
  files: readonly string[],
  packageManagerField?: string
): DetectedManager {
  const names = new Set(files);
  const hasLock = (m: PackageManagerInfo): boolean => names.has(m.lockfile);

  // The `packageManager` field is the author's own declaration, and outranks
  // a file that may be left over from the tool they moved away from.
  const declared = packageManagerField?.split('@')[0]?.trim().toLowerCase();
  const fromField = PACKAGE_MANAGERS.find((m) => m.id === declared);
  if (fromField) return { ...fromField, detected: true, hasLockfile: hasLock(fromField) };

  const fromLock = PACKAGE_MANAGERS.find(hasLock);
  if (fromLock) return { ...fromLock, detected: true, hasLockfile: true };

  return { ...byId('npm'), detected: false, hasLockfile: false };
}

export interface CommandPlan {
  command: string;
  args: string[];
  /** A sentence for the user, saying why this and not something else. */
  note?: string;
}

/**
 * Installing the dependencies.
 *
 * With a lockfile present, the **reproducible** variant: install exactly what
 * the lockfile says and write nothing back to it. A plain `install` updates it
 * quietly, and the change comes back later as an unexplained diff in git —
 * usually for somebody else.
 */
export function installPlan(id: PackageManagerId, hasLockfile: boolean): CommandPlan {
  const command = byId(id).command;
  if (!hasLockfile) {
    return {
      command,
      args: id === 'npm' ? ['install', '--include=dev'] : ['install'],
      note: 'Brak pliku blokady — instalacja rozwiąże wersje od nowa.',
    };
  }
  const note = 'Plik blokady obecny — instaluję dokładnie z niego (bez jego zmiany).';
  switch (id) {
    case 'npm':
      return { command, args: ['ci'], note };
    case 'pnpm':
      return { command, args: ['install', '--frozen-lockfile'], note };
    case 'yarn':
      return { command, args: ['install', '--immutable'], note };
    case 'bun':
      return { command, args: ['install', '--frozen-lockfile'], note };
  }
}

/** Running one entry of `scripts`. */
export function runPlan(id: PackageManagerId, script: string): CommandPlan {
  const command = byId(id).command;
  // `yarn build` rather than `yarn run build`: both work, but the first is
  // what yarn projects document, so what the drive does is easy to compare
  // with what the user types in a terminal.
  return id === 'yarn' ? { command, args: [script] } : { command, args: ['run', script] };
}

/**
 * Names npm actually uses: letters, digits and `:`, `-`, `_`, `.`.
 *
 * Deliberately narrower than what npm allows. A script name reaches a shell on
 * the far side of this, and a name with a space or a quote in it is unheard of
 * in practice while every character allowed would have to be thought through
 * against that shell.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/;

export function isSafeScriptName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/**
 * The scripts of a `package.json`.
 *
 * `null` means "I could not read this file" and is not the same as an empty
 * set, which means "a project with no scripts". Merging the two would leave the
 * user guessing whether the file is broken or simply defines nothing.
 */
export function readPackageScripts(text: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = (parsed as Record<string, unknown>).scripts;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** The `packageManager` field, when the file declares one. */
export function readPackageManagerField(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { packageManager?: unknown };
    return typeof parsed?.packageManager === 'string' ? parsed.packageManager : undefined;
  } catch {
    return undefined;
  }
}

export type ScriptDecision = { ok: true; plan: CommandPlan } | { ok: false; reason: string };

/**
 * Whether this script may be run, and how.
 *
 * The order of the checks is not arbitrary: the **shape** of the name first,
 * its presence in `package.json` second. The other way round it would be enough
 * to write a malicious name into `package.json` — a file the user edits in the
 * drive themselves — to have it accepted.
 */
export function decideScript(
  script: string,
  scripts: Record<string, string> | null,
  manager: PackageManagerId
): ScriptDecision {
  if (!isSafeScriptName(script)) {
    return { ok: false, reason: `Niedozwolona nazwa skryptu: ${JSON.stringify(script)}` };
  }
  if (scripts === null) {
    return {
      ok: false,
      reason: 'Nie udało się odczytać package.json — nie wiem, co wolno uruchomić.',
    };
  }
  if (!Object.prototype.hasOwnProperty.call(scripts, script)) {
    const available = Object.keys(scripts).sort();
    return {
      ok: false,
      // Naming what is available turns a "no" into an answer to the
      // question "then what do I type".
      reason: available.length
        ? `package.json nie ma skryptu „${script}". Dostępne: ${available.join(', ')}.`
        : `package.json nie definiuje żadnych skryptów (żądano „${script}").`,
    };
  }
  return { ok: true, plan: runPlan(manager, script) };
}
