/**
 * Shared types for Drive search — extracted so DriveSearchDialog can
 * import them without pulling DrivePage.tsx as a whole (which would
 * create a circular module graph). The actual search implementation
 * (file walk + grep) lives in DrivePage.tsx alongside its other VFS
 * helpers.
 */

export interface SearchMatch {
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchFileResult {
  /** Drive-relative path. */
  path: string;
  matches: SearchMatch[];
  /** Hit `maxMatchesPerFile` and stopped collecting more. */
  truncated: boolean;
}

export interface SearchProgress {
  scanned: number;
  total: number;
  current?: string;
}
