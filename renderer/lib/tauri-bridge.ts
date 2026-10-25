// Drop-in replacements for Electron's `contextBridge` and `ipcRenderer`,
// backed by Tauri. ./electron-api uses these to rebuild `window.electronAPI`.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type Listener = (event: unknown, ...args: any[]) => void;

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const contextBridge = {
  exposeInMainWorld(key: string, api: unknown): void {
    (window as any)[key] = api;
  },
};

// ─── Printing ───────────────────────────────────────────────────────────────
// Electron printed from a hidden BrowserWindow. Tauri has no equivalent, so the
// backend returns the finished document as `__print_html` and we print it from
// a hidden iframe here (opens the OS print dialog, same as before).

function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
      resolve();
    };
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return cleanup();
      // Small delay to ensure content (images, fonts) is fully rendered
      setTimeout(() => {
        win.addEventListener('afterprint', cleanup, { once: true });
        win.focus();
        win.print();
        // WebKit may not fire afterprint; clean up regardless
        setTimeout(cleanup, 60_000);
      }, 500);
    };
    iframe.srcdoc = html;
  });
}

function unwrapPrint(result: any): any {
  if (result && typeof result === 'object' && typeof result.__print_html === 'string') {
    const { __print_html, ...rest } = result;
    void printHtml(__print_html);
    return rest;
  }
  return result;
}

// ─── Renderer-side shortcuts ────────────────────────────────────────────────
// Electron's main process watched Ctrl/Cmd+G and sent 'shortcut:generate-report';
// with Tauri the renderer sees the key itself.

const localListeners = new Map<string, Set<Listener>>();
let shortcutsBound = false;

function emitLocal(channel: string, ...args: unknown[]) {
  localListeners.get(channel)?.forEach((cb) => cb({}, ...args));
}

function bindShortcuts() {
  if (shortcutsBound || typeof window === 'undefined') return;
  shortcutsBound = true;
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      emitLocal('shortcut:generate-report');
    }
  });
}

// ─── ipcRenderer ────────────────────────────────────────────────────────────

const backendUnlisten = new Map<Listener, Promise<UnlistenFn>>();

export const ipcRenderer = {
  async invoke(channel: string, ...args: unknown[]): Promise<any> {
    try {
      // `undefined` isn't JSON — send null, which the backend treats the same.
      const clean = args.map((a) => (a === undefined ? null : a));
      return unwrapPrint(await invoke('ipc', { channel, args: clean }));
    } catch (e: any) {
      // Same shape as Electron: "Error invoking remote method '<ch>': Error: <msg>"
      throw new Error(typeof e === 'string' ? e : e?.message ?? String(e));
    }
  },

  on(channel: string, listener: Listener): void {
    if (channel.startsWith('shortcut:')) {
      bindShortcuts();
      if (!localListeners.has(channel)) localListeners.set(channel, new Set());
      localListeners.get(channel)!.add(listener);
      return;
    }
    backendUnlisten.set(listener, listen(channel, (ev) => listener({}, ev.payload)));
  },

  removeListener(channel: string, listener: Listener): void {
    if (channel.startsWith('shortcut:')) {
      localListeners.get(channel)?.delete(listener);
      return;
    }
    const un = backendUnlisten.get(listener);
    backendUnlisten.delete(listener);
    un?.then((f) => f());
  },
};
