const paths = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  plugins: '<path d="M9 4.5V7H5.5A1.5 1.5 0 0 0 4 8.5V12h2.5a2.5 2.5 0 0 1 0 5H4v3.5A1.5 1.5 0 0 0 5.5 22h3.5v-2.5a2.5 2.5 0 0 1 5 0V22h3.5a1.5 1.5 0 0 0 1.5-1.5V17h2.5a2.5 2.5 0 0 0 0-5H20V8.5A1.5 1.5 0 0 0 18.5 7H15V4.5a3 3 0 0 0-6 0Z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  sessions: '<path d="M21 12a8 8 0 0 1-8 8H6l-3 2v-5a8 8 0 0 1 8-11h2a8 8 0 0 1 8 6Z"/><path d="M8 11h8M8 15h5"/>',
  skills: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/><path d="m5 16 .6 1.7L7.3 18l-1.7.6L5 20.3l-.6-1.7L2.7 18l1.7-.3L5 16Z"/>',
  logs: '<path d="M3 12h4l2.2-6 4.2 12 2.4-8 1.6 2H21"/>',
  settings: '<path d="M5 4v5M5 15v5M12 4v2M12 12v8M19 4v8M19 18v2"/><circle cx="5" cy="12" r="3"/><circle cx="12" cy="9" r="3"/><circle cx="19" cy="15" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14Z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  alert: '<path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
  folderOpen: '<path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 2h7.5A1.5 1.5 0 0 1 20 7.5V9"/><path d="M3.8 9h17.4l-2 9.2a1.5 1.5 0 0 1-1.5 1.2H5.7a1.5 1.5 0 0 1-1.5-1.2Z"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>',
  wand: '<path d="m15 4 5 5M13.5 5.5 18.5 10.5"/><path d="M4 20 14 10"/><path d="m5 4 .8 2.2L8 7l-2.2.8L5 10l-.8-2.2L2 7l2.2-.8L5 4ZM19 14l.6 1.6L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.4L19 14Z"/>',
  play: '<path d="M7 4.5v15l13-7.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5M12 22V12"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  loader: '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h3Zm0 0v12a3 3 0 1 1-3-3h3Zm6 0a3 3 0 1 1 3 3h-3Zm0 0v12a3 3 0 1 0 3-3h-3Z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  git: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6M18 9v6"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H12a2 2 0 0 1 0-4h3a6 6 0 0 0-3-11Z"/><circle cx="7.5" cy="10" r=".7"/><circle cx="9.5" cy="6.5" r=".7"/><circle cx="14" cy="6" r=".7"/><circle cx="17" cy="9" r=".7"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9M17 3h4v4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 11h6M9 15h6"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  hardDrive: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  rocket: '<path d="M14 4c3.5-1.5 6 1 6 1s1 5-2.5 8.5L12 19l-3-3-5-1Z"/><path d="M9 15l-4 4M14 9h.01"/>',
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
};

export function icon(name, size = 18, className = '') {
  const path = paths[name] || paths.info;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function logoMark(size = 36) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="hubLogoA" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3ee0c0"/><stop offset="1" stop-color="#5b8cff"/>
      </linearGradient>
      <radialGradient id="hubLogoB" cx="0" cy="0" r="1" gradientTransform="translate(32 32) rotate(90) scale(30)" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0d2233"/><stop offset="1" stop-color="#070d17"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#hubLogoB)" stroke="rgba(154,220,240,.22)"/>
    <path d="M32 12v11M15 43l12-7M49 43l-12-7" stroke="url(#hubLogoA)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="32" cy="12" r="4" fill="#3ee0c0"/>
    <circle cx="15" cy="45" r="4" fill="#ff9f6e"/>
    <circle cx="49" cy="45" r="4" fill="#5b8cff"/>
    <path d="M25 25v14M39 25v14M25 32h14" stroke="#eafcff" stroke-width="4.5" stroke-linecap="round"/>
  </svg>`;
}
