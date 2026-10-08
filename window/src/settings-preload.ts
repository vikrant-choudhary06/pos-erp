import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('counter', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (config: unknown) => ipcRenderer.invoke('settings:save', config),
  printers: () => ipcRenderer.invoke('settings:printers'),
  testPrint: (kind: 'bill' | 'kot') => ipcRenderer.invoke('settings:test-print', kind),
  syncNow: () => ipcRenderer.invoke('hub:sync'),
  dismiss: (seq: number) => ipcRenderer.invoke('hub:dismiss', seq),
  onStatus: (fn: (status: unknown) => void) => {
    ipcRenderer.on('hub:status', (_e, status) => fn(status));
  },
});
