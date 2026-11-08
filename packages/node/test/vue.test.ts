import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSso } from '../src/vue.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubBrowser() {
  const assign = vi.fn();
  const submitted: { action: string; method: string; fields: Record<string, string> }[] = [];
  vi.stubGlobal('window', { location: { pathname: '/laporan', search: '?tahun=2026', hash: '', assign } });
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      const element: Record<string, unknown> = { tag, style: {}, children: [] as Record<string, unknown>[] };
      element.appendChild = (child: Record<string, unknown>) => (element.children as unknown[]).push(child);
      element.submit = () =>
        submitted.push({
          action: element.action as string,
          method: element.method as string,
          fields: Object.fromEntries((element.children as Record<string, string>[]).map((c) => [c.name, c.value])),
        });

      return element;
    },
    body: { appendChild: () => undefined },
  });

  return { assign, submitted };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSso', () => {
  it('loads the user from the BFF with credentials', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, { user: { sub: '1', name: 'Budi', raw: {} } }));
    const sso = useSso({ baseUrl: '/auth/', fetch, immediate: false });

    expect(sso.isAuthenticated.value).toBe(false);
    await sso.refresh();

    expect(fetch).toHaveBeenCalledWith('/auth/user', expect.objectContaining({ credentials: 'include' }));
    expect(sso.user.value?.name).toBe('Budi');
    expect(sso.isAuthenticated.value).toBe(true);
    expect(sso.loading.value).toBe(false);
  });

  it('treats 401 as anonymous and other failures as errors', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse(401, { user: null })).mockResolvedValueOnce(jsonResponse(500, {}));
    const sso = useSso({ fetch, immediate: false });

    await sso.refresh();
    expect(sso.user.value).toBeNull();
    expect(sso.error.value).toBeNull();

    await sso.refresh();
    expect(sso.error.value).toBeInstanceOf(Error);
  });

  it('redirects to the BFF login with returnTo', () => {
    const { assign } = stubBrowser();
    const sso = useSso({ fetch: vi.fn(async () => jsonResponse(401, {})), immediate: false });

    sso.login();
    expect(assign).toHaveBeenLastCalledWith('/sso/login?returnTo=%2Flaporan%3Ftahun%3D2026');
  });

  it('logs out with a form POST carrying the CSRF field', async () => {
    const { submitted } = stubBrowser();
    const sso = useSso({ fetch: vi.fn(), immediate: false, csrfToken: () => 'tok', csrfFieldName: '_token' });

    await sso.logout();
    expect(submitted).toEqual([{ action: '/sso/logout', method: 'POST', fields: { _token: 'tok' } }]);
  });

  it('logs out with fetch + CSRF header and follows redirectTo', async () => {
    const { assign } = stubBrowser();
    const fetch = vi.fn(async () => jsonResponse(200, { redirectTo: 'https://sso.gorontalokota.go.id/internal/logout?x=1' }));
    const sso = useSso({ fetch, immediate: false, csrfToken: 'tok', csrfHeaderName: 'X-CSRF-Token' });

    await sso.logout();
    expect(fetch).toHaveBeenCalledWith('/sso/logout', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'tok' }) }));
    expect(assign).toHaveBeenCalledWith('https://sso.gorontalokota.go.id/internal/logout?x=1');
  });
});
