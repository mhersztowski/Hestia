import * as monaco from 'monaco-editor';
import type { Disposable } from '../utils/types';
import { DisposableStore } from '../utils/disposable';
import { debounce } from '../utils/debounce';

export interface LanguageConfiguration {
  readonly languageId: string;
  readonly extensions?: readonly string[];
  readonly aliases?: readonly string[];
  readonly mimetypes?: readonly string[];
  readonly configuration?: monaco.languages.LanguageConfiguration;
}

export interface DiagnosticsProvider {
  provideDiagnostics(
    model: monaco.editor.ITextModel
  ): Promise<monaco.editor.IMarkerData[]>;
}

/**
 * Service for managing language features and registrations
 */
export class LanguageService implements Disposable {
  private readonly disposables = new DisposableStore();
  private readonly registeredLanguages = new Set<string>();
  private readonly diagnosticsProviders = new Map<string, DiagnosticsProvider>();
  private readonly validationDebounceMs = 500;

  /**
   * Registers a new language with Monaco
   */
  registerLanguage(config: LanguageConfiguration): Disposable {
    if (this.registeredLanguages.has(config.languageId)) {
      return { dispose: () => {} };
    }

    monaco.languages.register({
      id: config.languageId,
      extensions: config.extensions as string[],
      aliases: config.aliases as string[],
      mimetypes: config.mimetypes as string[],
    });

    if (config.configuration) {
      monaco.languages.setLanguageConfiguration(
        config.languageId,
        config.configuration
      );
    }

    this.registeredLanguages.add(config.languageId);

    return {
      dispose: () => {
        this.registeredLanguages.delete(config.languageId);
      },
    };
  }

  /**
   * Registers a completion provider for a language
   */
  registerCompletionProvider(
    languageId: string,
    provider: monaco.languages.CompletionItemProvider
  ): Disposable {
    const disposable = monaco.languages.registerCompletionItemProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a hover provider for a language
   */
  registerHoverProvider(
    languageId: string,
    provider: monaco.languages.HoverProvider
  ): Disposable {
    const disposable = monaco.languages.registerHoverProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a document formatting provider
   */
  registerDocumentFormattingProvider(
    languageId: string,
    provider: monaco.languages.DocumentFormattingEditProvider
  ): Disposable {
    const disposable = monaco.languages.registerDocumentFormattingEditProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a document range formatting provider
   */
  registerDocumentRangeFormattingProvider(
    languageId: string,
    provider: monaco.languages.DocumentRangeFormattingEditProvider
  ): Disposable {
    const disposable = monaco.languages.registerDocumentRangeFormattingEditProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a definition provider
   */
  registerDefinitionProvider(
    languageId: string,
    provider: monaco.languages.DefinitionProvider
  ): Disposable {
    const disposable = monaco.languages.registerDefinitionProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a reference provider
   */
  registerReferenceProvider(
    languageId: string,
    provider: monaco.languages.ReferenceProvider
  ): Disposable {
    const disposable = monaco.languages.registerReferenceProvider(
      languageId,
      provider
    );
    this.disposables.add(disposable);
    return disposable;
  }

  /**
   * Registers a diagnostics provider with debounced validation
   */
  registerDiagnosticsProvider(
    languageId: string,
    provider: DiagnosticsProvider
  ): Disposable {
    this.diagnosticsProviders.set(languageId, provider);

    return {
      dispose: () => {
        this.diagnosticsProviders.delete(languageId);
      },
    };
  }

  /**
   * Validates a model and sets markers
   */
  async validateModel(model: monaco.editor.ITextModel): Promise<void> {
    const languageId = model.getLanguageId();
    const provider = this.diagnosticsProviders.get(languageId);

    if (!provider) {
      return;
    }

    try {
      const diagnostics = await provider.provideDiagnostics(model);
      monaco.editor.setModelMarkers(model, languageId, diagnostics);
    } catch (error) {
      console.error(`Diagnostics error for ${languageId}:`, error);
    }
  }

  /**
   * Creates a debounced validator for a model
   */
  createModelValidator(
    model: monaco.editor.ITextModel
  ): Disposable {
    const debouncedValidate = debounce(() => {
      this.validateModel(model);
    }, this.validationDebounceMs);

    const disposable = model.onDidChangeContent(() => {
      debouncedValidate();
    });

    // Initial validation
    debouncedValidate();

    return {
      dispose: () => {
        debouncedValidate.cancel();
        disposable.dispose();
      },
    };
  }

  /**
   * Clears diagnostics for a model
   */
  clearDiagnostics(model: monaco.editor.ITextModel): void {
    monaco.editor.setModelMarkers(model, model.getLanguageId(), []);
  }

  /**
   * Gets all registered language IDs
   */
  getRegisteredLanguages(): readonly string[] {
    return Array.from(this.registeredLanguages);
  }

  dispose(): void {
    this.diagnosticsProviders.clear();
    this.registeredLanguages.clear();
    this.disposables.dispose();
  }
}
