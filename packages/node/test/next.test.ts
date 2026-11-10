import type { OIDCConfig } from '@auth/core/providers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSsoClient, MemoryLogoutRegistry, type SsoClient } from '../src/index.js';
import { createBackchannelLogoutHandler, GorontalokotaSso, isSessionEnded } from '../src/next.js';
import { startFakeProvider, type FakeProvider } from './fake-provider.js';

let provider: FakeProvider;
let client: SsoClient;

beforeAll(async () => {
  provider = await startFakeProvider();
  client = createSsoClient({ issuer: provider.issuer, clientId: provider.clientId, allowInsecureRequests: true });
});

afterAll(() => provider.close());

describe('GorontalokotaSso (Auth.js provider)', () => {
  it('returns an OIDC provider config compatible with Auth.js', () => {
    const config: OIDCConfig<Record<string, unknown>> = GorontalokotaSso({
      realm: 'external',
      clientId: 'external-abc',
      clientSecret: 'secret',
      scopes: ['openid', 'profile', 'verification'],
    });

    expect(config).toMatchObject({
      type: 'oidc',
      issuer: 'https://sso.gorontalokota.go.id/external',
      checks: ['pkce', 'state', 'nonce'],
      authorization: { params: { scope: 'openid profile verification' } },
      client: { token_endpoint_auth_method: 'client_secret_post' },
    });
    expect(GorontalokotaSso({ realm: 'internal', clientId: 'public' }).client).toEqual({ token_endpoint_auth_method: 'none' });
  });

  it('maps the profile with id = sub', () => {
    const user = GorontalokotaSso({ realm: 'external', clientId: 'c' }).profile({
      iss: 'https://sso.gorontalokota.go.id/external',
      sub: 'warga-1',
      name: 'Siti',
      verification_level: 'L2',
    });

    expect(user).toMatchObject({ id: 'warga-1', sub: 'warga-1', name: 'Siti', email: null, verificationLevel: 'L2', realm: 'external' });
  });
});

describe('createBackchannelLogoutHandler', () => {
  const post = (body: Record<string, string>) =>
    new Request('http://app.test/api/sso/backchannel-logout', { method: 'POST', body: new URLSearchParams(body) });

  it('records valid logout tokens and rejects invalid ones', async () => {
    const registry = new MemoryLogoutRegistry();
    const POST = createBackchannelLogoutHandler({ client, registry });

    const ok = await POST(post({ logout_token: await provider.logoutToken() }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await isSessionEnded(registry, { sub: provider.subject, sid: provider.sessionId, authenticatedAt: 1 })).toBe(true);

    const bad = await POST(post({ logout_token: await provider.logoutToken({ events: undefined }) }));
    expect(bad.status).toBe(400);
    expect(bad.headers.get('cache-control')).toBe('no-store');
  });
});
