export enum VfsErrorCode {
  FileNotFound = 'FileNotFound',
  FileExists = 'FileExists',
  FileNotADirectory = 'FileNotADirectory',
  FileIsADirectory = 'FileIsADirectory',
  NoPermissions = 'NoPermissions',
  Unavailable = 'Unavailable',
  Unknown = 'Unknown',
}

export class VfsError extends Error {
  constructor(
    public readonly code: VfsErrorCode,
    message?: string,
    public readonly path?: string,
  ) {
    super(message ?? `${code}${path ? `: ${path}` : ''}`);
    this.name = 'VfsError';
  }

  static fileNotFound(path: string): VfsError {
    return new VfsError(VfsErrorCode.FileNotFound, `File not found: ${path}`, path);
  }

  static fileExists(path: string): VfsError {
    return new VfsError(VfsErrorCode.FileExists, `File already exists: ${path}`, path);
  }

  static notADirectory(path: string): VfsError {
    return new VfsError(VfsErrorCode.FileNotADirectory, `Not a directory: ${path}`, path);
  }

  static isADirectory(path: string): VfsError {
    return new VfsError(VfsErrorCode.FileIsADirectory, `Is a directory: ${path}`, path);
  }

  static noPermissions(path?: string): VfsError {
    return new VfsError(
      VfsErrorCode.NoPermissions,
      path ? `No permissions: ${path}` : 'No permissions',
      path,
    );
  }

  static unavailable(message?: string): VfsError {
    return new VfsError(VfsErrorCode.Unavailable, message ?? 'Resource unavailable');
  }
}
