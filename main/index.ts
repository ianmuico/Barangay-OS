import { app, BrowserWindow, protocol, net, dialog, session, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './database/connection';
import { registerAuthHandlers } from './ipc/auth';
import { registerDatabaseHandlers } from './ipc/database';
import { registerBackupHandlers } from './ipc/backup';
import { registerReportHandlers } from './ipc/reports';
import { registerServerHandlers } from './ipc/server';
import { registerAIHandlers } from './ipc/ai';
import { registerExcelHandlers } from './ipc/excel';
import { registerPresenceHandlers } from './ipc/presence';
import { initLogger } from './utils/logger';
import { trackEvent } from './database/queries/analytics';
import { initAutoUpdater } from './utils/updater';
import { stopTunnel } from './utils/tunnel';
import { pathToFileURL } from 'url';

const isDev = process.env.NODE_ENV === 'development';

// Suppress the Electron Security Warning about Content-Security-Policy in development
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function getOutDir(): string {
  return path.join(__dirname, '../../renderer/out');
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
};

function resolveFilePath(urlPath: string): string {
  const outDir = getOutDir();

  // Remove leading slash
  if (urlPath.startsWith('/')) {
    urlPath = urlPath.substring(1);
  }

  // Remove query string and hash
  urlPath = urlPath.split('?')[0].split('#')[0];

  let filePath = path.join(outDir, urlPath);

  // If it has a file extension and exists, serve it directly
  if (path.extname(filePath) && fs.existsSync(filePath)) {
    return filePath;
  }

  // If no extension, try as directory with index.html
  if (!path.extname(filePath)) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
    // Also try with .html extension
    const htmlPath = filePath + '.html';
    if (fs.existsSync(htmlPath)) {
      return htmlPath;
    }
  }

  // Fallback to root index.html
  return path.join(outDir, 'index.html');
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashHtml = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
    height: 100vh; background: transparent;
    -webkit-app-region: drag;
  }
  .splash {
    background: #18181b; color: white; border-radius: 20px;
    padding: 48px 40px; text-align: center; width: 380px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.3);
    animation: fadeIn 0.5s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .logo { width: 64px; height: 64px; margin: 0 auto 16px; }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; letter-spacing: -0.3px; }
  .subtitle { font-size: 12px; color: #a1a1aa; margin-bottom: 24px; }
  .loader { width: 32px; height: 3px; background: #27272a; border-radius: 2px; margin: 0 auto; overflow: hidden; }
  .loader-bar { width: 50%; height: 100%; background: #8b5cf6; border-radius: 2px; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
  .version { font-size: 10px; color: #52525b; margin-top: 16px; }
</style>
</head>
<body>
<div class="splash">
  <h1>Barangay Management System</h1>
  <p class="subtitle">Loading your workspace...</p>
  <div class="loader"><div class="loader-bar"></div></div>
  <p class="version">v1.3</p>
</div>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* data: blob:;"
            : "default-src 'self' app:; script-src 'self' 'unsafe-inline' app:; style-src 'self' 'unsafe-inline' app:; img-src 'self' data: blob: app:; font-src 'self' data: app:; connect-src 'self' app:;"
        ],
      },
    });
  });

  if (isDev) {
    // Port is chosen dynamically by scripts/dev.js and passed via NEXT_DEV_URL
    mainWindow.loadURL(process.env.NEXT_DEV_URL || 'http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://host/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    // Close splash with a brief delay for smooth transition
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.show();
    }, isDev ? 500 : 2000);
  });

  // Register keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control || input.meta) {
      if (input.key.toLowerCase() === 'g' && input.type === 'keyDown') {
        mainWindow?.webContents.send('shortcut:generate-report');
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register the custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true,
      corsEnabled: false,
    },
  },
]);

app.whenReady().then(() => {
  // Register protocol handler for production
  if (!isDev) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = new URL(request.url);
      let urlPath = decodeURIComponent(url.pathname);
      const filePath = resolveFilePath(urlPath);
      callback({ path: filePath });
    });
  }

  // Initialize logging
  initLogger();

  // Initialize database — if migration fails, show a clear error and quit safely
  try {
    initDatabase();
  } catch (err: any) {
    dialog.showErrorBox(
      'Database Upgrade Failed',
      `The app could not upgrade your database to the new version.\n\n` +
      `Your data has NOT been lost — a backup was automatically saved to:\n` +
      `  ${app.getPath('userData')}\\upgrade-backups\\\n\n` +
      `Please contact your system administrator.\n\nDetails:\n${err?.message ?? err}`
    );
    app.quit();
    return;
  }

  // Track app open
  try { trackEvent('app_open'); } catch { /* analytics should never crash the app */ }

  // Show splash screen while main window loads
  createSplashWindow();

  registerAuthHandlers();
  registerDatabaseHandlers();
  registerBackupHandlers();
  registerReportHandlers();
  registerExcelHandlers();
  registerPresenceHandlers();
  registerServerHandlers();
  registerAIHandlers();
  createWindow();

  // Initialize auto-updater (only in production)
  if (!isDev && mainWindow) {
    initAutoUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Don't leave a cloudflared child running after the app closes
  stopTunnel();
});
