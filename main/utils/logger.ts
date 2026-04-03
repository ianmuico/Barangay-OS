import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_AGE_DAYS = 7;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

export function logInfo(message: string): void {
  writeLog('INFO', message);
}

export function logError(message: string, error?: unknown): void {
  const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : error ? String(error) : '';
  writeLog('ERROR', errStr ? `${message}: ${errStr}` : message);
}

export function logWarn(message: string): void {
  writeLog('WARN', message);
}

function writeLog(level: string, message: string): void {
  try {
    ensureLogDir();
    const line = `[${getTimestamp()}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
    // Also log to console
    if (level === 'ERROR') console.error(line.trim());
    else console.log(line.trim());
  } catch (err) {
    // Logging should never crash the app — fallback to console
    console.error('[logger] Failed to write log:', err);
  }
}

// Rotate logs: remove entries older than MAX_LOG_AGE_DAYS
export function rotateLogs(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_LOG_AGE_DAYS);

    const kept = lines.filter(line => {
      const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (!match) return true; // Keep lines without timestamps
      return new Date(match[1]) >= cutoff;
    });

    fs.writeFileSync(LOG_FILE, kept.join('\n'));
  } catch {
    // Non-fatal
  }
}

// Get the log file path for export
export function getLogFilePath(): string {
  return LOG_FILE;
}

// Check available disk space (approximate)
export function checkDiskSpace(): { available: boolean; path: string } {
  const dbPath = path.join(app.getPath('userData'), 'barangay.db');
  try {
    // Try to write a small test file
    const testPath = path.join(app.getPath('userData'), '.space_check');
    fs.writeFileSync(testPath, 'test');
    fs.unlinkSync(testPath);
    return { available: true, path: dbPath };
  } catch {
    return { available: false, path: dbPath };
  }
}

// Initialize logging - call on app startup
export function initLogger(): void {
  ensureLogDir();
  rotateLogs();
  logInfo('Application started');
}
