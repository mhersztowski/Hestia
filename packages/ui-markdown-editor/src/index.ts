/**
 * `@hestia/ui-markdown-editor` — MyCastle's Markdown editor, moved over whole.
 *
 * The editor knows nothing about the application it runs in. Everything it used
 * to reach for directly — the file store, the signed-in user, the knowledge
 * base, the UML round trip, the form service, the plugin templates, the script
 * runtime — arrives through the capabilities in `capabilities.ts`, and each is
 * optional. The rule is the one `core-ui/src/drive/capabilities.ts` set: a
 * capability the host does not supply means the feature is **not there** — no
 * button, no empty panel explaining itself.
 *
 * Mount it inside the providers for whatever the host has:
 *
 * ```tsx
 * <EditorFilesProvider files={files}>
 *   <EditorSessionProvider session={session}>
 *     <EditorServicesProvider services={{ scriptRunner, knowledgeRefs }}>
 *       <MdEditor filePath={path} />
 *     </EditorServicesProvider>
 *   </EditorSessionProvider>
 * </EditorFilesProvider>
 * ```
 */

// The editor itself.
export { default as MdEditor } from './MdEditor';
export type { MdEditorProps } from './MdEditor';

// What the host supplies, and what its absence means.
export {
    EditorFilesProvider, useEditorFiles,
    EditorSessionProvider, useEditorSession,
    EditorServicesProvider, useEditorServices,
    EditorFileTreeProvider, useEditorFileTree,
    EditorProjectDataProvider, useEditorProjectData,
} from './capabilities';
export type {
    EditorFiles, EditorFilesProviderProps,
    EditorSession, EditorSessionProviderProps,
    EditorServices, EditorServicesProviderProps,
    EditorSpellChecker, SpellMatch,
    KnowledgeRefs, ResolvedKnowledgeRef,
    UmlCodeSync,
    EditorFileTree, EditorFileTreeProviderProps, EditorDir, EditorFile,
    EditorProjectData, EditorProjectDataProviderProps,
    ModelWorkerFactory, EditorForms, UIForm, UIFormSummary,
    EditorCommandBus, EditorScriptTemplates, ScriptTemplate,
    EditorScriptHost, EditorScriptScene,
} from './capabilities';

// The TipTap nodes that read files. Without an `EditorFiles` they stay empty
// rather than throwing — the picker dialogs below list nothing for the same
// reason.
export { InfoMark } from './extensions/InfoMarkExtension';
export { FileRef } from './extensions/FileRefExtension';
export { MdEmbed } from './extensions/EmbedExtension';
export { FormEngineEmbed } from './extensions/FormEngineExtension';
export { default as MdFilePickerDialog } from './extensions/MdFilePickerDialog';
export { default as MdFileTreePickerDialog } from './extensions/MdFileTreePickerDialog';
export { default as CodeFilePickerDialog } from './extensions/CodeFilePickerDialog';
export { default as InfoMarkDialog } from './extensions/InfoMarkDialog';

// Blocks that need a session, a spell checker, the knowledge base or the UML
// round trip. Each stays inert when the host supplies none.
export { SpellCheckExtension } from './extensions/SpellCheckExtension';
export { KnowledgeRefView } from './extensions/KnowledgeRefExtension';
export { DiagramCodeExportDialog } from './extensions/DiagramCodeExportDialog';
export { DiagramCodeImportDialog } from './extensions/DiagramCodeImportDialog';
export { WebEmbed } from './extensions/WebEmbedExtension';
export { default as EventDialog } from './EventDialog';
export { default as ImagePickerDialog } from './components/ImagePickerDialog';
export { default as MediaPickerDialog } from './components/MediaPickerDialog';

// Projects, tasks and people in a document.
export { ComponentEmbed } from './extensions/ComponentEmbedExtension';
export { useTaskCard } from './useTaskCard';
export { useTaskOptions } from './useTaskOptions';

// Media, events and task cards — all of these went through `port/` and came
// out once the capabilities existed.
export { EditableImage } from './extensions/ImageExtension';
export { VideoEmbed } from './extensions/VideoExtension';
export { AudioEmbed } from './extensions/AudioExtension';
export { EventBlock } from './extensions/EventBlockExtension';
export { TaskCard } from './extensions/TaskCardExtension';
export { BlockActionMenu, getBlockId } from './BlockActionMenu';
export { default as TaskCardDialog } from './TaskCardDialog';
export { default as EventTemplateManager } from './EventTemplateManager';
export { loadTemplates, saveTemplates, makeTemplateId } from './eventTemplates';

// Code blocks, forms and the script reference.
export { UIFormEmbed } from './extensions/UIFormExtension';
export { default as MdScriptHelpDialog } from './extensions/MdScriptHelpDialog';
export { default as SlashCommands } from './extensions/SlashCommands';
export type { SlashCommandsOptions } from './extensions/SlashCommands';
export type { EventBlockAttrs, EventDialogResult, EventDialogProps } from './EventDialog';

// Markdown in both directions — the part everything else is measured against.
export { markdownToHtml, htmlToMarkdown } from './utils/markdownConverter';
export * from './utils/callout';
export * from './utils/embedFraming';
export * from './utils/blockClipboard';

// The block model: what a block is, how it renders, how it round-trips.
export * from './extensions/blockRenderers';
export * from './extensions/blockText';
export * from './extensions/registerBuiltinBlocks';
export * from './extensions/selectBlockBefore';

// Diagrams: the mode of a diagram block, its import, export and problems.
export * from './extensions/diagramBlockMode';
export * from './extensions/diagramCodeImport';
export * from './extensions/diagramExport';
export * from './extensions/diagramIssues';

// Scene descriptions written into a document.
export * from './extensions/qobjectScene';
export * from './extensions/qobjectSource';

// View settings and the overlay state the toolbars share.
export * from './mdViewSettings';
export * from './editorOverlayState';
