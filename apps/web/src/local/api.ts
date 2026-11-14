import type { components } from './api-types';
import type { ImportManifest } from './importPayload';

type S = components['schemas'];
export type SessionRow = S['SessionRow'];
export type SessionDetail = S['SessionDetail'];
export type ImportRow = S['ImportRow'];
export type ShotOut = S['ShotOut'];
export type SessionIn = S['SessionIn'];
export type SessionPatch = S['SessionPatch'];
export type ExclusionsIn = S['ExclusionsIn'];
export type ExclusionsOut = S['ExclusionsOut'];
export type CheckResponse = S['CheckResponse'];
export type ImportResponse = S['ImportResponse'];
export type LibraryShot = S['LibraryShot'];
export type ShotDetail = S['ShotDetail'];
export type TargetRange = S['TargetRangeOut'];
export type TargetRangeIn = S['TargetRangeIn'];

export const UNAUTHORISED_EVENT = 'mygolfviz:unauthorised';

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function detailOf(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (d !== undefined) return JSON.stringify(d);
  return fallback;
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: 'same-origin' });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORISED_EVENT));
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, detailOf(body, res.statusText || `HTTP ${res.status}`));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  return send<T>(path, {
    ...init,
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

const enc = encodeURIComponent;

export const listSessions = () => request<SessionRow[]>('GET', '/api/v1/sessions');
export const createSession = (body: SessionIn) => request<SessionRow>('POST', '/api/v1/sessions', body);
export const getSession = (id: string) => request<SessionDetail>('GET', `/api/v1/sessions/${enc(id)}`);
/** `keepalive` lets the request outlive the page (pagehide, tab hidden). */
export const patchSession = (id: string, body: SessionPatch, opts?: { keepalive?: boolean }) =>
  request<SessionRow>('PATCH', `/api/v1/sessions/${enc(id)}`, body, opts?.keepalive ? { keepalive: true } : {});
export const deleteSession = (id: string) => request<void>('DELETE', `/api/v1/sessions/${enc(id)}`);
export const getShots = (id: string) => request<ShotOut[]>('GET', `/api/v1/sessions/${enc(id)}/shots`);
export const reorderImports = (id: string, importIds: string[]) =>
  request<ImportRow[]>('PATCH', `/api/v1/sessions/${enc(id)}/imports/order`, { importIds });
export const renameImport = (importId: string, displayName: string | null) =>
  request<ImportRow>('PATCH', `/api/v1/imports/${enc(importId)}`, { displayName });
export const deleteImport = (importId: string) => request<void>('DELETE', `/api/v1/imports/${enc(importId)}`);
export const originalUrl = (importId: string) => `/api/v1/imports/${enc(importId)}/original`;
export const patchExclusions = (id: string, body: ExclusionsIn) =>
  request<ExclusionsOut>('PATCH', `/api/v1/sessions/${enc(id)}/exclusions`, body);
export const checkImports = (sha256S: string[], sessionId?: string | null) =>
  request<CheckResponse>('POST', '/api/v1/imports/check', { sha256S, sessionId: sessionId ?? null });

export function commitImport(manifest: ImportManifest, files: { field: string; file: Blob; name: string }[]): Promise<ImportResponse> {
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  for (const f of files) form.append(f.field, f.file, f.name);
  return send<ImportResponse>('/api/v1/imports', { method: 'POST', body: form });
}

/** Session ids per `GET /shots`: 200 ids of about 49 bytes each stay well under the server's 16 KB request head. */
const SHOTS_IDS_PER_REQUEST = 200;

function fetchLibraryShots(club: string | undefined, sessionIds: readonly string[]): Promise<LibraryShot[]> {
  const q = new URLSearchParams();
  if (club) q.set('club', club);
  for (const id of sessionIds) q.append('session_ids', id);
  const qs = q.toString();
  return request<LibraryShot[]>('GET', `/api/v1/shots${qs ? `?${qs}` : ''}`);
}

/**
 * Shots of the club (or every club) in the sessions (or every session). A long session list goes out over
 * several requests; the answers join in the order of `sessionIds`, which callers give in session order.
 */
export async function listLibraryShots(opts: { club?: string; sessionIds?: string[] } = {}): Promise<LibraryShot[]> {
  const ids = opts.sessionIds ?? [];
  if (ids.length <= SHOTS_IDS_PER_REQUEST) return fetchLibraryShots(opts.club, ids);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += SHOTS_IDS_PER_REQUEST) chunks.push(ids.slice(i, i + SHOTS_IDS_PER_REQUEST));
  return (await Promise.all(chunks.map((chunk) => fetchLibraryShots(opts.club, chunk)))).flat();
}

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    return (await request<{ value: T }>('GET', `/api/v1/settings/${enc(key)}`)).value;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function getShot(id: string): Promise<ShotDetail | null> {
  try {
    return await request<ShotDetail>('GET', `/api/v1/shots/${enc(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await request('PUT', `/api/v1/settings/${enc(key)}`, { value });
}

export function listTargetRanges(club?: string): Promise<TargetRange[]> {
  const qs = club ? `?${new URLSearchParams({ club })}` : '';
  return request<TargetRange[]>('GET', `/api/v1/target-ranges${qs}`);
}
export const putTargetRange = (body: TargetRangeIn) => request<TargetRange>('PUT', '/api/v1/target-ranges', body);
export const deleteTargetRange = (id: string) => request<void>('DELETE', `/api/v1/target-ranges/${enc(id)}`);
