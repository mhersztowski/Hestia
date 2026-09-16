/**
 * Build AI tool definitions dynamically from a FileSystemProvider's capabilities.
 */

import type { FileSystemProvider } from '@hestia/core';
import type { AiToolDefinition } from '../types';

export function buildVfsToolDefinitions(provider: FileSystemProvider): AiToolDefinition[] {
  const tools: AiToolDefinition[] = [];

  // Always available (required methods)
  tools.push({
    type: 'function',
    function: {
      name: 'vfs_read_file',
      description:
        'Read the text contents of a file at the given path. Returns the file content as text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file (e.g., /src/index.ts)' },
        },
        required: ['path'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'vfs_list_directory',
      description:
        'List contents of a directory. Returns array of entries with name and type ("file" or "directory").',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the directory (e.g., /src)' },
        },
        required: ['path'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'vfs_stat',
      description:
        'Get file or directory metadata: type, size in bytes, creation time, modification time.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file or directory' },
        },
        required: ['path'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'vfs_search_files',
      description:
        'Recursively search for files and directories matching a name pattern. Returns matching paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Starting directory path (e.g., /)' },
          pattern: {
            type: 'string',
            description: 'Substring to match in file/directory names (case-insensitive)',
          },
          maxDepth: { type: 'number', description: 'Maximum recursion depth (default: 5)' },
        },
        required: ['path', 'pattern'],
      },
    },
  });

  // Write operations — only if provider is writable
  if (!provider.capabilities.readonly) {
    if (provider.writeFile) {
      tools.push({
        type: 'function',
        function: {
          name: 'vfs_write_file',
          description:
            'Write text content to a file. Creates the file if it does not exist, overwrites if it does.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path to the file' },
              content: { type: 'string', description: 'Text content to write' },
            },
            required: ['path', 'content'],
          },
        },
      });
    }

    if (provider.mkdir) {
      tools.push({
        type: 'function',
        function: {
          name: 'vfs_mkdir',
          description: 'Create a new directory at the given path.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path for the new directory' },
            },
            required: ['path'],
          },
        },
      });
    }

    if (provider.delete) {
      tools.push({
        type: 'function',
        function: {
          name: 'vfs_delete',
          description: 'Delete a file or directory. Use recursive=true for non-empty directories.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path to delete' },
              recursive: {
                type: 'boolean',
                description: 'Delete directory contents recursively (default: false)',
              },
            },
            required: ['path'],
          },
        },
      });
    }

    if (provider.rename) {
      tools.push({
        type: 'function',
        function: {
          name: 'vfs_rename',
          description: 'Rename or move a file/directory from oldPath to newPath.',
          parameters: {
            type: 'object',
            properties: {
              oldPath: { type: 'string', description: 'Current path' },
              newPath: { type: 'string', description: 'New path' },
            },
            required: ['oldPath', 'newPath'],
          },
        },
      });
    }

    if (provider.copy) {
      tools.push({
        type: 'function',
        function: {
          name: 'vfs_copy',
          description: 'Copy a file or directory from source to destination.',
          parameters: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Source path' },
              destination: { type: 'string', description: 'Destination path' },
            },
            required: ['source', 'destination'],
          },
        },
      });
    }
  }

  return tools;
}
