import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { logInfo, logError } from './logger';

let mainWin: BrowserWindow | null = null;

export function initAutoUpdater(window: BrowserWindow): void {
  mainWin = window;

  // Configure — suppress auto-download so user can confirm
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

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
