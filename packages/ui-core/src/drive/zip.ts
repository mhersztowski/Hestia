/**
 * Names for the archive actions — packing, unpacking and downloading a folder.
 *
 * Apart from the component because this is the part with a decision in it: what
 * the archive is called, and where its contents land. The paths themselves are
 * ordinary drive-relative paths here — MyCastle also had to translate them into
 * its server-command format, which is the one thing that is not needed any more.
 */

/** Whether "Unpack" makes any sense for this file. */
export function isArchive(name: string): boolean {
    return /\.zip$/i.test(name);
}

/**
 * The directory an archive's contents go into.
 *
 * Into a **subdirectory**, never into the current one: an archive with fifty
 * files at its root buries the listing, and unpacked files mixed in with the
 * existing ones are hard to tell apart afterwards. The name comes from the
 * archive so it is obvious where they came from.
 */
export function folderNameFor(archiveName: string): string {
    const withoutExtension = archiveName.replace(/\.zip$/i, '').trim();
    return withoutExtension || 'archiwum';
}

/**
 * The archive's name for a folder.
 *
 * `.zip` is always appended, including for a folder with a dot in its name
 * (`kopia.2026`): without the extension the file would look like a folder and
 * could not be unpacked by the menu entry, which goes by the extension.
 */
export function archiveNameFor(folderName: string): string {
    const clean = folderName.replace(/\/+$/, '').trim();
    return `${clean || 'archiwum'}.zip`;
}
