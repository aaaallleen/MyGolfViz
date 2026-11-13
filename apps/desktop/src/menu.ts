import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu. The Edit menu roles are what make Cmd+C/V/X/A/Z and Shift+Cmd+Z
 * work in text fields on macOS.
 */
export function buildMenuTemplate(o: {
  appName: string;
  isDev: boolean;
  openDataFolder: () => void;
  openLogs: () => void;
}): MenuItemConstructorOptions[] {
  const devItems: MenuItemConstructorOptions[] = o.isDev
    ? [{ type: 'separator' }, { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }]
    : [];
  return [
    {
      label: o.appName,
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => o.openDataFolder() },
        { label: 'Open Logs', click: () => o.openLogs() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      role: 'editMenu',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      role: 'viewMenu',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...devItems,
      ],
    },
    { role: 'windowMenu' },
  ];
}
