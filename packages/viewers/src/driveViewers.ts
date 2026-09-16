/**
 * These viewers, as the drive takes them.
 *
 * `@hestia/ui-core` describes `DriveViewers`; this is the implementation, and it
 * lives here rather than there so that the drive package never mentions
 * `pdfjs-dist` — which is the whole point of the seam. A host that wants PDFs in
 * its drive imports this one function; a host that does not passes `null` and
 * carries no decoder.
 */

import { createElement, type ReactNode } from 'react';
import type { DriveFileRef, DriveViewers } from '@hestia/ui-core';
import { PdfViewContent } from './PdfView';
import { DjvuViewContent } from './DjvuView';

/** What this package can show, by extension. */
export const VIEWER_EXTENSIONS = ['pdf', 'djvu', 'djv'] as const;

const extensionOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase();
};

export interface DriveViewersOptions {
  /**
   * Reads a file as bytes. The drive's own store hands out text, so this is
   * given separately: a PDF read as text is a PDF destroyed.
   */
  readBytes: (path: string) => Promise<Uint8Array>;
  /** Which formats to offer. Both by default. */
  kinds?: readonly string[];
}

export function driveViewers({
  readBytes,
  kinds = VIEWER_EXTENSIONS,
}: DriveViewersOptions): DriveViewers {
  const offers = new Set(kinds.map((k) => k.toLowerCase()));
  return {
    canView: (file: DriveFileRef) => offers.has(extensionOf(file.name)),
    render: (file: DriveFileRef): ReactNode => {
      const ext = extensionOf(file.name);
      // The page number stays at 1: the drive shows a file, and paging
      // through it is what the bar inside the viewer is for.
      const props = {
        fileKey: file.path,
        read: () => readBytes(file.path),
        page: 1,
        showNavigation: true,
      };
      return createElement(ext === 'pdf' ? PdfViewContent : DjvuViewContent, props);
    },
  };
}
