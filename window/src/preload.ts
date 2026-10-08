import { contextBridge, ipcRenderer } from 'electron';

// What the POS page can ask of the desktop app. The web app checks for
// window.rizzotoDesktop and falls back to the browser print dialog without it.
contextBridge.exposeInMainWorld('rizzotoDesktop', {
  print: (html: string, kind: 'bill' | 'kot') => ipcRenderer.invoke('print', html, kind),
  openSettings: () => ipcRenderer.send('open-settings'),
});
