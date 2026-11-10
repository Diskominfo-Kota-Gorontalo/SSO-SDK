import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSsoRouter, requireToken, safeReturnTo, type SsoRouter } from '../src/express.js';
import { createSsoClient, MemoryLogoutRegistry, type SsoClient } from '../src/index.js';
import { authorize, startFakeProvider, type FakeProvider } from './fake-provider.js';

let provider: FakeProvider;
let client: SsoClient;
let app: express.Express;
let sso: SsoRouter;

beforeAll(async () => {
  provider = await startFakeProvider();
  client = createSsoClient({
    issuer: provider.issuer,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    redirectUri: 'http://app.test/sso/callback',
    postLogoutRedirectUri: 'http://app.test/',
    scopes: ['openid', 'profile', 'email', 'employee'],
    allowInsecureRequests: true,
  });
});

afterAll(() => provider.close());

beforeEach(() => {
  app = express();
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  sso = createSsoRouter({ client, registry: new MemoryLogoutRegistry() });
  app.use('/sso', sso);
  app.get('/dashboard', sso.requireAuth, (req, res) => {
    res.json({ name: req.ssoUser?.name });
  });
  app.get('/api/pegawai', requireToken({ client, scopes: ['employee'] }), (req, res) => {
    res.json({ sub: req.sso?.sub });
  });
});

/** Runs the full login through the fake provider and returns the agent plus where the app redirected to. */
async function login(returnTo?: string) {
  const agent = request.agent(app);
  const start = await agent.get('/sso/login').query(returnTo === undefined ? {} : { returnTo });
  expect(start.status).toBe(302);
  const callback = new URL(await authorize(start.headers.location!));
  const done = await agent.get(callback.pathname + callback.search);

  return { agent, done };
}

describe('safeReturnTo', () => {
  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'dashboard', '/a\nb'])(
    'rejects %s',
    (value) => {
      expect(safeReturnTo(value)).toBeUndefined();
    },
  );

  it('keeps same-origin relative paths', () => {
    expect(safeReturnTo('/laporan?tahun=2026#ringkasan')).toBe('/laporan?tahun=2026#ringkasan');
  });
});

describe('createSsoRouter', () => {
  it('returns 401 from /user when anonymous', async () => {
    const response = await request(app).get('/sso/user');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ user: null });
  });

  it('logs in, redirects to a safe returnTo and exposes the user', async () => {
    const { agent, done } = await login('/laporan?tahun=2026');

    expect(done.status).toBe(302);
    expect(done.headers.location).toBe('/laporan?tahun=2026');

    const user = await agent.get('/sso/user');
    expect(user.status).toBe(200);
    expect(user.body.user).toMatchObject({ sub: provider.subject, nip: '198001012005011001', realm: 'internal' });
    expect(JSON.stringify(user.body)).not.toContain('accessToken');
  });

  it('ignores an open-redirect returnTo', async () => {
    const { done } = await login('https://evil.example/phish');

    expect(done.status).toBe(302);
    expect(done.headers.location).toBe('/');
  });

  it('rejects a callback without a pending login', async () => {
    const response = await request(app).get('/sso/callback?code=x&state=y');

    expect(response.status).toBe(400);
  });

  it('protects pages with requireAuth', async () => {
    const page = await request(app).get('/dashboard');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/sso/login?returnTo=%2Fdashboard');

    const xhr = await request(app).get('/dashboard').set('Accept', 'application/json');
    expect(xhr.status).toBe(401);

    const { agent } = await login('/dashboard');
    expect((await agent.get('/dashboard')).body).toEqual({ name: 'Budi Santoso' });
  });

  it('handles back-channel logout and drops the matching session', async () => {
    const { agent } = await login();
    expect((await agent.get('/sso/user')).status).toBe(200);

    const response = await request(app)
      .post('/sso/backchannel-logout')
      .type('form')
      .send({ logout_token: await provider.logoutToken() });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await agent.get('/sso/user')).status).toBe(401);
  });

  it('answers 400 to an invalid logout token', async () => {
    const response = await request(app)
      .post('/sso/backchannel-logout')
      .type('form')
      .send({ logout_token: await provider.logoutToken({ nonce: 'n' }) });

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await request(app).post('/sso/backchannel-logout').type('form').send({})).status).toBe(400);
  });

  it('logs out locally and redirects to the SSO end-session endpoint', async () => {
    const { agent } = await login();
    const response = await agent.post('/sso/logout');

    expect(response.status).toBe(303);
    const location = new URL(response.headers.location!);
    expect(location.origin + location.pathname).toBe(`${provider.issuer}/logout`);
    expect(location.searchParams.get('id_token_hint')).toBeTruthy();
    expect((await agent.get('/sso/user')).status).toBe(401);

    const json = await (await login()).agent.post('/sso/logout').set('Accept', 'application/json');
    expect(json.body.redirectTo).toContain(`${provider.issuer}/logout`);
  });
});

describe('requireToken', () => {
  it('accepts a bearer token with the required scope', async () => {
    const response = await request(app)
      .get('/api/pegawai')
      .set('Authorization', `Bearer ${await provider.accessToken({ scope: 'openid employee' })}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sub: provider.subject });
  });

  it('rejects missing, invalid and under-scoped tokens', async () => {
    expect((await request(app).get('/api/pegawai')).status).toBe(401);

    const invalid = await request(app).get('/api/pegawai').set('Authorization', `Bearer ${await provider.accessToken({ aud: 'x' })}`);
    expect(invalid.status).toBe(401);
    expect(invalid.headers['www-authenticate']).toContain('invalid_token');

    const scoped = await request(app).get('/api/pegawai').set('Authorization', `Bearer ${await provider.accessToken({ scope: 'openid' })}`);
    expect(scoped.status).toBe(403);
    expect(scoped.headers['www-authenticate']).toContain('insufficient_scope');
  });
});
