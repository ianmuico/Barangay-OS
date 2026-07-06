#!/usr/bin/env node
/* eslint-disable */
// Dev launcher: picks a FREE port for the Next.js dev server (so a leftover
// process never causes EADDRINUSE), waits until it's up, compiles the Electron
// main process, then launches Electron pointed at that port.
//
// Replaces the old "concurrently + wait-on http://localhost:3000" which hard-
// coded port 3000 and crashed if anything was already using it.
const net = require('net');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RENDERER = path.join(ROOT, 'renderer');
const API_PORT = 3001; // reserved for Online Mode — never use it for the dev server

function canBind(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function findFreePort() {
  const candidates = [3000];
  for (let p = 3010; p <= 3050; p++) candidates.push(p);
  for (const port of candidates) {
    if (port === API_PORT) continue;
    if (await canBind(port)) return port;
  }
  throw new Error('No free port found in 3000–3050');
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve(); // any HTTP response means Next is listening
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Next dev server did not start in time'));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

async function main() {
  const port = await findFreePort();
  const url = `http://localhost:${port}`;
  console.log(`\n[dev] Using free port ${port} for the Next.js dev server\n`);

  // 1. Start Next dev on the chosen port
  const next = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: RENDERER, stdio: 'inherit', shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  let electron = null;
  const shutdown = (code) => {
    try { next.kill(); } catch {}
    try { electron && electron.kill(); } catch {}
    process.exit(code ?? 0);
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  next.on('exit', (code) => { if (electron === null) shutdown(code ?? 1); });

  // 2. Wait for it, compile main, then launch Electron pointed at the port
  try {
    await waitForServer(url);
  } catch (err) {
    console.error(`[dev] ${err.message}`);
    return shutdown(1);
  }

  console.log('[dev] Compiling Electron main process...');
  const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.main.json'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (tsc.status !== 0) return shutdown(tsc.status || 1);

  console.log(`[dev] Launching Electron → ${url}\n`);
  electron = spawn('npx', ['electron', '.'], {
    cwd: ROOT, stdio: 'inherit', shell: true,
    env: { ...process.env, NODE_ENV: 'development', NEXT_DEV_URL: url },
  });
  electron.on('exit', (code) => shutdown(code ?? 0)); // closing the app stops the dev server
}

main().catch((err) => { console.error(err); process.exit(1); });
