import { Fragment } from 'react';
import { segments } from '@hestia/core';

interface VfsBreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
  className?: string;
}

/** VS Code-style chevron separator */
function BreadcrumbSeparator() {
  return (
    <span className="vfs-breadcrumbs__separator">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function VfsBreadcrumbs({ path, onNavigate, className }: VfsBreadcrumbsProps) {
  const parts = segments(path);

  return (
    <div className={`vfs-breadcrumbs${className ? ` ${className}` : ''}`}>
      <button
        className="vfs-breadcrumbs__segment vfs-breadcrumbs__root"
        onClick={() => onNavigate('/')}
        title="Root"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.36 1.37l6.36 5.8-.71.71L13 6.964v6.526l-.001.01H3l-.001-.01V6.965L2 7.88l-.71-.71 6.35-5.8h.72zM4 6.063v6.927h3v-3.5h2v3.5h3V6.063L8 2.43 4 6.063z" />
        </svg>
      </button>
      {parts.map((segment, i) => {
        const segmentPath = '/' + parts.slice(0, i + 1).join('/');
        return (
          <Fragment key={segmentPath}>
            <BreadcrumbSeparator />
            <button
              className={`vfs-breadcrumbs__segment${i === parts.length - 1 ? ' vfs-breadcrumbs__segment--active' : ''}`}
              onClick={() => onNavigate(segmentPath)}
            >
              {segment}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
