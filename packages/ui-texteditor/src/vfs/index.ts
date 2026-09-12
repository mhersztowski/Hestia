export * from './types';
export * from './project';
export { VfsExplorer } from './VfsExplorer';
export { ProjectPanel } from './ProjectPanel';
export { useVfsTree } from './useVfsTree';
export { VfsBreadcrumbs } from './VfsBreadcrumbs';
export { VfsMountManager } from './VfsMountManager';
export { getFileIcon } from './icons';
export { VfsFileDialog } from './VfsFileDialog';
export type { VfsFileDialogProps, VfsFileDialogMode } from './VfsFileDialog';
export { useVfsClipboard } from './clipboard';
export type { VfsClipboard } from './clipboard';
export {
  memoryFsProvider,
  githubFsProvider,
  browserFsProvider,
  remoteFsProvider,
  isBrowserFSSupported,
  defaultProviderRegistry,
} from './providerRegistry';
export type { VfsProviderDef, VfsProviderConfigField } from './providerRegistry';
export type { VfsMountPreset } from './vfsMountPresets';
export { loadPresets, savePreset, deletePreset, generatePresetId } from './vfsMountPresets';
