/**
 * `@hestia/ui-core` — React components meant to be used in more than one place.
 *
 * The rule for what belongs here is the same as for `@hestia/core`: nothing
 * about any one application. A component lands here when a second application
 * needs it, or when it is plainly general from the start — not in the hope that
 * one day something might.
 *
 * React, MUI and Emotion are peers: the host has them anyway, and a second copy
 * of React breaks hooks in a way whose symptom (a blank screen) says nothing
 * about the cause.
 */

export { Toolbar, MenuBar, FloatingToolbar } from './toolbar/Toolbar';
export type { ToolbarProps, ToolbarOrientation, ToolbarVariant, ToolbarDisplay } from './toolbar/Toolbar';

// The drive: a file list, and what the file holds
export { Drive } from './drive/Drive';
export type { DriveProps } from './drive/Drive';
export {
    pathIn as drivePathIn, parentDir as driveParentDir, baseName as driveBaseName,
    breadcrumbs as driveBreadcrumbs, safeName as driveSafeName, sortEntries as sortDriveEntries,
    kindOf as driveFileKind, extensionOf, formatSize, imageMimeType, dataUrl,
} from './drive/store';
export type { DriveStore, DriveEntry, FileKind } from './drive/store';
// The file operations the ported Drive page performs
export { asText, fromText, readTextOrNull, readJson, sortVfsEntries, freeName, FILE_TYPE, DIR_TYPE } from './drive/vfs';
export type { DriveVfs, VfsEntry } from './drive/vfs';
export { has as hasCapability } from './drive/capabilities';
export type {
    DriveCapabilities, DriveEditor, DriveAssistant, DriveViewers, DriveFileRef,
} from './drive/capabilities';

export {
    item, submenu, toggle, splitToggle, separator, custom,
    childrenOf, hasSubmenu, isActionable, titleOf, findNode, findPath, walk, visibleNodes, applyToggle,
} from './toolbar/model';
export type {
    ToolbarNode, ToolbarParent, NodeBase,
    MenuItemNode, MenuToggleNode, MenuSeparatorNode, MenuCustomNode,
} from './toolbar/model';
