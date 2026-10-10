/* Symbole aus Lucide (https://lucide.dev, ISC-Lizenz), als Daten eingebettet:
   kein Nachladen, keine fremde Bibliothek zur Laufzeit.
   Erzeugt aus lucide-static - neue Symbole dort heraussuchen und ergänzen. */

export interface IconShape {
  t: 'path' | 'rect' | 'circle' | 'line';
  [attribute: string]: string;
}

export const ICONS = {
  cloud: [{ t: 'path', d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }],
  'calendar-days': [
    { t: 'path', d: 'M8 2v3' },
    { t: 'path', d: 'M16 2v3' },
    { t: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2' },
    { t: 'path', d: 'M3 9h18' },
    { t: 'path', d: 'M8 13h.01' },
    { t: 'path', d: 'M12 13h.01' },
    { t: 'path', d: 'M16 13h.01' },
    { t: 'path', d: 'M8 17h.01' },
    { t: 'path', d: 'M12 17h.01' },
    { t: 'path', d: 'M16 17h.01' },
  ],
  presentation: [
    { t: 'path', d: 'M2 3h20' },
    { t: 'path', d: 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3' },
    { t: 'path', d: 'm7 21 5-5 5 5' },
  ],
  users: [
    { t: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { t: 'path', d: 'M16 3.128a4 4 0 0 1 0 7.744' },
    { t: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { t: 'circle', cx: '9', cy: '7', r: '4' },
  ],
  'chart-column': [
    { t: 'path', d: 'M3 3v16a2 2 0 0 0 2 2h16' },
    { t: 'path', d: 'M18 17V9' },
    { t: 'path', d: 'M13 17V5' },
    { t: 'path', d: 'M8 17v-3' },
  ],
  save: [
    {
      t: 'path',
      d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    },
    { t: 'path', d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' },
    { t: 'path', d: 'M7 3v4a1 1 0 0 0 1 1h7' },
  ],
  'circle-check': [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'm16 9-5.5 5.5L8 12' },
  ],
  menu: [
    { t: 'path', d: 'M4 5h16' },
    { t: 'path', d: 'M4 12h16' },
    { t: 'path', d: 'M4 19h16' },
  ],
  x: [
    { t: 'path', d: 'M18 6 6 18' },
    { t: 'path', d: 'm6 6 12 12' },
  ],
  moon: [
    {
      t: 'path',
      d: 'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401',
    },
  ],
  sun: [
    { t: 'circle', cx: '12', cy: '12', r: '4' },
    { t: 'path', d: 'M12 2v2' },
    { t: 'path', d: 'M12 20v2' },
    { t: 'path', d: 'm4.93 4.93 1.41 1.41' },
    { t: 'path', d: 'm17.66 17.66 1.41 1.41' },
    { t: 'path', d: 'M2 12h2' },
    { t: 'path', d: 'M20 12h2' },
    { t: 'path', d: 'm6.34 17.66-1.41 1.41' },
    { t: 'path', d: 'm19.07 4.93-1.41 1.41' },
  ],
  monitor: [
    { t: 'rect', width: '20', height: '14', x: '2', y: '3', rx: '2' },
    { t: 'line', x1: '8', x2: '16', y1: '21', y2: '21' },
    { t: 'line', x1: '12', x2: '12', y1: '17', y2: '21' },
  ],
  'log-out': [
    { t: 'path', d: 'm16 17 5-5-5-5' },
    { t: 'path', d: 'M21 12H9' },
    { t: 'path', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' },
  ],
  'undo-2': [
    { t: 'path', d: 'M9 14 4 9l5-5' },
    { t: 'path', d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' },
  ],
  shuffle: [
    { t: 'path', d: 'm18 14 4 4-4 4' },
    { t: 'path', d: 'm18 2 4 4-4 4' },
    { t: 'path', d: 'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22' },
    { t: 'path', d: 'M2 6h1.972a4 4 0 0 1 3.6 2.2' },
    { t: 'path', d: 'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45' },
  ],
  'arrow-down-a-z': [
    { t: 'path', d: 'm3 16 4 4 4-4' },
    { t: 'path', d: 'M7 20V4' },
    { t: 'path', d: 'M20 8h-5' },
    { t: 'path', d: 'M15 10V6.5a2.5 2.5 0 0 1 5 0V10' },
    { t: 'path', d: 'M15 14h5l-5 6h5' },
  ],
  'trash-2': [
    { t: 'path', d: 'M10 11v6' },
    { t: 'path', d: 'M14 11v6' },
    { t: 'path', d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' },
    { t: 'path', d: 'M3 6h18' },
    { t: 'path', d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
  ],
  plus: [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'M12 5v14' },
  ],
  pencil: [
    {
      t: 'path',
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
    },
    { t: 'path', d: 'm15 5 4 4' },
  ],
  download: [
    { t: 'path', d: 'M12 15V3' },
    { t: 'path', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' },
    { t: 'path', d: 'm7 10 5 5 5-5' },
  ],
  'chevron-left': [{ t: 'path', d: 'm15 18-6-6 6-6' }],
  'chevron-right': [{ t: 'path', d: 'm9 18 6-6-6-6' }],
  lock: [
    { t: 'rect', width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' },
    { t: 'path', d: 'M7 11V7a5 5 0 0 1 10 0v4' },
  ],
  'folder-open': [
    {
      t: 'path',
      d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2',
    },
  ],
  'file-plus': [
    {
      t: 'path',
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    },
    { t: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { t: 'path', d: 'M9 15h6' },
    { t: 'path', d: 'M12 18v-6' },
  ],
  eraser: [
    {
      t: 'path',
      d: 'M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21',
    },
    { t: 'path', d: 'm5.082 11.09 8.828 8.828' },
  ],
  'wand-sparkles': [
    {
      t: 'path',
      d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72',
    },
    { t: 'path', d: 'm14 7 3 3' },
    { t: 'path', d: 'M5 6v4' },
    { t: 'path', d: 'M19 14v4' },
    { t: 'path', d: 'M10 2v2' },
    { t: 'path', d: 'M7 8H3' },
    { t: 'path', d: 'M21 16h-4' },
    { t: 'path', d: 'M11 3H9' },
  ],
  camera: [
    {
      t: 'path',
      d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
    },
    { t: 'circle', cx: '12', cy: '13', r: '3' },
  ],
  school: [
    { t: 'path', d: 'M14 21v-3a2 2 0 0 0-4 0v3' },
    { t: 'path', d: 'M18 4.933V21' },
    { t: 'path', d: 'm4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6' },
    {
      t: 'path',
      d: 'm6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11',
    },
    { t: 'path', d: 'M6 4.933V21' },
    { t: 'circle', cx: '12', cy: '9', r: '2' },
  ],
  settings: [
    {
      t: 'path',
      d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    },
    { t: 'circle', cx: '12', cy: '12', r: '3' },
  ],
  'sliders-horizontal': [
    { t: 'path', d: 'M10 5H3' },
    { t: 'path', d: 'M12 19H3' },
    { t: 'path', d: 'M14 3v4' },
    { t: 'path', d: 'M16 17v4' },
    { t: 'path', d: 'M21 12h-9' },
    { t: 'path', d: 'M21 19h-5' },
    { t: 'path', d: 'M21 5h-7' },
    { t: 'path', d: 'M8 10v4' },
    { t: 'path', d: 'M8 12H3' },
  ],
  'key-round': [
    {
      t: 'path',
      d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
    },
    { t: 'circle', cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor' },
  ],
  'triangle-alert': [
    { t: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { t: 'path', d: 'M12 9v4' },
    { t: 'path', d: 'M12 17h.01' },
  ],
  info: [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'M12 16v-4' },
    { t: 'path', d: 'M12 8h.01' },
  ],
  clock: [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'M12 6v6l4 2' },
  ],
  'loader-circle': [{ t: 'path', d: 'M21 12a9 9 0 1 1-6.219-8.56' }],
  'ellipsis-vertical': [
    { t: 'circle', cx: '12', cy: '12', r: '1' },
    { t: 'circle', cx: '12', cy: '5', r: '1' },
    { t: 'circle', cx: '12', cy: '19', r: '1' },
  ],
  'book-open': [
    { t: 'path', d: 'M12 5v16' },
    {
      t: 'path',
      d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
    },
  ],
  'graduation-cap': [
    {
      t: 'path',
      d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
    },
    { t: 'path', d: 'M22 10v6' },
    { t: 'path', d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' },
  ],
  'circle-dot': [
    { t: 'circle', cx: '12', cy: '12', r: '1' },
    { t: 'circle', cx: '12', cy: '12', r: '10' },
  ],
  'arrow-right': [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'm12 5 7 7-7 7' },
  ],
  'file-down': [
    {
      t: 'path',
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
    },
    { t: 'path', d: 'M14 2v5a1 1 0 0 0 1 1h5' },
    { t: 'path', d: 'M12 18v-6' },
    { t: 'path', d: 'm9 15 3 3 3-3' },
  ],
  'image-off': [
    { t: 'line', x1: '2', x2: '22', y1: '2', y2: '22' },
    { t: 'path', d: 'M10.41 10.41a2 2 0 1 1-2.83-2.83' },
    { t: 'line', x1: '13.5', x2: '6', y1: '13.5', y2: '21' },
    { t: 'line', x1: '18', x2: '21', y1: '12', y2: '15' },
    { t: 'path', d: 'M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59' },
    { t: 'path', d: 'M21 15V5a2 2 0 0 0-2-2H9' },
  ],
  'list-plus': [
    { t: 'path', d: 'M16 5H3' },
    { t: 'path', d: 'M11 12H3' },
    { t: 'path', d: 'M16 19H3' },
    { t: 'path', d: 'M18 9v6' },
    { t: 'path', d: 'M21 12h-6' },
  ],
  'refresh-cw': [
    { t: 'path', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' },
    { t: 'path', d: 'M21 3v5h-5' },
    { t: 'path', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' },
    { t: 'path', d: 'M8 16H3v5' },
  ],
  'monitor-down': [
    { t: 'path', d: 'M12 13V7' },
    { t: 'path', d: 'm15 10-3 3-3-3' },
    { t: 'rect', width: '20', height: '14', x: '2', y: '3', rx: '2' },
    { t: 'path', d: 'M12 17v4' },
    { t: 'path', d: 'M8 21h8' },
  ],
  house: [
    { t: 'path', d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' },
    {
      t: 'path',
      d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    },
  ],
  'panel-left': [
    { t: 'rect', width: '18', height: '18', x: '3', y: '3', rx: '2' },
    { t: 'path', d: 'M9 3v18' },
  ],
  folder: [
    {
      t: 'path',
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    },
  ],
  list: [
    { t: 'path', d: 'M3 12h.01' },
    { t: 'path', d: 'M3 18h.01' },
    { t: 'path', d: 'M3 6h.01' },
    { t: 'path', d: 'M8 12h13' },
    { t: 'path', d: 'M8 18h13' },
    { t: 'path', d: 'M8 6h13' },
  ],
  'layout-grid': [
    { t: 'rect', width: '7', height: '7', x: '3', y: '3', rx: '1' },
    { t: 'rect', width: '7', height: '7', x: '14', y: '3', rx: '1' },
    { t: 'rect', width: '7', height: '7', x: '14', y: '14', rx: '1' },
    { t: 'rect', width: '7', height: '7', x: '3', y: '14', rx: '1' },
  ],
  'thumbs-up': [
    { t: 'path', d: 'M7 10v12' },
    {
      t: 'path',
      d: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
    },
  ],
  search: [
    { t: 'circle', cx: '11', cy: '11', r: '8' },
    { t: 'path', d: 'm21 21-4.3-4.3' },
  ],
  'user-round': [
    { t: 'circle', cx: '12', cy: '8', r: '5' },
    { t: 'path', d: 'M20 21a8 8 0 0 0-16 0' },
  ],
  'notebook-pen': [
    { t: 'path', d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4' },
    { t: 'path', d: 'M2 6h4' },
    { t: 'path', d: 'M2 10h4' },
    { t: 'path', d: 'M2 14h4' },
    { t: 'path', d: 'M2 18h4' },
    {
      t: 'path',
      d: 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
    },
  ],
} satisfies Record<string, IconShape[]>;

export type IconName = keyof typeof ICONS;
