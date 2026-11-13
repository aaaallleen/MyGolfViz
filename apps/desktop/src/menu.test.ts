import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildMenuTemplate } from './menu';

function build(isDev: boolean) {
  const openDataFolder = vi.fn();
  const openLogs = vi.fn();
  const template = buildMenuTemplate({ appName: 'MyGolfViz', isDev, openDataFolder, openLogs });
  return { template, openDataFolder, openLogs };
}

function submenu(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  expect(item).toBeDefined();
  expect(Array.isArray(item!.submenu)).toBe(true);
  return item!.submenu as MenuItemConstructorOptions[];
}

function roles(items: MenuItemConstructorOptions[]): string[] {
  return items.flatMap((i) => (i.role ? [i.role] : []));
}

function allRoles(items: MenuItemConstructorOptions[]): string[] {
  return items.flatMap((i) => [
    ...(i.role ? [i.role] : []),
    ...(Array.isArray(i.submenu) ? allRoles(i.submenu as MenuItemConstructorOptions[]) : []),
  ]);
}

describe('buildMenuTemplate', () => {
  it('has an Edit menu with the clipboard and undo roles', () => {
    const { template } = build(false);
    const edit = template.find((m) => m.role === 'editMenu');
    expect(edit?.label).toBe('Edit');
    expect(roles(submenu(edit))).toEqual(expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']));
  });

  it('puts Open Data Folder and Open Logs in the app menu and wires them', () => {
    const { template, openDataFolder, openLogs } = build(false);
    const appMenu = template[0];
    expect(appMenu?.role).toBe('appMenu');
    const items = submenu(appMenu);
    const data = items.find((i) => i.label === 'Open Data Folder');
    const logs = items.find((i) => i.label === 'Open Logs');
    expect(data).toBeDefined();
    expect(logs).toBeDefined();

    (data!.click as () => void)();
    expect(openDataFolder).toHaveBeenCalledTimes(1);
    expect(openLogs).not.toHaveBeenCalled();
    (logs!.click as () => void)();
    expect(openLogs).toHaveBeenCalledTimes(1);
  });

  it('uses the standard roles for the app, View and Window menus', () => {
    const { template } = build(false);
    expect(roles(submenu(template[0]))).toEqual(
      expect.arrayContaining(['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit']),
    );
    const view = template.find((m) => m.role === 'viewMenu');
    expect(view?.label).toBe('View');
    expect(roles(submenu(view))).toEqual(expect.arrayContaining(['resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen']));
    expect(template.some((m) => m.role === 'windowMenu')).toBe(true);
  });

  it('offers toggleDevTools only in development', () => {
    expect(allRoles(build(true).template)).toContain('toggleDevTools');
    expect(allRoles(build(false).template)).not.toContain('toggleDevTools');
  });
});
