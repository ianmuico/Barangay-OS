import { app } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

// Internet access via a Cloudflare "quick tunnel" (TryCloudflare).
// Free, no account, no port forwarding: we run the cloudflared helper which
// opens an outbound connection to Cloudflare and hands back a public
// https://<random>.trycloudflare.com URL that forwards to the local API.
// The URL changes every time the tunnel starts — the UI makes that clear.
//
// The cloudflared binary (~40 MB) is downloaded once into userData on first
// use, so it doesn't bloat the installer and survives app updates.

export interface TunnelState {
  status: 'stopped' | 'downloading' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
}

let child: ChildProcess | null = null;
let state: TunnelState = { status: 'stopped', url: null, error: null };

export function getTunnelState(): TunnelState {
  return { ...state };
}

function binDir(): string {
  return path.join(app.getPath('userData'), 'bin');
}

function managedBinPath(): string {
  return path.join(binDir(), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}

// cloudflared already on PATH (e.g. brew install on dev machines)?
function pathBin(): string | null {
  try {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
    const found = probe.stdout?.split(/\r?\n/).find(Boolean);
    return probe.status === 0 && found ? found.trim() : null;
  } catch {
    return null;
  }
}

function downloadUrl(): { url: string; tgz: boolean } {
  const base = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
  if (process.platform === 'win32') return { url: `${base}/cloudflared-windows-amd64.exe`, tgz: false };
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    return { url: `${base}/cloudflared-darwin-${arch}.tgz`, tgz: true };
  }
  return { url: `${base}/cloudflared-linux-${process.arch === 'arm64' ? 'arm64' : 'amd64'}`, tgz: false };
}

async function ensureBinary(): Promise<string> {
  const managed = managedBinPath();
  if (fs.existsSync(managed)) return managed;
  const onPath = pathBin();
  if (onPath) return onPath;

  state = { status: 'downloading', url: null, error: null };
  const { url, tgz } = downloadUrl();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}). Check the internet connection.`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(binDir(), { recursive: true });

  if (tgz) {
    // macOS releases ship as .tgz — extract with the system tar
    const tgzPath = path.join(binDir(), 'cloudflared.tgz');
    fs.writeFileSync(tgzPath, buf);
    const tar = spawnSync('tar', ['-xzf', tgzPath, '-C', binDir()], { encoding: 'utf8' });
    fs.rmSync(tgzPath, { force: true });
    if (tar.status !== 0) throw new Error('Could not extract cloudflared.');
  } else {
    fs.writeFileSync(managed, buf);
  }
  if (process.platform !== 'win32') fs.chmodSync(managed, 0o755);
  return managed;
}

export async function startTunnel(port: number): Promise<TunnelState> {
  if (child) return getTunnelState();
  try {
    const bin = await ensureBinary();
    state = { status: 'starting', url: null, error: null };

    return await new Promise<TunnelState>((resolve) => {
      const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child = proc;

      let settled = false;
      const settle = (s: TunnelState) => {
        if (!settled) { settled = true; resolve(s); }
      };

      const timeout = setTimeout(() => {
        if (state.status === 'starting') {
          state = { status: 'error', url: null, error: 'Timed out waiting for the tunnel URL.' };
          try { proc.kill(); } catch {}
          child = null;
          settle(getTunnelState());
        }
      }, 45_000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && state.status === 'starting') {
          clearTimeout(timeout);
          state = { status: 'running', url: m[0], error: null };
          settle(getTunnelState());
        }
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData); // cloudflared logs the URL to stderr

      proc.on('error', (err) => {
        clearTimeout(timeout);
        child = null;
        state = { status: 'error', url: null, error: err.message };
        settle(getTunnelState());
      });
      proc.on('exit', () => {
        clearTimeout(timeout);
        child = null;
        if (state.status === 'running' || state.status === 'starting') {
          state = { status: 'stopped', url: null, error: state.status === 'starting' ? 'cloudflared exited unexpectedly.' : null };
        }
        settle(getTunnelState());
      });
    });
  } catch (err: any) {
    state = { status: 'error', url: null, error: err?.message || 'Failed to start the tunnel.' };
    return getTunnelState();
  }
}

export function stopTunnel(): TunnelState {
  if (child) {
    try { child.kill(); } catch {}
    child = null;
  }
  state = { status: 'stopped', url: null, error: null };
  return getTunnelState();
}
