import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, commitImport, request } from './api';
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
