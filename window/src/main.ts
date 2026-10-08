import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray } from 'electron';
import { cleanUrl, loadConfig, saveConfig, type Config } from './config';
import { startHub, type Hub, type HubStatus } from './hub';
import { printSilently } from './printing';

// The counter PC runs this app. It opens the POS in its own window and runs
// the hub the shop's tablets connect to, so billing carries on across all of
// them when the internet drops. Closing the window keeps the hub running in
// the tray; Quit from the tray stops it.

const assets = path.join(__dirname, '..', 'assets');

let config: Config;
let hub: Hub | null = null;
let main: BrowserWindow | null = null;
let settings: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const logFile = () => path.join(app.getPath('userData'), 'hub.log');
function log(message: string) {
  fs.appendFile(logFile(), `${new Date().toISOString()} ${message}\n`, () => {});
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(start);
}

async function start() {
  Menu.setApplicationMenu(null);
  config = loadConfig();
  createTray();
  if (!config.cloudUrl) return openSettings();
  await runHub();
  showMain();
}

async function runHub() {
  await hub?.stop();
  hub = null;
  try {
    hub = await startHub({
      cloudUrl: config.cloudUrl,
      port: config.port,
      dataDir: path.join(app.getPath('userData'), 'hub'),
      log,
    });
  } catch (err) {
    const busy = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
    dialog.showErrorBox(
      'Rizzoto',
      busy
        ? `Port ${config.port} is already in use. Pick another port in Settings.`
        : `The local hub could not start: ${(err as Error).message}`,
    );
    return;
  }
  hub.onChange(showStatus);
  showStatus(hub.status());
}

function showStatus(status: HubStatus) {
  const label =
    status.mode === 'online'
      ? 'Online'
      : status.mode === 'syncing'
        ? `Syncing ${status.pending}`
        : `Offline${status.pending ? `, ${status.pending} to sync` : ''}`;
  tray?.setToolTip(`Rizzoto: ${label}`);
  main?.setTitle(`Rizzoto (${label})`);
  settings?.webContents.send('hub:status', status);
}

function showMain() {
  if (!hub) return openSettings();
  if (main) {
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
    return;
  }

  main = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Rizzoto',
    icon: path.join(assets, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  const home = `http://localhost:${hub.port}`;

  main.once('ready-to-show', () => {
    main?.maximize();
    main?.show();
  });
  // the hub may still be starting on boot
  main.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => main?.loadURL(url), 2000);
  });
  // links to anything outside the POS open in the normal browser
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  main.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(home)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  main.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.key === ',') openSettings();
    if (input.key === 'F5') main?.webContents.reload();
    if (input.key === 'F11') main?.setFullScreen(!main.isFullScreen());
  });
  main.on('close', (event) => {
    if (quitting) return;
    // tablets in the shop still need the hub
    event.preventDefault();
    main?.hide();
  });
  main.on('closed', () => (main = null));

  void main.loadURL(`${home}/pos`);
  if (hub) showStatus(hub.status());
}

function openSettings() {
  if (settings) return settings.focus();
  settings = new BrowserWindow({
    width: 520,
    height: 680,
    resizable: false,
    minimizable: false,
    title: 'Rizzoto settings',
    icon: path.join(assets, 'icon.png'),
    autoHideMenuBar: true,
    parent: main?.isVisible() ? main : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  settings.on('closed', () => {
    settings = null;
    if (!hub && !config.cloudUrl) app.quit();
  });
  void settings.loadFile(path.join(assets, 'settings.html'));
}

function createTray() {
  tray = new Tray(path.join(assets, 'tray.png'));
  tray.setToolTip('Rizzoto');
  tray.on('click', showMain);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open POS', click: showMain },
      { label: 'Settings', click: openSettings },
      { type: 'separator' },
      {
        label: 'Quit (tablets stop working offline)',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', (event) => {
  if (!hub) return;
  event.preventDefault();
  const stopping = hub;
  hub = null;
  void stopping.stop().finally(() => app.quit());
});
app.on('window-all-closed', () => {
  // stay in the tray
});

// --- ipc ---

ipcMain.handle('print', async (_e, html: string, kind: 'bill' | 'kot') => {
  await printSilently(html, kind === 'kot' ? config.kotPrinter : config.billPrinter);
});

ipcMain.on('open-settings', openSettings);

ipcMain.handle('settings:load', () => ({
  config,
  status: hub?.status() ?? null,
  version: app.getVersion(),
}));

ipcMain.handle('settings:printers', async () => {
  const win = main ?? settings;
  const printers = (await win?.webContents.getPrintersAsync()) ?? [];
  return printers.map((p) => p.name);
});

ipcMain.handle('settings:test-print', async (_e, kind: 'bill' | 'kot') => {
  const html = `<div style="font:13px monospace;width:70mm;text-align:center;padding:4mm 0">
    Rizzoto<br>${kind === 'kot' ? 'Kitchen' : 'Bill'} printer works<br>${new Date().toLocaleString('en-IN')}</div>`;
  await printSilently(html, kind === 'kot' ? config.kotPrinter : config.billPrinter);
});

ipcMain.handle('settings:save', async (_e, input: Partial<Config>) => {
  const next: Config = {
    ...config,
    ...input,
    cloudUrl: cleanUrl(input.cloudUrl ?? config.cloudUrl),
    port: Number(input.port) || config.port,
  };
  if (!next.cloudUrl) throw new Error('Enter the web address of your Rizzoto account');

  const restart = !hub || next.cloudUrl !== config.cloudUrl || next.port !== config.port;
  config = next;
  saveConfig(config);
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.startWithWindows });

  if (restart) {
    main?.destroy();
    main = null;
    await runHub();
    showMain();
  }
  return hub?.status() ?? null;
});

ipcMain.handle('hub:sync', () => hub?.syncNow());
ipcMain.handle('hub:dismiss', (_e, seq: number) => hub?.dismissFailed(seq));
