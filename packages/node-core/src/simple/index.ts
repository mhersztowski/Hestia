/**
 * A lightweight HTTP server and JSON store — Hestia's own part.
 *
 * In a directory of its own next to the verbatim copy from MyCastle:
 * `httpserver/` in that copy is the full `HttpUploadServer` (upload, VFS,
 * static files), whereas this is the minimum for an application that needs a
 * handful of routes and one data file. Mixing our files in among the copied
 * ones would turn every update of the base into deciding by hand what belongs
 * to whom.
 */
export { HttpServer, HttpError } from './HttpServer';
export type { Context, Handler, ServerOptions } from './HttpServer';
export { JsonStore } from './JsonStore';
export { match } from './router';
export type { Params } from './router';
export { resolvePath, mimeType } from './staticFiles';
