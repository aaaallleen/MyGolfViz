// Sandboxed preload: CommonJS, and only contextBridge/ipcRenderer from electron are used.
import { contextBridge, ipcRenderer } from 'electron';

const VERSION_ARG = '--mygolfviz-app-version=';
const versionArg = process.argv.find((a) => a.startsWith(VERSION_ARG));

const invoke = (channel: string) => (): Promise<void> => ipcRenderer.invoke(channel).then(() => undefined);

contextBridge.exposeInMainWorld('mygolfviz', {
  appVersion: versionArg ? versionArg.slice(VERSION_ARG.length) : '',
  openDataFolder: invoke('mygolfviz:open-data-folder'),
  openLogs: invoke('mygolfviz:open-logs'),
  restartBackend: invoke('mygolfviz:restart-backend'),
  quit: invoke('mygolfviz:quit'),
});
