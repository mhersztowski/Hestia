/**
 * Execute VFS tool calls against a FileSystemProvider.
 */

import type { FileSystemProvider } from '@hestia/core';
import { decodeText, encodeText, FileType } from '@hestia/core';
import type { AiToolCall } from '../types';

const MAX_FILE_SIZE = 50_000; // truncate reads above 50KB

export interface ToolExecutionResult {
  result: string;
  affectedFiles: string[];
}

export async function executeVfsTool(
  toolCall: AiToolCall,
  provider: FileSystemProvider,
): Promise<ToolExecutionResult> {
  const args = JSON.parse(toolCall.function.arguments);
  const affectedFiles: string[] = [];

  try {
    switch (toolCall.function.name) {
      case 'vfs_read_file': {
        const data = await provider.readFile(args.path);
        let content = decodeText(data);
        let truncated = false;
        if (content.length > MAX_FILE_SIZE) {
          content = content.slice(0, MAX_FILE_SIZE);
          truncated = true;
        }
        affectedFiles.push(args.path);
        return {
          result: JSON.stringify({ path: args.path, content, truncated }),
          affectedFiles,
        };
      }

      case 'vfs_list_directory': {
        const entries = await provider.readDirectory(args.path);
        const items = entries.map(e => ({
          name: e.name,
          type: e.type === FileType.Directory ? 'directory' : 'file',
        }));
        return { result: JSON.stringify({ path: args.path, items }), affectedFiles };
      }

      case 'vfs_stat': {
        const stat = await provider.stat(args.path);
        return {
          result: JSON.stringify({
            path: args.path,
            type: stat.type === FileType.Directory ? 'directory' : 'file',
            size: stat.size,
            created: new Date(stat.ctime).toISOString(),
            modified: new Date(stat.mtime).toISOString(),
          }),
          affectedFiles,
        };
      }

      case 'vfs_search_files': {
        const matches = await searchRecursive(provider, args.path, args.pattern, args.maxDepth ?? 5, 0);
        return { result: JSON.stringify({ pattern: args.pattern, matches }), affectedFiles };
      }

      case 'vfs_write_file': {
        // Empty or missing content is refused. A model sometimes writes an empty
        // file "for now" and corrects itself afterwards (it will say the empty
        // write was a mistake) — and that destroys what was there. An error
        // rather than a quiet success makes it retry with the WHOLE content in
        // the same turn.
        if (typeof args.content !== 'string' || args.content.length === 0) {
          return {
            result: JSON.stringify({
              error: 'Refused empty write. Provide the COMPLETE file content as a string in a single vfs_write_file call. Never write an empty file to fix it later — it would erase the existing content.',
              path: args.path,
            }),
            affectedFiles,
          };
        }
        await provider.writeFile!(args.path, encodeText(args.content), { create: true, overwrite: true });
        affectedFiles.push(args.path);
        return { result: JSON.stringify({ success: true, path: args.path, bytes: args.content.length }), affectedFiles };
      }

      case 'vfs_mkdir': {
        await provider.mkdir!(args.path);
        affectedFiles.push(args.path);
        return { result: JSON.stringify({ success: true, path: args.path }), affectedFiles };
      }

      case 'vfs_delete': {
        await provider.delete!(args.path, { recursive: args.recursive });
        affectedFiles.push(args.path);
        return { result: JSON.stringify({ success: true, path: args.path }), affectedFiles };
      }

      case 'vfs_rename': {
        await provider.rename!(args.oldPath, args.newPath, { overwrite: true });
        affectedFiles.push(args.oldPath, args.newPath);
        return {
          result: JSON.stringify({ success: true, oldPath: args.oldPath, newPath: args.newPath }),
          affectedFiles,
        };
      }

      case 'vfs_copy': {
        await provider.copy!(args.source, args.destination, { overwrite: true });
        affectedFiles.push(args.source, args.destination);
        return {
          result: JSON.stringify({ success: true, source: args.source, destination: args.destination }),
          affectedFiles,
        };
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }), affectedFiles };
    }
  } catch (err) {
    return {
      result: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      affectedFiles,
    };
  }
}

async function searchRecursive(
  provider: FileSystemProvider,
  dirPath: string,
  pattern: string,
  maxDepth: number,
  currentDepth: number,
): Promise<string[]> {
  if (currentDepth >= maxDepth) return [];

  let entries;
  try {
    entries = await provider.readDirectory(dirPath);
  } catch {
    return [];
  }

  const matches: string[] = [];
  const lowerPattern = pattern.toLowerCase();

  for (const entry of entries) {
    const fullPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;
    if (entry.name.toLowerCase().includes(lowerPattern)) {
      matches.push(fullPath);
    }
    if (entry.type === FileType.Directory) {
      const sub = await searchRecursive(provider, fullPath, pattern, maxDepth, currentDepth + 1);
      matches.push(...sub);
    }
  }
  return matches;
}
