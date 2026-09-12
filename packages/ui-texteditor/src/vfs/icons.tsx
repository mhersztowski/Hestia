import type { ReactElement } from 'react';

const S = 20; // icon size

/** Folder closed — VS Code Seti style (flat golden folder) */
function FolderClosedIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M27.5 27.5h-23A1.5 1.5 0 013 26V8.5A1.5 1.5 0 014.5 7h7.29a1.5 1.5 0 011.06.44L14.71 9.3a.5.5 0 00.35.14H27.5A1.5 1.5 0 0129 10.94V26a1.5 1.5 0 01-1.5 1.5z" fill="#c09553" />
      <path d="M27.5 27.5h-23A1.5 1.5 0 013 26V13h26v13a1.5 1.5 0 01-1.5 1.5z" fill="#c09553" opacity="0.9" />
    </svg>
  );
}

/** Folder open — VS Code Seti style */
function FolderOpenIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M27.5 10.44H15.06a.5.5 0 01-.35-.14l-1.86-1.86A1.5 1.5 0 0011.79 8H4.5A1.5 1.5 0 003 9.5v5h26v-2.56a1.5 1.5 0 00-1.5-1.5z" fill="#c09553" />
      <path d="M28.44 14H5.56A2.5 2.5 0 003 16.15V27a1.5 1.5 0 001.5 1.5h23A1.5 1.5 0 0029 27V16.44a2.5 2.5 0 00-.56-2.44z" fill="#c09553" opacity="0.75" />
    </svg>
  );
}

/** Default file icon */
function DefaultFileIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#c5c5c5" opacity="0.8" />
    </svg>
  );
}

/** TypeScript — blue TS badge */
function TypeScriptIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#3178c6" />
      <path d="M17.4 23.24v2.26a6.31 6.31 0 001.76.49 10.48 10.48 0 002 .17 8.83 8.83 0 001.92-.2 4.52 4.52 0 001.54-.64 3 3 0 001-1.12 3.52 3.52 0 00.37-1.67 3.35 3.35 0 00-.27-1.4 3.13 3.13 0 00-.75-1.06 5.22 5.22 0 00-1.16-.81c-.45-.24-.95-.47-1.5-.69a7.41 7.41 0 01-.84-.36 2.31 2.31 0 01-.55-.35 1.22 1.22 0 01-.3-.39 1.17 1.17 0 01-.09-.47 1 1 0 01.12-.49 1.12 1.12 0 01.34-.37 1.67 1.67 0 01.54-.24 2.92 2.92 0 01.72-.08 5.3 5.3 0 01.91.08 5.69 5.69 0 01.86.24 4.58 4.58 0 01.77.39 3.2 3.2 0 01.63.52V13.9a5.55 5.55 0 00-1.58-.41 12.09 12.09 0 00-1.79-.12 7.37 7.37 0 00-1.88.23 4.42 4.42 0 00-1.5.7 3.29 3.29 0 00-1 1.18 3.63 3.63 0 00-.35 1.64 3.32 3.32 0 00.82 2.35 6.84 6.84 0 002.49 1.51c.35.14.67.29.94.43a3.56 3.56 0 01.68.44 1.67 1.67 0 01.42.49 1.24 1.24 0 01.14.59 1.08 1.08 0 01-.13.53 1.11 1.11 0 01-.37.39 1.83 1.83 0 01-.59.24 3.26 3.26 0 01-.78.08 5.49 5.49 0 01-1.87-.35 5.11 5.11 0 01-1.7-1.04zM13.87 15.58H17v-2.21H7.88v2.21h3.13v8.26h2.86v-8.26z" fill="#fff" />
    </svg>
  );
}

/** JavaScript — yellow JS badge */
function JavaScriptIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#f5de19" />
      <path d="M9.93 24.52l2.19-1.33a2.14 2.14 0 001.9 1.07c.8 0 1.3-.4 1.3-1v-5.52a1 1 0 01.05-.37c.03-.1.09-.2.16-.28h2.49v5.65c0 2.28-1.34 3.33-3.28 3.33a3.42 3.42 0 01-3.3-1.93l.49-.62zm7.68-.31l2.19-1.27a2.48 2.48 0 002.2 1.38c.92 0 1.51-.46 1.51-1.1s-.64-1.14-1.71-1.64l-.59-.25c-1.69-.72-2.82-1.63-2.82-3.54a3.15 3.15 0 013.38-3.1 3.43 3.43 0 013.17 1.77l-1.73 1.11a1.57 1.57 0 00-1.44-1c-.65 0-1.07.42-1.07.94s.42 1 1.36 1.45l.59.25c2 .85 3.11 1.72 3.11 3.67 0 2.1-1.65 3.25-3.87 3.25a4.49 4.49 0 01-4.28-2.53z" fill="#1a1a1a" />
    </svg>
  );
}

/** JSON — green curly braces */
function JsonIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#8bc34a" opacity="0.85" />
      <path d="M11.5 16.5c0-1.5-.5-2-1.5-2v-1c1.5 0 2.5 1 2.5 3s-1 3-2.5 3v-1c1 0 1.5-.5 1.5-2zm9 0c0 1.5.5 2 1.5 2v1c-1.5 0-2.5-1-2.5-3s1-3 2.5-3v1c-1 0-1.5.5-1.5 2z" fill="#8bc34a" />
    </svg>
  );
}

/** Markdown — white M on document */
function MarkdownIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#7e9ad0" opacity="0.85" />
      <path d="M10 21v-6l2.5 3 2.5-3v6h2v-8h-2l-2.5 3L10 13H8v8h2zm12-6v6h-2v-4l-1.5 2h-.01L19 17v4h-2v-8h2l1.5 2.5L22 13h2v2z" fill="#7e9ad0" />
    </svg>
  );
}

/** HTML — orange tags */
function HtmlIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#e44d26" />
      <path d="M12.3 21.2L8.5 16l3.8-5.2h2.8L11.3 16l3.8 5.2h-2.8zm7.4 0l3.8-5.2-3.8-5.2h-2.8L20.7 16l-3.8 5.2h2.8z" fill="#fff" />
    </svg>
  );
}

/** CSS — blue hash */
function CssIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#264de4" />
      <path d="M12.3 12h-1.5l-.5 2H8.8l.5-2H7.8L7.3 14h1.5l-.5 2H6.8L6.3 18h1.5l.5-2h1.5l-.5 2h1.5l.5-2h1.5l.5-2H12l.5-2h1.5l-.5 2h1.8l.5-2h1.5l-.5 2h1.5l-.5 2H16l-.5 2h1.5l-.5 2h-1.5l.5-2h-1.5l.5-2H13l-.5 2h-1.5l.5-2z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/** Python — blue/yellow */
function PythonIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M15.885 2.1c-7.1 0-6.651 3.079-6.651 3.079V8.3h6.772v1H5.878S2 8.824 2 16.025s3.388 6.945 3.388 6.945h2.022v-3.341s-.109-3.388 3.333-3.388h5.741s3.228.052 3.228-3.12V7.534S20.963 2.1 15.885 2.1zM12.1 5a1.1 1.1 0 11.001 2.2A1.1 1.1 0 0112.1 5z" fill="#366c9c" />
      <path d="M16.085 29.9c7.1 0 6.651-3.079 6.651-3.079V23.7h-6.772v-1h10.128S30 23.176 30 15.975s-3.388-6.945-3.388-6.945h-2.022v3.341s.109 3.388-3.333 3.388h-5.741s-3.228-.052-3.228 3.12v5.587S11.007 29.9 16.085 29.9zM19.87 27a1.1 1.1 0 11-.001-2.2A1.1 1.1 0 0119.87 27z" fill="#ffc331" />
    </svg>
  );
}

/** C/C++/Arduino — teal */
function CppIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#00599c" />
      <path d="M21.5 18h-2v-2h-1v2h-2v1h2v2h1v-2h2v-1z" fill="#fff" />
      <path d="M27 17h-2v-2h-1v2h-2v1h2v2h1v-2h2v-1z" fill="#fff" />
      <path d="M14.5 22.2a6.2 6.2 0 110-12.4 6.17 6.17 0 014.4 1.82l-2.19 2.19a3.09 3.09 0 00-2.21-.91 3.1 3.1 0 000 6.2 3.08 3.08 0 002.21-.92l2.19 2.19a6.17 6.17 0 01-4.4 1.83z" fill="#fff" />
    </svg>
  );
}

/** Image file — green landscape */
function ImageIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#66bb6a" opacity="0.8" />
      <circle cx="12" cy="16" r="2" fill="#66bb6a" />
      <path d="M8 25l4-5 2.5 3 3.5-5 6 7H8z" fill="#66bb6a" opacity="0.6" />
    </svg>
  );
}

/** YAML/config file */
function YamlIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#c27d4f" opacity="0.8" />
    </svg>
  );
}

/** Git/dotfile */
function GitIcon() {
  return (
    <svg width={S} height={S} viewBox="0 0 32 32" fill="none">
      <path d="M20.414 2H8a2 2 0 00-2 2v24a2 2 0 002 2h16a2 2 0 002-2V9.586L20.414 2zM20 4.414L23.586 8H20V4.414zM8 28V4h10v6h6v18H8z" fill="#f05032" opacity="0.7" />
    </svg>
  );
}

const extensionMap: Record<string, () => ReactElement> = {
  '.ts': TypeScriptIcon,
  '.tsx': TypeScriptIcon,
  '.js': JavaScriptIcon,
  '.jsx': JavaScriptIcon,
  '.mjs': JavaScriptIcon,
  '.cjs': JavaScriptIcon,
  '.json': JsonIcon,
  '.md': MarkdownIcon,
  '.mdx': MarkdownIcon,
  '.html': HtmlIcon,
  '.htm': HtmlIcon,
  '.css': CssIcon,
  '.scss': CssIcon,
  '.less': CssIcon,
  '.py': PythonIcon,
  '.ino': CppIcon,
  '.cpp': CppIcon,
  '.c': CppIcon,
  '.h': CppIcon,
  '.hpp': CppIcon,
  '.png': ImageIcon,
  '.jpg': ImageIcon,
  '.jpeg': ImageIcon,
  '.gif': ImageIcon,
  '.svg': ImageIcon,
  '.webp': ImageIcon,
  '.yml': YamlIcon,
  '.yaml': YamlIcon,
  '.toml': YamlIcon,
};

/** Dotfile patterns that get special icon */
const dotfilePatterns = ['.gitignore', '.gitattributes', '.gitmodules', '.eslintrc', '.prettierrc', '.editorconfig'];

export function getFileIcon(name: string, isDirectory: boolean, isOpen?: boolean): ReactElement {
  if (isDirectory) {
    return isOpen ? <FolderOpenIcon /> : <FolderClosedIcon />;
  }

  // Check dotfile patterns
  if (dotfilePatterns.some(p => name === p || name.startsWith(p))) {
    return <GitIcon />;
  }

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex > 0) {
    const ext = name.slice(dotIndex).toLowerCase();
    const IconComponent = extensionMap[ext];
    if (IconComponent) {
      return <IconComponent />;
    }
  }

  return <DefaultFileIcon />;
}
