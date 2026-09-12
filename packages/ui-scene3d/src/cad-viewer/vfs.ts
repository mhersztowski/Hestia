/**
 * Minimal read-only VFS client for the viewers — ported from cad-app's
 * cadProjectApi (read paths only). Talks to the same cad-backend REST API,
 * origin-relative, so the viewer works wherever the app is served.
 */

const BASE = '/api/vfs';
const SCENE3D_BASE = '/api/scene3d/projects';
const REQUEST_TIMEOUT_MS = 12000;

// User id for scene3d requests (header + query). Read-only default; settable.
let currentUserId = 'default';
export function setViewerUserId(id: string): void { currentUserId = id; }

// Base origin for the CAD backend. Empty → origin-relative (viewer served BY the
// cad-backend). Set to an absolute origin (e.g. https://cad.hersztowski.org) to
// let the viewer run embedded elsewhere and fetch scenes cross-origin (requires
// CORS on the cad-backend).
let apiBaseOrigin = '';
export function setViewerApiBase(origin: string): void {
  apiBaseOrigin = (origin || '').replace(/\/+$/, '');
}
function apiOrigin(): string { return apiBaseOrigin || window.location.origin; }

// ── file extensions ───────────────────────────────────────────────────────────

export const CAD_EXT = '.cad.json';
export const SCENE_EXT = '.scene.json';
export const ELEC_EXT = '.elec.json';
export const MAP_EXT = '.map.json';
export const NOTES_EXT = '.notes.json';
export const LEGO_EXT = '.lego.json';
export const PCB_EXT = '.pcb.json';

class VfsNetworkError extends Error {
  readonly code = 'NETWORK';
  constructor(message: string) {
    super(message);
    this.name = 'VfsNetworkError';
  }
}

async function vfsFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new VfsNetworkError('CAD backend did not respond — is it running?');
    }
    if (e instanceof TypeError) {
      throw new VfsNetworkError('Cannot reach CAD backend — is it running?');
    }
    throw e;
  }
}

function sanitizeName(name: string): string {
  return name.trim().replace(/[/\\:*?"<>|]/g, '_') || 'untitled';
}

function filePath(dir: string, name: string, extension: string): string {
  return `${dir}/${sanitizeName(name)}${extension}`;
}

function base64ToText(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function vfsGet<T>(op: string, path?: string): Promise<T> {
  const url = new URL(BASE + op, apiOrigin());
  if (path) url.searchParams.set('path', path);
  const res = await vfsFetch(url.toString());
  const data = await res.json() as { error?: string; code?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/** Read a file's text content from an arbitrary VFS directory. */
export async function readFileAt(dir: string, name: string, extension: string): Promise<string> {
  const res = await vfsGet<{ data: string }>('/readFile', filePath(dir, name, extension));
  return base64ToText(res.data);
}

// ── PCB projects API ──────────────────────────────────────────────────────────

/** Read a full PCB project from the per-user VFS (/users/{userId}/projects/{name}.pcb.json). */
export async function readPcbProject(dir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFileAt(dir, name, PCB_EXT));
}

/** Surowy model 3D EasyEDA (.obj) z backendu (/api/easyeda/model3d/{uuid}). */
export async function readModel3dObj(uuid: string): Promise<string> {
  const url = new URL(`/api/easyeda/model3d/${encodeURIComponent(uuid)}`, apiOrigin());
  const res = await vfsFetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── scene3d API ─────────────────────────────────────────────────────────────

function scene3dUrl(path: string): string {
  const url = new URL(`${SCENE3D_BASE}${path}`, apiOrigin());
  url.searchParams.set('user', currentUserId);
  return url.toString();
}

/** Read a scene file from a scene3d project. */
export async function readScene3dFile(project: string, file: string): Promise<string> {
  const res = await fetch(scene3dUrl(`/${encodeURIComponent(project)}/${encodeURIComponent(file)}`), {
    headers: { 'Content-Type': 'application/json', 'X-Cad-User': currentUserId },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const data = await res.json() as { data?: string };
  return base64ToText(data.data!);
}
