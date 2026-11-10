import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';

type PrivateKey = CryptoKey;

interface SigningKey {
  kid: string;
  privateKey: PrivateKey;
  publicJwk: JWK;
}

interface IssuedCode {
  nonce: string | undefined;
  codeChallenge: string;
  redirectUri: string;
  scope: string;
  clientId: string;
}

export interface FakeProvider {
  issuer: string;
  clientId: string;
  clientSecret: string;
  subject: string;
  sessionId: string;
  /** Claims merged into the next ID tokens (e.g. `{ nonce: 'evil' }`). */
  idTokenOverrides: Record<string, unknown>;
  /** Extra profile claims put in ID tokens/userinfo. */
  profileClaims: Record<string, unknown>;
  jwksRequests: number;
  revoked: string[];
  rotateKey(options?: { dropOld?: boolean }): Promise<string>;
  activeKid(): string;
  sign(payload: JWTPayload, header?: Record<string, unknown>): Promise<string>;
  accessToken(overrides?: JWTPayload, header?: Record<string, unknown>): Promise<string>;
  logoutToken(overrides?: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

const b64url = (buffer: Buffer): string => buffer.toString('base64url');

async function newKey(kid: string): Promise<SigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };

  return { kid, privateKey, publicJwk };
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Minimal in-process OIDC provider mimicking the Kota Gorontalo SSO (realm `internal`).
 */
export async function startFakeProvider(): Promise<FakeProvider> {
  const keys: SigningKey[] = [await newKey('key-1')];
  let active = keys[0]!;
  const codes = new Map<string, IssuedCode>();
  const refreshTokens = new Set<string>();
  let keyCounter = 1;

  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const issuer = `http://127.0.0.1:${port}/internal`;

  const provider: FakeProvider = {
    issuer,
    clientId: 'internal-abc123def456',
    clientSecret: 'test-secret',
    subject: 'account-123',
    sessionId: 'sso-session-1',
    idTokenOverrides: {},
    profileClaims: {
      name: 'Budi Santoso',
      preferred_username: '198001012005011001',
      email: 'budi@gorontalokota.go.id',
      email_verified: true,
      nip: '198001012005011001',
      organization_code: '1.01',
      organization_name: 'Dinas Pendidikan',
    },
    jwksRequests: 0,
    revoked: [],
    async rotateKey(options = {}) {
      keyCounter += 1;
      const key = await newKey(`key-${keyCounter}`);

      if (options.dropOld) {
        keys.length = 0;
      }

      keys.push(key);
      active = key;

      return key.kid;
    },
    activeKid: () => active.kid,
    async sign(payload, header = {}) {
      return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: active.kid, ...header }).sign(active.privateKey);
    },
    async accessToken(overrides = {}, header = { typ: 'at+jwt' }) {
      const now = Math.floor(Date.now() / 1000);

      return provider.sign(
        {
          iss: issuer,
          aud: provider.clientId,
          jti: randomUUID(),
          sub: provider.subject,
          iat: now,
          nbf: now,
          exp: now + 900,
          client_id: provider.clientId,
          scope: 'openid profile email',
          realm: 'internal',
          sid: provider.sessionId,
          ...overrides,
        },
        header,
      );
    },
    async logoutToken(overrides = {}, header = { typ: 'logout+jwt' }) {
      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        iss: issuer,
        aud: provider.clientId,
        jti: randomUUID(),
        sub: provider.subject,
        sid: provider.sessionId,
        iat: now,
        exp: now + 120,
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        ...overrides,
      };

      for (const [claim, value] of Object.entries(payload)) {
        if (value === undefined) {
          delete payload[claim];
        }
      }

      return provider.sign(payload as JWTPayload, header);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  /** Mirrors league/oauth2-server: Basic credentials are base64-decoded but NOT URL-decoded. */
  const clientAuthenticated = (req: IncomingMessage, body: URLSearchParams): boolean => {
    const header = req.headers.authorization;

    if (header?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');

      return id === provider.clientId && secret === provider.clientSecret;
    }

    return body.get('client_id') === provider.clientId && body.get('client_secret') === provider.clientSecret;
  };

  const issueTokens = async (clientId: string, scope: string, nonce: string | undefined) => {
    const accessToken = await provider.accessToken({ scope });
    const now = Math.floor(Date.now() / 1000);
    const atHash = b64url(createHash('sha256').update(accessToken).digest().subarray(0, 16));
    const idClaims: Record<string, unknown> = {
      iss: issuer,
      aud: clientId,
      sub: provider.subject,
      iat: now,
      exp: now + 300,
      auth_time: now,
      sid: provider.sessionId,
      azp: clientId,
      at_hash: atHash,
      ...provider.profileClaims,
      ...(nonce ? { nonce } : {}),
      ...provider.idTokenOverrides,
    };
    const refreshToken = randomUUID();
    refreshTokens.add(refreshToken);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      scope,
      refresh_token: refreshToken,
      id_token: await provider.sign(idClaims as JWTPayload),
    };
  };

  server.on('request', async (req, res) => {
    const url = new URL(req.url ?? '/', issuer);
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /internal/.well-known/openid-configuration':
          return json(200, {
            issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            userinfo_endpoint: `${issuer}/userinfo`,
            jwks_uri: `${issuer}/jwks`,
            revocation_endpoint: `${issuer}/revoke`,
            end_session_endpoint: `${issuer}/logout`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
            code_challenge_methods_supported: ['S256'],
            backchannel_logout_supported: true,
            backchannel_logout_session_supported: true,
          });

        case 'GET /internal/jwks':
          provider.jwksRequests += 1;

          return json(200, { keys: keys.map((k) => k.publicJwk) });

        case 'GET /internal/authorize': {
          const q = url.searchParams;
          const redirect = new URL(q.get('redirect_uri') ?? '');
          redirect.searchParams.set('state', q.get('state') ?? '');

          if (q.get('login_hint') === 'deny') {
            redirect.searchParams.set('error', 'access_denied');
            redirect.searchParams.set('error_description', 'User menolak');
          } else {
            if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
              return json(400, { error: 'invalid_request' });
            }

            const code = randomUUID();
            codes.set(code, {
              nonce: q.get('nonce') ?? undefined,
              codeChallenge: q.get('code_challenge')!,
              redirectUri: q.get('redirect_uri')!,
              scope: q.get('scope') ?? 'openid',
              clientId: q.get('client_id')!,
            });
            redirect.searchParams.set('code', code);
          }

          res.writeHead(302, { Location: redirect.href });

          return res.end();
        }

        case 'POST /internal/token': {
          const body = await readBody(req);
          if (!clientAuthenticated(req, body)) {
            return json(401, { error: 'invalid_client' });
          }

          if (body.get('grant_type') === 'authorization_code') {
            const issued = codes.get(body.get('code') ?? '');
            codes.delete(body.get('code') ?? '');
            const challenge = b64url(createHash('sha256').update(body.get('code_verifier') ?? '').digest());

            if (!issued || issued.codeChallenge !== challenge || issued.redirectUri !== body.get('redirect_uri')) {
              return json(400, { error: 'invalid_grant' });
            }

            return json(200, await issueTokens(issued.clientId, issued.scope, issued.nonce));
          }

          if (body.get('grant_type') === 'refresh_token') {
            const token = body.get('refresh_token') ?? '';

            if (!refreshTokens.delete(token)) {
              return json(400, { error: 'invalid_grant' });
            }

            return json(200, await issueTokens(provider.clientId, 'openid profile email', undefined));
          }

          return json(400, { error: 'unsupported_grant_type' });
        }

        case 'GET /internal/userinfo':
          if (!req.headers.authorization?.startsWith('Bearer ')) {
            return json(401, { error: 'invalid_token' });
          }

          return json(200, { sub: provider.subject, ...provider.profileClaims });

        case 'POST /internal/revoke': {
          const body = await readBody(req);

          if (!clientAuthenticated(req, body)) {
            return json(401, { error: 'invalid_client' });
          }

          provider.revoked.push(body.get('token') ?? '');
          res.writeHead(200);

          return res.end();
        }

        default:
          return json(404, { error: 'not_found' });
      }
    } catch (error) {
      json(500, { error: 'server_error', error_description: String(error) });
    }
  });

  return provider;
}

/** Follows the authorization URL on the fake provider and returns the redirect (callback) URL. */
export async function authorize(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'manual' });
  const location = response.headers.get('location');

  if (response.status !== 302 || !location) {
    throw new Error(`Unexpected authorize response ${response.status}`);
  }

  return location;
}
