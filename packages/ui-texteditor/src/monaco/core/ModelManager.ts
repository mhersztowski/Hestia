import * as monaco from 'monaco-editor';
import type { Disposable, DocumentUri } from '../utils/types';
import { createDocumentUri } from '../utils/types';
import { DisposableStore } from '../utils/disposable';

function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + (i === 6 ? ((b & 0x0f) | 0x40).toString(16) : i === 8 ? ((b & 0x3f) | 0x80).toString(16) : b.toString(16).padStart(2, '0')))
    .join('');
}

export interface ModelInfo {
  readonly uri: DocumentUri;
  readonly languageId: string;
  readonly lineCount: number;
  readonly versionId: number;
}

/**
 * Manages Monaco text models with proper lifecycle handling
 */
export class ModelManager implements Disposable {
  private readonly models = new Map<DocumentUri, monaco.editor.ITextModel>();
  private readonly disposables = new DisposableStore();

  /**
   * Creates a new model or returns existing one for the given URI
   */
  createModel(
    content: string,
    languageId: string,
    uri?: string
  ): monaco.editor.ITextModel {
    const modelUri = uri
      ? monaco.Uri.parse(uri)
      : monaco.Uri.parse(`inmemory://model/${safeRandomUUID()}`);

    const documentUri = createDocumentUri(modelUri.toString());

    // Return existing model if already exists
    const existingModel = this.models.get(documentUri);
    if (existingModel && !existingModel.isDisposed()) {
      return existingModel;
    }

    // Check if Monaco already has a model for this URI
    const monacoModel = monaco.editor.getModel(modelUri);
    if (monacoModel && !monacoModel.isDisposed()) {
      this.models.set(documentUri, monacoModel);
      return monacoModel;
    }

    // Create new model
    const model = monaco.editor.createModel(content, languageId, modelUri);
    this.models.set(documentUri, model);

    return model;
  }

  /**
   * Gets a model by URI
   */
  getModel(uri: DocumentUri): monaco.editor.ITextModel | undefined {
    const model = this.models.get(uri);
    if (model && !model.isDisposed()) {
      return model;
    }
    // Clean up disposed model reference
    if (model?.isDisposed()) {
      this.models.delete(uri);
    }
    return undefined;
  }

  /**
   * Gets all managed models
   */
  getAllModels(): readonly monaco.editor.ITextModel[] {
    const models: monaco.editor.ITextModel[] = [];
    for (const [uri, model] of this.models) {
      if (model.isDisposed()) {
        this.models.delete(uri);
      } else {
        models.push(model);
      }
    }
    return models;
  }

  /**
   * Gets information about all managed models
   */
  getAllModelInfo(): readonly ModelInfo[] {
    return this.getAllModels().map((model) => ({
      uri: createDocumentUri(model.uri.toString()),
      languageId: model.getLanguageId(),
      lineCount: model.getLineCount(),
      versionId: model.getVersionId(),
    }));
  }

  /**
   * Disposes a specific model
   */
  disposeModel(uri: DocumentUri): boolean {
    const model = this.models.get(uri);
    if (model) {
      this.models.delete(uri);
      if (!model.isDisposed()) {
        model.dispose();
      }
      return true;
    }
    return false;
  }

  /**
   * Updates the language of a model
   */
  setModelLanguage(uri: DocumentUri, languageId: string): boolean {
    const model = this.getModel(uri);
    if (model) {
      monaco.editor.setModelLanguage(model, languageId);
      return true;
    }
    return false;
  }

  /**
   * Disposes all models and the manager
   */
  dispose(): void {
    for (const model of this.models.values()) {
      if (!model.isDisposed()) {
        model.dispose();
      }
    }
    this.models.clear();
    this.disposables.dispose();
  }
}
