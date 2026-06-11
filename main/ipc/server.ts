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

  // Self-test: call our own API the way an external app would, so the admin
  // can confirm the key and endpoints work without leaving the app.
  ipcMain.handle('server:test', async () => {
    if (!httpServer) return { success: false, error: 'Server is not running' };
    const addr = httpServer.address() as any;
    const apiKey = getSetting('api_key') || '';

    const get = (path: string): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const req = http.get(
          { host: '127.0.0.1', port: addr?.port, path, headers: { 'X-API-Key': apiKey }, timeout: 5000 },
          (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode || 0, body }));
          }
        );
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      });

    try {
      const health = await get('/api/health');
      const stats = await get('/api/stats');
      if (health.status !== 200) return { success: false, error: `Health check failed (HTTP ${health.status})` };
      if (stats.status !== 200) return { success: false, error: `Authenticated request failed (HTTP ${stats.status}) — check the API key` };
      return { success: true, health: JSON.parse(health.body), stats: JSON.parse(stats.body) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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
