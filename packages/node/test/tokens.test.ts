import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSsoClient, InsufficientScopeError, InvalidTokenError, type SsoClient } from '../src/index.js';
import { startFakeProvider, type FakeProvider } from './fake-provider.js';

let provider: FakeProvider;
let client: SsoClient;
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  provider = await startFakeProvider();
  client = createSsoClient({
    issuer: provider.issuer,
    clientId: provider.clientId,
    audiences: [provider.clientId, 'api-kepegawaian'],
    allowInsecureRequests: true,
  });
});

afterAll(() => provider.close());

describe('verifyAccessToken', () => {
  it('accepts a valid access token and parses scopes', async () => {
    const claims = await client.verifyAccessToken(await provider.accessToken({ scope: 'openid employee' }), { requiredScopes: ['employee'] });

    expect(claims).toMatchObject({ sub: provider.subject, client_id: provider.clientId, realm: 'internal', scopes: ['openid', 'employee'] });
  });

  it('accepts any configured audience', async () => {
    await expect(client.verifyAccessToken(await provider.accessToken({ aud: 'api-kepegawaian' }))).resolves.toBeTruthy();
  });

  it.each([
    ['expired', { exp: now() - 120, iat: now() - 1000, nbf: now() - 1000 }, undefined],
    ['wrong audience', { aud: 'someone-else' }, undefined],
    ['wrong issuer', { iss: 'https://evil.example/internal' }, undefined],
    ['wrong typ (ID token used as access token)', {}, { typ: 'JWT' }],
  ])('rejects an %s token', async (_label, overrides, header) => {
    await expect(client.verifyAccessToken(await provider.accessToken(overrides, header))).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('throws InsufficientScopeError when a required scope is missing', async () => {
    const error = await client.verifyAccessToken(await provider.accessToken({ scope: 'openid profile' }), { requiredScopes: ['employee'] }).catch((e) => e);

    expect(error).toBeInstanceOf(InsufficientScopeError);
    expect(error.requiredScopes).toEqual(['employee']);
  });
});

describe('verifyLogoutToken', () => {
  it('accepts a valid logout token', async () => {
    await expect(client.verifyLogoutToken(await provider.logoutToken())).resolves.toMatchObject({ sub: provider.subject, sid: provider.sessionId });
  });

  it('accepts a sub-only logout token (all sessions ended)', async () => {
    await expect(client.verifyLogoutToken(await provider.logoutToken({ sid: undefined }))).resolves.not.toHaveProperty('sid');
  });

  it.each([
    ['contains a nonce', { nonce: 'abc' }, undefined],
    ['has no events claim', { events: undefined }, undefined],
    ['has the wrong event', { events: { 'http://example.com/other': {} } }, undefined],
    ['has neither sub nor sid', { sub: undefined, sid: undefined }, undefined],
    ['is too old', { iat: now() - 3600, exp: now() + 60 }, undefined],
    ['is an access token', {}, { typ: 'at+jwt' }],
    ['targets another client', { aud: 'another-client' }, undefined],
  ])('rejects a logout token that %s', async (_label, overrides, header) => {
    await expect(client.verifyLogoutToken(await provider.logoutToken(overrides, header))).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
