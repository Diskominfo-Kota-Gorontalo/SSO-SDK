import * as oidc from 'openid-client';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import {
  AuthorizationDeniedError,
  AuthorizationError,
  DiscoveryError,
  InsufficientScopeError,
  InvalidTokenError,
  SsoConfigurationError,
  SsoError,
  StateMismatchError,
  TokenRequestError,
} from './errors.js';
import type {
  AccessTokenClaims,
  AuthorizationRequest,
  IdTokenClaims,
  LogoutTokenClaims,
  PendingAuthorization,
  TokenSet,
} from './types.js';

export const ACCESS_TOKEN_TYPE = 'at+jwt';
export const LOGOUT_TOKEN_TYPE = 'logout+jwt';
export const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

export interface SsoClientConfig {
  /** Realm issuer, e.g. `issuerFor('internal')` = `https://sso.gorontalokota.go.id/internal`. */
  issuer: string;
  clientId: string;
  /** Omit for public clients (token endpoint auth method `none`). */
  clientSecret?: string;
  /**
   * How the client secret is sent. Default `client_secret_post`.
   * `client_secret_basic` sends the credentials without form-encoding them, because the SSO
   * server (league/oauth2-server) does not URL-decode Basic credentials and client ids contain `-`.
   */
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post';
  /** Registered redirect URI. Required for `createAuthorizationRequest` and `handleCallback`. */
  redirectUri?: string;
  /** Default `['openid', 'profile', 'email']`. */
  scopes?: string[];
  /** Registered post logout redirect URI, used by `logoutUrl`. */
  postLogoutRedirectUri?: string;
  /** Accepted `aud` values when verifying access tokens for your API. Default `[clientId]`. */
  audiences?: string[];
  /** Clock tolerance in seconds. Default 60. */
  clockTolerance?: number;
  /** Maximum accepted age of a logout token (from its `iat`), in seconds. Default 300. */
  logoutTokenMaxAge?: number;
  /** Allow plain `http://` issuers. Only for local development. */
  allowInsecureRequests?: boolean;
}

export interface CreateAuthorizationRequestOptions {
  /** Overrides the configured scopes for this request. */
  scopes?: string[];
  prompt?: 'none' | 'login' | 'consent';
  loginHint?: string;
  maxAge?: number;
  /** Additional authorization request parameters. */
  extraParams?: Record<string, string>;
}

export interface VerifyAccessTokenOptions {
  requiredScopes?: string[];
}

export interface LogoutUrlOptions {
  idTokenHint?: string;
  state?: string;
  /** Overrides `postLogoutRedirectUri` from the config. */
  postLogoutRedirectUri?: string;
}

export interface SsoClient {
  readonly config: Readonly<Required<Pick<SsoClientConfig, 'issuer' | 'clientId' | 'scopes' | 'audiences' | 'clockTolerance'>>> &
    Readonly<SsoClientConfig>;
  /** Fetches (once) and returns the discovery document. */
  discover(): Promise<oidc.ServerMetadata>;
  createAuthorizationRequest(options?: CreateAuthorizationRequestOptions): Promise<AuthorizationRequest>;
  handleCallback(currentUrl: string | URL, pending: PendingAuthorization): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  userinfo(accessToken: string, expectedSubject?: string): Promise<IdTokenClaims>;
  logoutUrl(options?: LogoutUrlOptions): Promise<string>;
  revoke(token: string, tokenTypeHint?: 'access_token' | 'refresh_token'): Promise<void>;
  verifyAccessToken(jwt: string, options?: VerifyAccessTokenOptions): Promise<AccessTokenClaims>;
  verifyLogoutToken(jwt: string): Promise<LogoutTokenClaims>;
}

/**
 * Creates an SSO client for one realm. Discovery happens lazily on first use and is cached.
 */
export function createSsoClient(input: SsoClientConfig): SsoClient {
  if (!input.issuer) {
    throw new SsoConfigurationError('"issuer" wajib diisi.');
  }

  if (!input.clientId) {
    throw new SsoConfigurationError('"clientId" wajib diisi.');
  }

  const config = Object.freeze({
    ...input,
    issuer: input.issuer.replace(/\/+$/, ''),
    scopes: input.scopes ?? ['openid', 'profile', 'email'],
    audiences: input.audiences ?? [input.clientId],
    clockTolerance: input.clockTolerance ?? 60,
  });
  const logoutTokenMaxAge = input.logoutTokenMaxAge ?? 300;

  let configurationPromise: Promise<oidc.Configuration> | undefined;
  let remoteJwks: JWTVerifyGetKey | undefined;

  const configuration = (): Promise<oidc.Configuration> => {
    configurationPromise ??= (async () => {
      const clientAuth = config.clientSecret
        ? config.tokenEndpointAuthMethod === 'client_secret_basic'
          ? rawClientSecretBasic(config.clientId, config.clientSecret)
          : oidc.ClientSecretPost(config.clientSecret)
        : oidc.None();

      try {
        return await oidc.discovery(
          new URL(config.issuer),
          config.clientId,
          {
            ...(config.redirectUri ? { redirect_uris: [config.redirectUri] } : {}),
            [oidc.clockTolerance]: config.clockTolerance,
          },
          clientAuth,
          config.allowInsecureRequests ? { execute: [oidc.allowInsecureRequests] } : undefined,
        );
      } catch (error) {
        throw new DiscoveryError(`Gagal mengambil discovery dari ${config.issuer}: ${(error as Error).message}`, { cause: error });
      }
    })();

    configurationPromise.catch(() => {
      configurationPromise = undefined;
    });

    return configurationPromise;
  };

  const jwks = async (): Promise<JWTVerifyGetKey> => {
    if (!remoteJwks) {
      const metadata = (await configuration()).serverMetadata();

      if (!metadata.jwks_uri) {
        throw new DiscoveryError('Discovery tidak memiliki jwks_uri.');
      }

      remoteJwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
    }

    return remoteJwks;
  };

  const requireRedirectUri = (): string => {
    if (!config.redirectUri) {
      throw new SsoConfigurationError('"redirectUri" wajib diisi untuk alur login.');
    }

    return config.redirectUri;
  };

  return {
    config,

    async discover() {
      return (await configuration()).serverMetadata();
    },

    async createAuthorizationRequest(options = {}) {
      const redirectUri = requireRedirectUri();
      const cfg = await configuration();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const params: Record<string, string> = {
        ...options.extraParams,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: (options.scopes ?? config.scopes).join(' '),
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      };

      if (options.prompt) {
        params.prompt = options.prompt;
      }

      if (options.loginHint) {
        params.login_hint = options.loginHint;
      }

      if (options.maxAge !== undefined) {
        params.max_age = String(options.maxAge);
      }

      return { url: oidc.buildAuthorizationUrl(cfg, params).href, state, nonce, codeVerifier };
    },

    async handleCallback(currentUrl, pending) {
      const redirectUri = requireRedirectUri();
      const received = new URL(String(currentUrl), redirectUri);
      const params = received.searchParams;

      if (!pending?.state || params.get('state') !== pending.state) {
        throw new StateMismatchError();
      }

      const error = params.get('error');

      if (error) {
        const description = params.get('error_description') ?? undefined;
        throw error === 'access_denied' ? new AuthorizationDeniedError(description) : new AuthorizationError(error, description);
      }

      if (!params.get('code')) {
        throw new AuthorizationError('invalid_request', 'Callback tidak memiliki parameter code.');
      }

      // Rebuild the callback URL from the registered redirect URI so proxies (http vs https, host) do not matter.
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = received.search;
      const cfg = await configuration();

      try {
        const response = await oidc.authorizationCodeGrant(cfg, callbackUrl, {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: pending.state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        });

        return toTokenSet(response);
      } catch (cause) {
        throw mapOidcError(cause, 'Penukaran authorization code gagal');
      }
    },

    async refresh(refreshToken) {
      const cfg = await configuration();

      try {
        return toTokenSet(await oidc.refreshTokenGrant(cfg, refreshToken));
      } catch (cause) {
        throw mapOidcError(cause, 'Refresh token gagal');
      }
    },

    async userinfo(accessToken, expectedSubject) {
      const cfg = await configuration();

      try {
        return (await oidc.fetchUserInfo(cfg, accessToken, expectedSubject ?? oidc.skipSubjectCheck)) as unknown as IdTokenClaims;
      } catch (cause) {
        throw mapOidcError(cause, 'Gagal mengambil userinfo');
      }
    },

    async logoutUrl(options = {}) {
      const cfg = await configuration();
      const params: Record<string, string> = {};
      const postLogoutRedirectUri = options.postLogoutRedirectUri ?? config.postLogoutRedirectUri;

      if (options.idTokenHint) {
        params.id_token_hint = options.idTokenHint;
      }

      if (postLogoutRedirectUri) {
        params.post_logout_redirect_uri = postLogoutRedirectUri;
      }

      if (options.state) {
        params.state = options.state;
      }

      return oidc.buildEndSessionUrl(cfg, params).href;
    },

    async revoke(token, tokenTypeHint) {
      const cfg = await configuration();

      try {
        await oidc.tokenRevocation(cfg, token, tokenTypeHint ? { token_type_hint: tokenTypeHint } : undefined);
      } catch (cause) {
        throw mapOidcError(cause, 'Revokasi token gagal');
      }
    },

    async verifyAccessToken(jwt, options = {}) {
      const payload = await verifyJwt(jwt, await jwks(), {
        issuer: config.issuer,
        audience: config.audiences,
        typ: ACCESS_TOKEN_TYPE,
        clockTolerance: config.clockTolerance,
        requiredClaims: ['iss', 'sub', 'aud', 'exp'],
      });
      const scope = typeof payload.scope === 'string' ? payload.scope : '';
      const scopes = scope.split(' ').filter(Boolean);
      const required = options.requiredScopes ?? [];

      if (required.some((s) => !scopes.includes(s))) {
        throw new InsufficientScopeError(required, scopes);
      }

      return { ...payload, scopes } as AccessTokenClaims;
    },

    async verifyLogoutToken(jwt) {
      const payload = await verifyJwt(jwt, await jwks(), {
        issuer: config.issuer,
        audience: config.clientId,
        typ: LOGOUT_TOKEN_TYPE,
        clockTolerance: config.clockTolerance,
        requiredClaims: ['iss', 'aud', 'iat', 'jti'],
      });
      const now = Math.floor(Date.now() / 1000);
      const iat = payload.iat as number;

      if (iat > now + config.clockTolerance || iat < now - logoutTokenMaxAge - config.clockTolerance) {
        throw new InvalidTokenError('Logout token: iat di luar batas toleransi.');
      }

      const events = payload.events as Record<string, unknown> | undefined;
      const event = events && typeof events === 'object' ? events[BACKCHANNEL_LOGOUT_EVENT] : undefined;

      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new InvalidTokenError('Logout token: claim events tidak valid.');
      }

      if ('nonce' in payload) {
        throw new InvalidTokenError('Logout token tidak boleh memiliki nonce.');
      }

      const hasSub = typeof payload.sub === 'string' && payload.sub !== '';
      const hasSid = typeof payload.sid === 'string' && payload.sid !== '';

      if (!hasSub && !hasSid) {
        throw new InvalidTokenError('Logout token harus memiliki sub atau sid.');
      }

      return payload as LogoutTokenClaims;
    },
  };
}

/**
 * HTTP Basic client authentication without the RFC 6749 form-encoding step that
 * `oidc.ClientSecretBasic` applies (`-` would become `%2D`, which the SSO server does not decode).
 */
function rawClientSecretBasic(clientId: string, clientSecret: string): oidc.ClientAuth {
  const value = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;

  return (_as, _client, _body, headers) => {
    headers.set('authorization', value);
  };
}

async function verifyJwt(jwt: string, keys: JWTVerifyGetKey, options: Parameters<typeof jwtVerify>[2]): Promise<JWTPayload> {
  if (typeof jwt !== 'string' || jwt === '') {
    throw new InvalidTokenError('Token kosong.');
  }

  try {
    const { payload } = await jwtVerify(jwt, keys, { algorithms: ['RS256'], ...options });

    return payload;
  } catch (cause) {
    if (cause instanceof joseErrors.JOSEError) {
      throw new InvalidTokenError(`Token tidak valid: ${cause.message}`, { cause });
    }

    throw cause;
  }
}

function toTokenSet(response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers): TokenSet {
  const expiresIn = response.expiresIn();
  const claims = response.claims();
  const tokens: TokenSet = {
    accessToken: response.access_token,
    tokenType: response.token_type,
  };

  if (response.id_token) {
    tokens.idToken = response.id_token;
  }

  if (response.refresh_token) {
    tokens.refreshToken = response.refresh_token;
  }

  if (response.scope) {
    tokens.scope = response.scope;
  }

  if (expiresIn !== undefined) {
    tokens.expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  }

  if (claims) {
    tokens.claims = { ...claims } as unknown as IdTokenClaims;
  }

  return tokens;
}

function mapOidcError(cause: unknown, context: string): SsoError {
  if (cause instanceof SsoError) {
    return cause;
  }

  if (cause instanceof oidc.ResponseBodyError) {
    return new TokenRequestError(`${context}: ${cause.error}${cause.error_description ? ` (${cause.error_description})` : ''}`, cause.error, { cause });
  }

  if (cause instanceof oidc.AuthorizationResponseError) {
    return cause.error === 'access_denied'
      ? new AuthorizationDeniedError(cause.error_description)
      : new AuthorizationError(cause.error, cause.error_description);
  }

  const message = cause instanceof Error ? cause.message : String(cause);
  const code = (cause as { code?: unknown })?.code;

  // openid-client / oauth4webapi JWT and response validation failures.
  if (typeof code === 'string' && /JWT|CLAIM|KEY_SELECTION|SIGNATURE|INVALID_RESPONSE|UNEXPECTED/i.test(code)) {
    return new InvalidTokenError(`${context}: ${message}`, { cause });
  }

  return new TokenRequestError(`${context}: ${message}`, undefined, { cause });
}
