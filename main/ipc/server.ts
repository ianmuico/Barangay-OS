import { ipcMain } from 'electron';
import http from 'http';
import os from 'os';
import { createExpressApp } from '../server/index';
import { getSetting } from '../database/queries/settings';
import { logAudit } from '../database/queries/audit';
import { getCurrentSessionUser } from './auth';

let httpServer: http.Server | null = null;

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export function registerServerHandlers(): void {
  ipcMain.handle('server:start', async (_event, port: number) => {
    if (httpServer) {
      return { success: false, error: 'Server is already running' };
    }

    try {
      const app = createExpressApp();
      const serverPort = port || parseInt(getSetting('api_port') || '3001', 10);

      return new Promise((resolve) => {
        httpServer = app.listen(serverPort, '0.0.0.0', () => {
          const localIP = getLocalIP();
          const user = getCurrentSessionUser();
          logAudit(user?.id || null, 'SERVER_STARTED', `API server started on ${localIP}:${serverPort}`);
          resolve({
            success: true,
            address: localIP,
            port: serverPort,
            url: `http://${localIP}:${serverPort}`,
          });
        });

        httpServer.on('error', (err: any) => {
          httpServer = null;
          resolve({ success: false, error: err.message });
        });
      });
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:stop', async () => {
    if (!httpServer) {
      return { success: false, error: 'Server is not running' };
    }

    return new Promise((resolve) => {
      httpServer!.close(() => {
        httpServer = null;
        const user = getCurrentSessionUser();
        logAudit(user?.id || null, 'SERVER_STOPPED', 'API server stopped');
        resolve({ success: true });
      });
    });
  });

  ipcMain.handle('server:status', async () => {
    if (!httpServer) {
      return { running: false };
    }

    const addr = httpServer.address() as any;
    return {
      running: true,
      address: getLocalIP(),
      port: addr?.port,
      url: `http://${getLocalIP()}:${addr?.port}`,
    };
  });
}
