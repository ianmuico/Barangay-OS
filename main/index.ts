import { app, BrowserWindow, protocol, net, dialog, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './database/connection';
import { registerAuthHandlers } from './ipc/auth';
import { registerDatabaseHandlers } from './ipc/database';
import { registerBackupHandlers } from './ipc/backup';
import { registerReportHandlers } from './ipc/reports';
import { registerServerHandlers } from './ipc/server';
import { pathToFileURL } from 'url';

const isDev = process.env.NODE_ENV === 'development';

// Suppress the Electron Security Warning about Content-Security-Policy in development
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

let mainWindow: BrowserWindow | null = null;

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
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://host/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
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

  registerAuthHandlers();
  registerDatabaseHandlers();
  registerBackupHandlers();
  registerReportHandlers();
  registerServerHandlers();
  createWindow();

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
