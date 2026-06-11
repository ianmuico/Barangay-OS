import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { logInfo, logError } from './logger';

let mainWin: BrowserWindow | null = null;

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

export function initAutoUpdater(window: BrowserWindow): void {
  mainWin = window;

  // Configure — suppress auto-download so user can confirm
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
    dialog.showMessageBox(mainWin!, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available.`,
      detail: 'Would you like to download and install it?',
      buttons: ['Update', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    logInfo('App is up to date.');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWin?.webContents.send('updater:progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', () => {
    logInfo('Update downloaded. Will install on quit.');
    dialog.showMessageBox(mainWin!, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The app will restart to apply the update.',
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
  });

  // IPC handler for manual check
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // Check for updates after a delay (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logInfo(`Update check skipped: ${err?.message || 'offline or no releases'}`);
    });
  }, 10000);
}
