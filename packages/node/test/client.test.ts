import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AuthorizationDeniedError,
  createSsoClient,
  InvalidTokenError,
  issuerFor,
  StateMismatchError,
  type SsoClient,
} from '../src/index.js';
import { authorize, startFakeProvider, type FakeProvider } from './fake-provider.js';

let provider: FakeProvider;
const redirectUri = 'http://app.test/sso/callback';

const makeClient = (): SsoClient =>
  createSsoClient({
    issuer: provider.issuer,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    redirectUri,
    postLogoutRedirectUri: 'http://app.test/',
    allowInsecureRequests: true,
  });

beforeAll(async () => {
  provider = await startFakeProvider();
});

afterAll(() => provider.close());

afterEach(() => {
  provider.idTokenOverrides = {};
  vi.useRealTimers();
});

describe('issuerFor', () => {
  it('builds the realm issuer', () => {
    expect(issuerFor('internal')).toBe('https://sso.gorontalokota.go.id/internal');
    expect(issuerFor('external', 'http://sso.test/')).toBe('http://sso.test/external');
  });
});

describe('authorization code flow', () => {
  it('builds an authorization URL with PKCE S256, state and nonce', async () => {
    const request = await makeClient().createAuthorizationRequest();
    const url = new URL(request.url);

    expect(url.origin + url.pathname).toBe(`${provider.issuer}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(provider.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(request.codeVerifier).digest('base64url'));
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(url.searchParams.get('nonce')).toBe(request.nonce);
    expect(request.state).not.toBe(request.nonce);
  });

  it('exchanges the code and validates the ID token', async () => {
    const client = makeClient();
    const pending = await client.createAuthorizationRequest();
    const tokens = await client.handleCallback(await authorize(pending.url), pending);

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(tokens.claims).toMatchObject({ sub: provider.subject, nonce: pending.nonce, sid: provider.sessionId, nip: '198001012005011001' });
  });

  it('rejects a callback whose state does not match', async () => {
    const client = makeClient();
    const pending = await client.createAuthorizationRequest();
    const callback = await authorize(pending.url);

    await expect(client.handleCallback(callback, { ...pending, state: 'another-state' })).rejects.toBeInstanceOf(StateMismatchError);
  });

  it('maps error=access_denied to AuthorizationDeniedError', async () => {
    const client = makeClient();
    const pending = await client.createAuthorizationRequest({ loginHint: 'deny' });

    await expect(client.handleCallback(await authorize(pending.url), pending)).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it.each([
    ['nonce', { nonce: 'attacker-nonce' }],
    ['audience', { aud: 'another-client' }],
  ])('rejects an ID token with a wrong %s', async (_label, overrides) => {
    const client = makeClient();
    const pending = await client.createAuthorizationRequest();
    const callback = await authorize(pending.url);
    provider.idTokenOverrides = overrides;

    await expect(client.handleCallback(callback, pending)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('picks up a rotated signing key (new kid) for ID tokens and access tokens', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const client = makeClient();
    const first = await client.createAuthorizationRequest();
    await client.handleCallback(await authorize(first.url), first);
    await client.verifyAccessToken(await provider.accessToken());
    const requestsBefore = provider.jwksRequests;

    await provider.rotateKey({ dropOld: true });
    vi.setSystemTime(Date.now() + 61_000);

    const second = await client.createAuthorizationRequest();
    const tokens = await client.handleCallback(await authorize(second.url), second);
    const claims = await client.verifyAccessToken(await provider.accessToken());

    expect(tokens.claims?.sub).toBe(provider.subject);
    expect(claims.sub).toBe(provider.subject);
    expect(provider.jwksRequests).toBeGreaterThan(requestsBefore);
  });
});

describe('client authentication', () => {
  it('works with client_secret_basic against a server that does not URL-decode Basic credentials', async () => {
    const client = createSsoClient({ ...makeClient().config, tokenEndpointAuthMethod: 'client_secret_basic' });
    const pending = await client.createAuthorizationRequest();

    await expect(client.handleCallback(await authorize(pending.url), pending)).resolves.toHaveProperty('accessToken');
  });
});

describe('other endpoints', () => {
  it('refreshes, fetches userinfo, revokes and builds the end-session URL', async () => {
    const client = makeClient();
    const pending = await client.createAuthorizationRequest();
    const tokens = await client.handleCallback(await authorize(pending.url), pending);

    const refreshed = await client.refresh(tokens.refreshToken!);
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);

    expect(await client.userinfo(refreshed.accessToken, provider.subject)).toMatchObject({ sub: provider.subject, organization_code: '1.01' });

    await client.revoke(refreshed.refreshToken!, 'refresh_token');
    expect(provider.revoked).toContain(refreshed.refreshToken);

    const logout = new URL(await client.logoutUrl({ idTokenHint: tokens.idToken, state: 'xyz' }));
    expect(logout.origin + logout.pathname).toBe(`${provider.issuer}/logout`);
    expect(logout.searchParams.get('id_token_hint')).toBe(tokens.idToken);
    expect(logout.searchParams.get('post_logout_redirect_uri')).toBe('http://app.test/');
    expect(logout.searchParams.get('state')).toBe('xyz');
  });
});
