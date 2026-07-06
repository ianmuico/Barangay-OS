import type { AppUser, Resident, ResidentList } from './types';

// Thin REST client for the desktop's Online Mode API.
//  - X-API-Key:   the per-device key (server-level access)
//  - X-User-Token: the logged-in user's session (permissions)
export class ApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// The app can know TWO addresses for the same server: the office Wi-Fi URL and
// an optional internet (tunnel) URL. Requests try the last-known-working one
// first and silently fail over to the other, so the app works on the office
// Wi-Fi and from anywhere without the user switching anything.
let urls: string[] = [];
let activeIdx = 0;
let deviceKey = '';
let userToken = '';

const clean = (u: string) => u.replace(/\/+$/, '');

export function configure(opts: { baseUrl?: string; webUrl?: string | null; deviceKey?: string; userToken?: string | null }) {
  if (opts.baseUrl !== undefined || opts.webUrl !== undefined) {
    const next = [opts.baseUrl, opts.webUrl].filter((u): u is string => !!u && !!u.trim()).map(clean);
    urls = next;
    activeIdx = 0;
  }
  if (opts.deviceKey !== undefined) deviceKey = opts.deviceKey;
  if (opts.userToken !== undefined) userToken = opts.userToken || '';
}

// Which address is currently being used (for display in Account)
export function getActiveUrl(): string {
  return urls[activeIdx] || '';
}

async function attempt<T>(base: string, method: string, path: string, body: any, auth: boolean, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
      if (deviceKey) headers['X-API-Key'] = deviceKey;
      if (userToken) headers['X-User-Token'] = userToken;
    }
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new ApiError(json?.error || `Request failed (${res.status})`, res.status, json);
    }
    return json as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') throw new ApiError('The server took too long to respond.', 0);
    throw new ApiError('Could not reach the barangay server.', 0);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(method: string, path: string, body?: any, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const { auth = true, timeoutMs = 12000 } = opts;
  if (!urls.length) throw new ApiError('Not connected to a server.', 0);
  // With a fallback available, give each attempt a shorter window
  const perAttempt = urls.length > 1 ? Math.min(timeoutMs, 6000) : timeoutMs;

  let lastErr: ApiError | null = null;
  for (let i = 0; i < urls.length; i++) {
    const idx = (activeIdx + i) % urls.length;
    try {
      const result = await attempt<T>(urls[idx], method, path, body, auth, perAttempt);
      activeIdx = idx; // remember what worked
      return result;
    } catch (err: any) {
      // Only network-level failures (status 0) justify trying the other URL —
      // an HTTP error (401/403/409/...) is a real answer from the server.
      if (err instanceof ApiError && err.status === 0) { lastErr = err; continue; }
      throw err;
    }
  }
  throw new ApiError('Could not reach the barangay server on Wi-Fi or the internet. Check that the office server is on.', 0, lastErr?.body);
}

export const api = {
  // Health check against an explicit url (used during setup before the
  // connection is persisted). No key required.
  healthAt: async (url: string) => {
    const clean = url.replace(/\/+$/, '');
    const res = await fetch(`${clean}/api/health`, { method: 'GET' });
    if (!res.ok) throw new ApiError(`Server responded ${res.status}`, res.status);
    return res.json() as Promise<{ status: string; barangay: string; version: string }>;
  },

  login: (username: string, password: string) =>
    request<{ token: string; user: AppUser }>('POST', '/api/app/login', { username, password }),

  me: () => request<{ user: AppUser }>('GET', '/api/app/me'),

  logout: () => request<{ success: boolean }>('POST', '/api/app/logout').catch(() => ({ success: true })),

  listResidents: (params: { search?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    q.set('page', String(params.page || 1));
    q.set('limit', String(params.limit || 30));
    return request<ResidentList>('GET', `/api/residents?${q.toString()}`);
  },

  getResident: (id: number) => request<Resident>('GET', `/api/residents/${id}`),
  getResidentByUid: (uid: string) => request<Resident>('GET', `/api/residents/by-uid/${encodeURIComponent(uid)}`),

  createResident: (data: Partial<Resident> & { force?: boolean }) =>
    request<Resident>('POST', '/api/residents', data),

  updateResident: (id: number, data: Partial<Resident>) =>
    request<Resident>('PUT', `/api/residents/${id}`, data),

  deleteResident: (id: number) =>
    request<{ success: boolean }>('DELETE', `/api/residents/${id}`),

  presence: (input: { entity: string; id: string; action: string; sessionId: string; label?: string }) =>
    request<{ others: { who: string; action: string }[] }>('POST', '/api/presence', input).catch(() => ({ others: [] })),
};
