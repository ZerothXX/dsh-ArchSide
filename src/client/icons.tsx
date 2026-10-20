import React from 'react';
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths: Record<string, React.ReactNode> = {
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>, down: <path d="m5 9 7 7 7-7"/>,
    plus: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M10 6v8M6 10h8"/></>,
    minus: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M6 10h8"/></>,
    fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="2"/></>,
    refresh: <><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/></>,
    layout: <><rect x="2" y="9" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M8 12h4V5h4m-4 7v7h4"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    arrow: <><path d="M19 12H5m6-6-6 6 6 6"/></>,
    file: <><path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v6h5M8 13h8M8 17h6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>,
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-5 4 2-18"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg {...common}>{paths[name] ?? paths.layers}</svg>;
}
