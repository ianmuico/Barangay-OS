import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { logInfo, logError } from './logger';

// macOS builds aren't Apple-code-signed (that needs a paid Developer ID), so they
// can't silently self-apply an update. On Mac we detect the new version, tell the
// user, and open the download page — they install the new .dmg over the old app.
// Their data is in Application Support (outside the .app), so it is preserved.
const isMac = process.platform === 'darwin';
const RELEASES_URL = 'https://github.com/mmmsss211/barangay-management/releases/latest';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-updater — resilient on slow / unstable internet.
//
// Integrity (built in to electron-updater): every release publishes a SHA-512
// hash of the installer inside latest.yml. After downloading, the updater
// verifies the file against that hash. A partial or corrupted download FAILS the
// check and is NEVER installed — the currently-installed app keeps running
// untouched. So "make sure all files for the update are there" is guaranteed:
// an incomplete download simply doesn't apply.
//
// Resilience (added here): the download runs in the background and, if it fails
// (dropped Wi-Fi, timeout), we automatically retry with a backoff a few times,
// re-fetching whatever is missing until a complete, verified file is ready. Only
// if it still can't finish do we ask the user to try again. The update is
// applied atomically on restart; nothing is half-installed.
// ─────────────────────────────────────────────────────────────────────────────

let mainWin: BrowserWindow | null = null;

let isDownloading = false;
let downloadRetries = 0;
const MAX_DOWNLOAD_RETRIES = 5;

let checkRetries = 0;
const MAX_CHECK_RETRIES = 3;

// The releases repo is private, so installed apps need a GitHub token to
// check/download updates. The token is read from `update-token.txt` placed
// either next to the installed app's resources or in the app data folder.
// See RELEASING.md for how to generate and deploy it.
function loadUpdateToken(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'update-token.txt'),
    path.join(app.getPath('userData'), 'update-token.txt'),
  ];
  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) {
        const token = fs.readFileSync(file, 'utf-8').trim();
        if (token) return token;
      }
    } catch { /* try next location */ }
  }
  return process.env.GH_TOKEN || null;
}

function startDownload(): void {
  isDownloading = true;
  // downloadUpdate() also surfaces failures via the 'error' event, where the
  // retry logic lives — so we just swallow the rejection here to avoid an
  // unhandled-promise warning.
  autoUpdater.downloadUpdate().catch((err) => {
    logInfo(`downloadUpdate rejected (handled via error event): ${err?.message || err}`);
  });
}

// Retry the initial check a few times — a laggy connection at startup shouldn't
// permanently skip updates for the session.
function checkForUpdatesWithRetry(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    if (checkRetries < MAX_CHECK_RETRIES) {
      checkRetries++;
      const delay = Math.min(60_000, 15_000 * checkRetries);
      logInfo(`Update check failed (attempt ${checkRetries}/${MAX_CHECK_RETRIES}); retrying in ${delay / 1000}s: ${err?.message || 'offline'}`);
      setTimeout(checkForUpdatesWithRetry, delay);
    } else {
      logInfo(`Update check skipped after ${MAX_CHECK_RETRIES} attempts: ${err?.message || 'offline or no releases'}`);
    }
  });
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWin = window;

  // Don't auto-download — let the user confirm. Still install on quit if a
  // verified update was downloaded but the user chose "Later".
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const token = loadUpdateToken();
  if (token) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'mmmsss211',
      repo: 'barangay-management',
      private: true,
      token,
    });
    logInfo('Updater: using private GitHub releases feed.');
  } else {
    logInfo('Updater: no update token found — update checks will fail for a private repo. See RELEASING.md.');
  }

  autoUpdater.on('checking-for-update', () => {
    logInfo('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    logInfo(`Update available: ${info.version}`);
    checkRetries = 0;

    // macOS: can't silently self-apply (unsigned) — notify + open the download.
    if (isMac) {
      dialog.showMessageBox(mainWin!, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: 'Click Download to get the new version, then drag it into Applications, replacing the old one. Your barangay data stays exactly as it is — the update only replaces the software.',
        buttons: ['Download', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) shell.openExternal(RELEASES_URL);
      });
      return;
    }

    // Windows: full silent auto-update (download in background, apply on restart).
    dialog.showMessageBox(mainWin!, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available.`,
      detail: 'Would you like to download and install it? You can keep working while it downloads.',
      buttons: ['Update', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        downloadRetries = 0;
        startDownload();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    logInfo('App is up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    isDownloading = true;
    mainWin?.webContents.send('updater:progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    isDownloading = false;
    downloadRetries = 0;
    logInfo('Update downloaded and verified. Will install on quit.');
    mainWin?.webContents.send('updater:progress', 100);
    dialog.showMessageBox(mainWin!, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The app will restart to apply the update.',
      detail: 'Your data is safe — updates never touch the barangay database.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    logError('Auto-updater error', err);

    // Only the download phase gets the retry/redo treatment. A failed download
    // (bad internet, failed checksum) is recoverable — re-fetch until complete.
    if (!isDownloading) return;
    isDownloading = false;

    if (downloadRetries < MAX_DOWNLOAD_RETRIES) {
      downloadRetries++;
      const delay = Math.min(30_000, 5_000 * downloadRetries);
      logInfo(`Update download failed; auto-retrying (${downloadRetries}/${MAX_DOWNLOAD_RETRIES}) in ${delay / 1000}s.`);
      mainWin?.webContents.send('updater:retrying', { attempt: downloadRetries, max: MAX_DOWNLOAD_RETRIES });
      setTimeout(startDownload, delay);
      return;
    }

    // Gave up after several tries — tell the user, offer to try again. The app
    // keeps running on the current version regardless.
    mainWin?.webContents.send('updater:error', { message: err?.message || 'download failed' });
    dialog.showMessageBox(mainWin!, {
      type: 'warning',
      title: 'Update download failed',
      message: 'The update could not be downloaded — your internet may be unstable.',
      detail: 'The app will keep working normally on the current version. Nothing was changed. You can try again now or later.',
      buttons: ['Try again', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        downloadRetries = 0;
        startDownload();
      }
    });
  });

  // IPC handler for a manual "Check for updates" action.
  ipcMain.handle('updater:check', async () => {
    try {
      checkRetries = 0;
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // Check for updates shortly after launch (don't block startup), with retries.
  setTimeout(checkForUpdatesWithRetry, 10_000);
}
