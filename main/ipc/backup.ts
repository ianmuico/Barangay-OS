import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDatabasePath, closeDatabase, initDatabase, getDb } from '../database/connection';
import { logAudit } from '../database/queries/audit';
import { getCurrentSessionUser } from './auth';

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:create', async () => {
    try {
      const dbPath = getDatabasePath();

      // Checkpoint WAL to ensure all data is in the main file
      const db = getDb();
      db.pragma('wal_checkpoint(TRUNCATE)');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultName = `barangay-backup-${timestamp}.db`;

      const result = await dialog.showSaveDialog({
        title: 'Backup Database',
        defaultPath: defaultName,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Backup cancelled' };
      }

      fs.copyFileSync(dbPath, result.filePath);

      const user = getCurrentSessionUser();
      logAudit(user?.id || null, 'BACKUP_CREATED', `Database backed up to: ${result.filePath}`);

      return { success: true, path: result.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('backup:restore', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Restore Database',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Restore cancelled' };
      }

      const sourcePath = result.filePaths[0];
      const dbPath = getDatabasePath();

      // Validate the backup file by trying to open it
      const Database = require('better-sqlite3');
      const testDb = new Database(sourcePath, { readonly: true });
      const tables = testDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as { name: string }[];
      testDb.close();

      const requiredTables = ['users', 'residents', 'settings'];
      const tableNames = tables.map((t: any) => t.name);
      const missing = requiredTables.filter(t => !tableNames.includes(t));

      if (missing.length > 0) {
        return { success: false, error: `Invalid backup file. Missing tables: ${missing.join(', ')}` };
      }

      // Close current DB, replace, and reopen
      closeDatabase();
      fs.copyFileSync(sourcePath, dbPath);
      initDatabase();

      const user = getCurrentSessionUser();
      logAudit(user?.id || null, 'BACKUP_RESTORED', `Database restored from: ${sourcePath}`);

      return { success: true };
    } catch (error: any) {
      // Try to reinitialize if something went wrong
      try { initDatabase(); } catch (e) {}
      return { success: false, error: error.message };
    }
  });
}
