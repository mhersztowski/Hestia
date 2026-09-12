/**
 * The agent, as the drive takes it.
 *
 * `@hestia/ui-core` describes `DriveAssistant`; this is the implementation, and
 * it lives here so that the drive package never mentions a model provider or an
 * API key. A host that wants an assistant in its drive imports this one
 * function; a host that does not passes `null` and carries none of it.
 *
 * The agent works on a `FileSystemProvider` from `@hestia/core` — its file tools
 * read and write through that, not through the drive's own store. The two are
 * different contracts on purpose: the drive needs a listing and a preview, the
 * agent needs a file system it can act on.
 */

import { createElement, type ReactNode } from 'react';
import type { FileSystemProvider } from '@hestia/core';
import type { DriveAssistant, DriveFileRef, DriveStore } from '@hestia/ui-core';
import type { AgentConfig } from './agent/types';
import { AgentPanel } from './agent/ui/AgentPanel';

export interface DriveAssistantOptions {
    /** The file system the agent's tools work on. */
    provider: FileSystemProvider;
    /** Pre-filled configuration — the model, the key the server provisioned. */
    defaultConfig?: Partial<AgentConfig>;
    /** Where the agent's web fetch goes through, when the host offers one. */
    webFetchUrl?: string;
    authToken?: string;
    /** Opening a file the agent mentions. Absent: the agent says the path and stops there. */
    onFileOpen?: (path: string) => void;
    /** The agent wrote something — the drive refreshes its listing on this. */
    onFileWritten?: (paths: string[]) => void;
    label?: string;
}

export function driveAssistant(options: DriveAssistantOptions): DriveAssistant {
    const {
        provider, defaultConfig, webFetchUrl, authToken, onFileOpen, onFileWritten,
        label = 'Assistant',
    } = options;

    return {
        label,
        render(context: { store: DriveStore; dir: string; file: DriveFileRef | null }): ReactNode {
            // Where the user is, and what is open, told to the agent as context
            // rather than as instructions: it decides what to do with them, and
            // a prompt that says "the user is looking at X" is the difference
            // between an assistant and a search box.
            const here = [
                `The user is looking at \`${context.dir || '/'}\` in the drive.`,
                context.file ? `The open file is \`${context.file.path}\`.` : null,
            ].filter(Boolean).join('\n');

            return createElement(AgentPanel, {
                provider,
                defaultConfig,
                webFetchUrl,
                authToken,
                onFileOpen,
                onFileWritten,
                injectedClaudeMd: here,
            });
        },
    };
}
