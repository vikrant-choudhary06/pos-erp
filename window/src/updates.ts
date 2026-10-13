import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The counter PC keeps itself up to date. A new version downloads in the
// background while the shop works; it is installed
//  - when someone clicks "Restart to update" (tray or settings),
//  - when Rizzoto quits, or
//  - on the next start: the installer is already downloaded then, so it goes
//    in before anyone has started billing.
// Nothing ever restarts the app in the middle of service on its own.

// Releases live on a public GitHub repo ("owner/repo"), set at build time
// (build.mjs) from RIZZOTO_UPDATE_REPO. Local builds have none and never look
// for updates. Release builds also pin the code signing certificate publisher.
const REPO = process.env.RIZZOTO_UPDATE_REPO ?? '';
const PUBLISHER = process.env.RIZZOTO_UPDATE_PUBLISHER ?? '';

const CHECK_EVERY = 4 * 60 * 60_000;
// an update found ready this soon after launch was downloaded last time
const JUST_STARTED = 90_000;

export type UpdateState =
  | { state: 'off' }
  | { state: 'idle'; checkedAt?: string }
  | { state: 'checking' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

type Options = {
  log: (message: string) => void;
  onChange: (state: UpdateState) => void;
  /** last chance to stop the hub cleanly before the installer takes over */
  beforeInstall: () => void;
};

let state: UpdateState = { state: 'off' };
let options: Options;
let downloadedNow = false;
let enabled = false;
const launchedAt = Date.now();

export const updateState = () => state;
export const updatesEnabled = () => enabled;

function set(next: UpdateState) {
  state = next;
  options.onChange(state);
}

export function startUpdates(opts: Options) {
  options = opts;
  enabled = false;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  if (!app.isPackaged || !PUBLISHER || !/^[\w.-]+\/[\w.-]+$/.test(REPO)) return;

  const [owner, repo] = REPO.split('/');
  const configPath = path.join(__dirname, 'trusted-update.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (
      config.provider !== 'github' ||
      config.owner !== owner ||
      config.repo !== repo ||
      config.publisherName?.length !== 1 ||
      config.publisherName[0] !== PUBLISHER
    ) {
      throw new Error('Update publisher configuration does not match this build');
    }
    autoUpdater.updateConfigPath = configPath;
  } catch (error) {
    opts.log(`Updates disabled: ${error instanceof Error ? error.message : String(error)}`);
    set({ state: 'error', message: 'The update signature configuration is missing or invalid.' });
    return;
  }
  autoUpdater.setFeedURL({
    provider: 'github',
    owner,
    repo,
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  enabled = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = {
    info: (m: unknown) => opts.log(`Update: ${m}`),
    warn: (m: unknown) => opts.log(`Update: ${m}`),
    error: (m: unknown) => opts.log(`Update error: ${m}`),
    debug: () => {},
  };

  autoUpdater.on('checking-for-update', () => {
    // don't hide a finished download behind a fresh check
    if (state.state !== 'ready') set({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', () =>
    set({ state: 'idle', checkedAt: new Date().toISOString() }),
  );
  autoUpdater.on('update-available', (info) => {
    if (state.state !== 'ready') set({ state: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('download-progress', (p) => {
    downloadedNow = true;
    if (state.state === 'downloading') {
      set({ ...state, percent: Math.round(p.percent) });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version });
    // found already downloaded right after start: nobody is billing yet
    if (!downloadedNow && Date.now() - launchedAt < JUST_STARTED) {
      opts.log(`Installing ${info.version} on start`);
      installNow();
    }
  });
  autoUpdater.on('error', (err) => {
    // no internet is normal for a shop, try again on the next round
    if (state.state === 'ready') return;
    set({ state: 'error', message: err?.message ?? String(err) });
  });

  void checkNow();
  setInterval(() => void checkNow(), CHECK_EVERY).unref();
}

export async function checkNow() {
  if (!updatesEnabled() || state.state === 'downloading') return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // reported through the 'error' event
  }
  return state;
}

export function installNow() {
  if (state.state !== 'ready') return;
  options.beforeInstall();
  // silent install, then start Rizzoto again
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}
