import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, commitImport, getSetting, listLibraryShots, patchSession, request } from './api';
import type { ImportManifest } from './importPayload';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  test('sends JSON with same-origin credentials', async () => {
    const fn = mockFetch(200, { ok: 1 });
    await expect(request('POST', '/api/v1/sessions', { name: 'a' })).resolves.toEqual({ ok: 1 });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/sessions');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe(JSON.stringify({ name: 'a' }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  test('a 422 throws ApiError with status and detail', async () => {
    mockFetch(422, { detail: 'bad name' });
    const err = (await request('POST', '/api/v1/sessions', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.detail).toBe('bad name');
  });

  test('a 401 dispatches mygolfviz:unauthorised', async () => {
    mockFetch(401, { detail: 'no' });
    const seen = vi.fn();
    window.addEventListener('mygolfviz:unauthorised', seen);
    await expect(request('GET', '/api/v1/sessions')).rejects.toBeInstanceOf(ApiError);
    window.removeEventListener('mygolfviz:unauthorised', seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  test('204 resolves undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(request('DELETE', '/api/v1/sessions/x')).resolves.toBeUndefined();
  });
});

describe('patchSession', () => {
  test('keepalive: a same-origin JSON PATCH that survives the page going away', async () => {
    const fn = mockFetch(200, { id: 's1' });
    await patchSession('s 1', { notes: 'n' }, { keepalive: true });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/sessions/s%201');
    expect(init.method).toBe('PATCH');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBe(JSON.stringify({ notes: 'n' }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  test('without options it is an ordinary request', async () => {
    const fn = mockFetch(200, { id: 's1' });
    await patchSession('s1', { notes: 'n' });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBeUndefined();
  });
});

describe('commitImport', () => {
  test('posts FormData with a manifest field and a part per file field', async () => {
    const fn = mockFetch(200, { importIds: [] });
    const manifest = { destination: { sessionId: 's1' }, files: [] } as ImportManifest;
    await commitImport(manifest, [{ field: 'f0', file: new Blob(['abc']), name: 'a.csv' }]);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/imports');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('manifest') as string)).toEqual(manifest);
    expect((form.get('f0') as File).name).toBe('a.csv');
  });
});

describe('library client', () => {
  test('listLibraryShots repeats session_ids and encodes the club', async () => {
    const fn = mockFetch(200, []);
    await listLibraryShots({ club: '7 Iron', sessionIds: ['a', 'b'] });
    const url = new URL((fn.mock.calls[0] as unknown as [string])[0], 'http://x');
    expect(url.pathname).toBe('/api/v1/shots');
    expect(url.searchParams.get('club')).toBe('7 Iron');
    expect(url.searchParams.getAll('session_ids')).toEqual(['a', 'b']);
  });

  test('listLibraryShots splits a long session list over several requests and joins the answers in order', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const fn = vi.fn(async (path: string) => {
      const sent = new URL(path, 'http://x').searchParams.getAll('session_ids');
      return new Response(JSON.stringify(sent.map((id) => ({ id }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fn);
    const shots = await listLibraryShots({ club: 'Driver', sessionIds: ids });
    expect(fn.mock.calls.length).toBeGreaterThan(1);
    for (const [path] of fn.mock.calls as unknown as [string][]) {
      const url = new URL(path, 'http://x');
      expect(url.searchParams.get('club')).toBe('Driver');
      // Well under the server's 16 KB request-head limit.
      expect(path.length).toBeLessThan(12_000);
    }
    expect(shots.map((s) => s.id)).toEqual(ids);
  });

  test('listLibraryShots omits empty params', async () => {
    const fn = mockFetch(200, []);
    await listLibraryShots({});
    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/shots');
  });

  test('getSetting resolves null on 404 and throws ApiError on 500', async () => {
    mockFetch(404, { detail: 'setting not set' });
    await expect(getSetting('progression.layout')).resolves.toBeNull();
    mockFetch(500, { detail: 'boom' });
    await expect(getSetting('progression.layout')).rejects.toBeInstanceOf(ApiError);
  });

  test('getSetting returns the stored value', async () => {
    mockFetch(200, { key: 'k', value: { a: 1 }, updatedAt: 't' });
    await expect(getSetting('k')).resolves.toEqual({ a: 1 });
  });
});
