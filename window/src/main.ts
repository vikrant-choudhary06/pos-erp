import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, Tray } from 'electron';
import { cleanUrl, loadConfig, saveConfig, type Config } from './config';
import { startHub, type Hub, type HubStatus } from './hub';
import { printSilently } from './printing';
import {
  checkNow,
  installNow,
  startUpdates,
  updateState,
  updatesEnabled,
  type UpdateState,
} from './updates';

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
let announced = '';

const logFile = () => path.join(app.getPath('userData'), 'hub.log');
// written straight away: an async write is lost behind a blocking error
// dialog or a crash, which is exactly when the log is needed
function log(message: string) {
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // disk full or locked, nothing useful to do about it here
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(start);
}

async function start() {
  Menu.setApplicationMenu(null);
  // Windows needs this for notifications to show and be clickable
  app.setAppUserModelId('in.rizzoto.pos');
  log(`Rizzoto ${app.getVersion()} starting`);
  config = loadConfig();
  createTray();
  startUpdates({
    log,
    onChange: showUpdate,
    beforeInstall: () => {
      quitting = true;
    },
  });
  if (!config.cloudUrl) return openSettings();
  await runHub();
  showMain();
}

async function runHub() {
  await hub?.stop();
  hub = null;
  let started: Hub | null = null;
  // right after an update the old copy can still be letting go of the port
  for (let attempt = 1; !started; attempt++) {
    try {
      started = await startHub({
        cloudUrl: config.cloudUrl,
        port: config.port,
        dataDir: path.join(app.getPath('userData'), 'hub'),
        log,
      });
    } catch (err) {
      const busy = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
      if (busy && attempt < 10) {
        log(`Port ${config.port} is busy, trying again`);
        await wait(1500);
        continue;
      }
      log(`Hub did not start: ${(err as Error).message}`);
      dialog.showErrorBox(
        'Rizzoto',
        busy
          ? `Port ${config.port} is already in use. Pick another port in Settings.`
          : `The local hub could not start: ${(err as Error).message}`,
      );
      return;
    }
  }
  hub = started;
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

function showUpdate(update: UpdateState) {
  settings?.webContents.send('update:status', update);
  buildTrayMenu();
  if (update.state !== 'ready' || announced === update.version) return;
  announced = update.version;
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: `Rizzoto ${update.version} is ready`,
    body: 'It installs the next time Rizzoto starts. Click to restart now.',
    icon: path.join(assets, 'icon.png'),
  });
  note.on('click', confirmRestart);
  note.show();
}

async function confirmRestart() {
  const update = updateState();
  if (update.state !== 'ready') return;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Rizzoto',
    message: `Restart now to update to ${update.version}?`,
    detail:
      'Takes about 15 seconds. Open orders are kept; tablets reconnect on their own. Items not yet sent to the kitchen on this screen will need adding again.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) installNow();
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
  buildTrayMenu();
}

function buildTrayMenu() {
  const update = updateState();
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open POS', click: showMain },
      { label: 'Settings', click: openSettings },
      ...(update.state === 'ready'
        ? [{ label: `Restart to update (${update.version})`, click: confirmRestart }]
        : []),
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
  // the queue is saved on every change; never let a stuck socket keep an
  // update (or Windows shutting down) waiting
  void Promise.race([stopping.stop(), wait(3000)])
    .catch(() => {})
    .finally(() => app.quit());
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
  update: updateState(),
  updates: updatesEnabled(),
}));

ipcMain.handle('update:check', () => checkNow());
ipcMain.handle('update:install', () => confirmRestart());

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
