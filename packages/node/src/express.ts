import express, { type NextFunction, type Request, type RequestHandler, type Response, type Router } from 'express';
import type { Session } from 'express-session';
import type { CreateAuthorizationRequestOptions, SsoClient } from './client.js';
import { AuthorizationDeniedError, InsufficientScopeError, SsoError, TokenRequestError } from './errors.js';
import { MemoryLogoutRegistry, type LogoutRegistry } from './registry.js';
import type { AccessTokenClaims, PendingAuthorization, TokenSet } from './types.js';
import { toSsoUser, type SsoUser } from './user.js';

/** What the router keeps in `req.session.sso` after a successful login. Tokens never leave the server. */
export interface SsoSessionData {
  user: SsoUser;
  tokens: Omit<TokenSet, 'claims'>;
  /** SSO session id (`sid` claim). */
  sid?: string;
  /** `auth_time` (or `iat`) of the ID token, seconds since the epoch. */
  authTime?: number;
}

export interface SsoPendingLogin extends PendingAuthorization {
  returnTo: string;
  createdAt: number;
}

declare module 'express-session' {
  interface SessionData {
    sso?: SsoSessionData;
    ssoPending?: SsoPendingLogin;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`: the logged in user. */
      ssoUser?: SsoUser;
      /** Set by `requireToken`: validated access token claims. */
      sso?: AccessTokenClaims;
    }
  }
}

export interface SsoRouterOptions {
  client: SsoClient;
  /** Where back-channel logouts are recorded. Default: a new {@link MemoryLogoutRegistry} (single process only). */
  registry?: LogoutRegistry;
  /** Where the router is mounted, used by `router.requireAuth` to build the login URL. Default `/sso`. */
  mountPath?: string;
  /** Redirect target after login when no valid `returnTo` was given. Default `/`. */
  afterLoginRedirect?: string;
  /** Called after the code exchange, before the session is created. Throw to refuse the login. */
  onLogin?(user: SsoUser, tokens: TokenSet, req: Request): void | Promise<void>;
  /** Custom error handling for `/callback`. Default: plain text 403 (access denied) / 400 (other SSO errors). */
  onError?(error: unknown, req: Request, res: Response, next: NextFunction): void;
  /** Extra options for every authorization request (scopes, prompt...). */
  authorizationOptions?: CreateAuthorizationRequestOptions;
  /** Revoke the refresh token on logout. Default true. */
  revokeOnLogout?: boolean;
}

export type SsoRouter = Router & {
  registry: LogoutRegistry;
  /** `requireAuth` bound to this router's registry and login path. */
  requireAuth: RequestHandler;
};

export interface RequireAuthOptions {
  registry?: LogoutRegistry;
  /** Login route of the SSO router. Default `/sso/login`. */
  loginPath?: string;
}

export interface RequireTokenOptions {
  client: SsoClient;
  scopes?: string[];
  /** When given, tokens of SSO sessions ended by back-channel logout are rejected. */
  registry?: LogoutRegistry;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Returns `value` when it is a same-origin relative path (`/x?y#z`), otherwise `undefined`.
 * Prevents open redirects through `?returnTo=`.
 */
export function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return undefined;
  }

  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }

  try {
    const base = 'http://return-to.invalid';
    const url = new URL(value, base);

    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Express router implementing the BFF side of the SSO login:
 * `GET /login`, `GET /callback`, `POST /logout`, `POST /backchannel-logout`, `GET /user`.
 * Requires `express-session` to be mounted before it (cookie `sameSite: 'lax'`).
 */
export function createSsoRouter(options: SsoRouterOptions): SsoRouter {
  const { client } = options;
  const registry = options.registry ?? new MemoryLogoutRegistry();
  const afterLoginRedirect = safeReturnTo(options.afterLoginRedirect) ?? '/';
  const mountPath = (options.mountPath ?? '/sso').replace(/\/+$/, '');
  const revokeOnLogout = options.revokeOnLogout ?? true;
  const router = express.Router() as SsoRouter;

  router.get(
    '/login',
    asyncHandler(async (req, res) => {
      const session = requireSession(req);
      const request = await client.createAuthorizationRequest(options.authorizationOptions);
      session.ssoPending = {
        state: request.state,
        nonce: request.nonce,
        codeVerifier: request.codeVerifier,
        returnTo: safeReturnTo(req.query.returnTo) ?? afterLoginRedirect,
        createdAt: Date.now(),
      };
      await saveSession(session);
      res.set('Cache-Control', 'no-store');
      res.redirect(302, request.url);
    }),
  );

  router.get(
    '/callback',
    asyncHandler(async (req, res, next) => {
      const session = requireSession(req);
      const pending = session.ssoPending;
      delete session.ssoPending;
      res.set('Cache-Control', 'no-store');

      try {
        if (!pending || Date.now() - pending.createdAt > PENDING_TTL_MS) {
          throw new SsoError('Sesi login tidak ditemukan atau sudah kedaluwarsa. Silakan ulangi login.', 'login_session_missing');
        }

        const tokens = await client.handleCallback(req.originalUrl, pending);

        if (!tokens.claims) {
          throw new SsoError('Respons token tidak berisi ID token.', 'missing_id_token');
        }

        const user = toSsoUser(tokens.claims);
        await options.onLogin?.(user, tokens, req);
        // Prevent session fixation: new session id after login.
        await regenerateSession(session);
        const { claims, ...storedTokens } = tokens;
        req.session.sso = {
          user,
          tokens: storedTokens,
          sid: claims.sid,
          authTime: claims.auth_time ?? claims.iat,
        };
        await saveSession(req.session);
        res.redirect(302, pending.returnTo);
      } catch (error) {
        if (options.onError) {
          options.onError(error, req, res, next);

          return;
        }

        if (error instanceof AuthorizationDeniedError) {
          res.status(403).type('text/plain').send('Akses ke aplikasi ditolak.');

          return;
        }

        if (error instanceof SsoError) {
          res.status(400).type('text/plain').send(`Login SSO gagal: ${error.message}`);

          return;
        }

        throw error;
      }
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const data = req.session?.sso;

      if (revokeOnLogout && data?.tokens.refreshToken) {
        await client.revoke(data.tokens.refreshToken, 'refresh_token').catch(() => undefined);
      }

      if (req.session) {
        await destroySession(req.session);
      }

      const redirectTo = await client.logoutUrl({ idTokenHint: data?.tokens.idToken });
      res.set('Cache-Control', 'no-store');

      if (prefersJson(req)) {
        res.json({ redirectTo });

        return;
      }

      res.redirect(303, redirectTo);
    }),
  );

  router.post(
    '/backchannel-logout',
    express.urlencoded({ extended: false, limit: '16kb' }),
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const logoutToken = (req.body as Record<string, unknown> | undefined)?.logout_token;

      if (typeof logoutToken !== 'string') {
        res.status(400).json({ error: 'invalid_request', error_description: 'logout_token wajib diisi.' });

        return;
      }

      let claims;

      try {
        claims = await client.verifyLogoutToken(logoutToken);
      } catch (error) {
        if (error instanceof SsoError) {
          res.status(400).json({ error: 'invalid_request', error_description: error.message });

          return;
        }

        throw error;
      }

      await registry.markEnded(claims);
      res.status(200).end();
    }),
  );

  router.get(
    '/user',
    asyncHandler(async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const data = await activeSession(req, registry);

      if (!data) {
        res.status(401).json({ user: null });

        return;
      }

      res.json({ user: data.user });
    }),
  );

  router.registry = registry;
  router.requireAuth = requireAuth({ registry, loginPath: `${mountPath}/login` });

  return router;
}

/**
 * Middleware for pages/routes that need a logged in user. Drops the session when the SSO
 * session ended (back-channel logout). Responds JSON 401 for XHR / `Accept: application/json`,
 * otherwise redirects to the login route with `returnTo`.
 */
export function requireAuth(options: RequireAuthOptions = {}): RequestHandler {
  const loginPath = options.loginPath ?? '/sso/login';

  return asyncHandler(async (req, res, next) => {
    const data = await activeSession(req, options.registry);

    if (data) {
      req.ssoUser = data.user;
      next();

      return;
    }

    if (prefersJson(req)) {
      res.status(401).json({ error: 'unauthenticated' });

      return;
    }

    const returnTo = safeReturnTo(req.originalUrl);
    res.redirect(302, returnTo ? `${loginPath}?returnTo=${encodeURIComponent(returnTo)}` : loginPath);
  });
}

/**
 * Middleware for APIs called with `Authorization: Bearer <access token>`.
 * On success `req.sso` holds the validated claims.
 */
export function requireToken(options: RequireTokenOptions): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    const match = /^Bearer\s+([A-Za-z0-9\-_.~+/]+=*)\s*$/i.exec(req.headers.authorization ?? '');

    if (!match?.[1]) {
      res.set('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'invalid_token', error_description: 'Access token tidak ada.' });

      return;
    }

    try {
      const claims = await options.client.verifyAccessToken(match[1], { requiredScopes: options.scopes });

      if (options.registry && (await options.registry.isEnded({ sub: claims.sub, sid: claims.sid, authenticatedAt: claims.iat }))) {
        throw new SsoError('Sesi SSO sudah berakhir.', 'invalid_token');
      }

      req.sso = claims;
      next();
    } catch (error) {
      if (error instanceof InsufficientScopeError) {
        res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${error.requiredScopes.join(' ')}"`);
        res.status(403).json({ error: 'insufficient_scope', error_description: error.message });

        return;
      }

      if (error instanceof SsoError) {
        res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
        res.status(401).json({ error: 'invalid_token', error_description: error.message });

        return;
      }

      throw error;
    }
  });
}

/**
 * Returns a valid access token for the logged in user (refreshing it when it expires within
 * `minValiditySeconds`), e.g. to call another API on behalf of the user. Returns `undefined`
 * when there is no session or the refresh token was rejected (the session is then destroyed).
 */
export async function getAccessToken(req: Request, client: SsoClient, minValiditySeconds = 60): Promise<string | undefined> {
  const data = req.session?.sso;

  if (!data) {
    return undefined;
  }

  const now = Math.floor(Date.now() / 1000);

  if (data.tokens.expiresAt === undefined || data.tokens.expiresAt - minValiditySeconds > now) {
    return data.tokens.accessToken;
  }

  if (!data.tokens.refreshToken) {
    return undefined;
  }

  try {
    const { claims, ...refreshed } = await client.refresh(data.tokens.refreshToken);
    data.tokens = { ...data.tokens, ...refreshed };

    if (claims) {
      data.user = toSsoUser(claims);
    }

    await saveSession(req.session);

    return data.tokens.accessToken;
  } catch (error) {
    if (error instanceof TokenRequestError && error.error === 'invalid_grant') {
      await destroySession(req.session);

      return undefined;
    }

    throw error;
  }
}

async function activeSession(req: Request, registry: LogoutRegistry | undefined): Promise<SsoSessionData | undefined> {
  const data = req.session?.sso;

  if (!data) {
    return undefined;
  }

  if (registry && (await registry.isEnded({ sub: data.user.sub, sid: data.sid, authenticatedAt: data.authTime }))) {
    await destroySession(req.session);

    return undefined;
  }

  return data;
}

function prefersJson(req: Request): boolean {
  return req.xhr || req.accepts(['html', 'json']) === 'json';
}

function requireSession(req: Request): Session & Partial<import('express-session').SessionData> {
  if (!req.session) {
    throw new Error('@gorontalokota/sso/express membutuhkan express-session yang dipasang sebelum router SSO.');
  }

  return req.session;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

const saveSession = (session: Session): Promise<void> =>
  new Promise((resolve, reject) => session.save((error?: unknown) => (error ? reject(error) : resolve())));

const regenerateSession = (session: Session): Promise<void> =>
  new Promise((resolve, reject) => session.regenerate((error?: unknown) => (error ? reject(error) : resolve())));

const destroySession = (session: Session): Promise<void> =>
  new Promise((resolve, reject) => session.destroy((error?: unknown) => (error ? reject(error) : resolve())));
