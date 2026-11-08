import type { SsoClient } from './client.js';
import { SsoError } from './errors.js';
import { issuerFor, type Realm } from './realm.js';
import type { LogoutRegistry, SessionLookup } from './registry.js';
import { toSsoUser, type SsoUser } from './user.js';

export interface GorontalokotaSsoOptions {
  /** Realm to sign in against. Ignored when `issuer` is given. */
  realm?: Realm;
  /** Explicit issuer, e.g. a staging server. */
  issuer?: string;
  /** Base URL used with `realm`. Default production. */
  baseUrl?: string;
  clientId: string;
  /** Omit for public clients. */
  clientSecret?: string;
  /** Default `['openid', 'profile', 'email']`. */
  scopes?: string[];
  /** Auth.js provider id (callback path `/api/auth/callback/{id}`). Default `gorontalokota-sso`. */
  id?: string;
  /** Button label. Default `SSO Kota Gorontalo`. */
  name?: string;
  /** Extra authorization parameters (e.g. `{ prompt: 'login' }`). */
  authorizationParams?: Record<string, string>;
}

/** The user object Auth.js receives from `profile()`; `id` is the SSO `sub`. */
export type GorontalokotaSsoProfileUser = Omit<SsoUser, 'raw' | 'name' | 'email'> & {
  id: string;
  name: string | null;
  email: string | null;
  image: null;
};

/**
 * Structural subset of Auth.js `OIDCConfig` (`@auth/core/providers`), declared here so the
 * package does not import next-auth at runtime or type level.
 */
export interface GorontalokotaSsoProvider {
  id: string;
  name: string;
  type: 'oidc';
  issuer: string;
  clientId: string;
  clientSecret?: string;
  checks: Array<'pkce' | 'state' | 'nonce'>;
  authorization: { params: Record<string, string> };
  client?: { token_endpoint_auth_method: string };
  profile(profile: Record<string, unknown>): GorontalokotaSsoProfileUser;
}

/**
 * Auth.js (next-auth v5 / `@auth/core`) provider for the Pemerintah Kota Gorontalo SSO.
 *
 * ```ts
 * NextAuth({ providers: [GorontalokotaSso({ realm: 'internal', clientId, clientSecret })] })
 * ```
 */
export function GorontalokotaSso(options: GorontalokotaSsoOptions): GorontalokotaSsoProvider {
  const issuer = (options.issuer ?? issuerFor(options.realm ?? 'internal', options.baseUrl)).replace(/\/+$/, '');
  const provider: GorontalokotaSsoProvider = {
    id: options.id ?? 'gorontalokota-sso',
    name: options.name ?? 'SSO Kota Gorontalo',
    type: 'oidc',
    issuer,
    clientId: options.clientId,
    checks: ['pkce', 'state', 'nonce'],
    authorization: {
      params: { ...options.authorizationParams, scope: (options.scopes ?? ['openid', 'profile', 'email']).join(' ') },
    },
    profile(profile) {
      const { raw: _raw, ...user } = toSsoUser(profile);

      return { ...user, id: user.sub, name: user.name ?? null, email: user.email ?? null, image: null };
    },
  };

  if (options.clientSecret) {
    provider.clientSecret = options.clientSecret;
    // The SSO server does not URL-decode HTTP Basic credentials (RFC 6749 §2.3.1), and client ids contain "-":
    // send them in the body instead.
    provider.client = { token_endpoint_auth_method: 'client_secret_post' };
  } else {
    provider.client = { token_endpoint_auth_method: 'none' };
  }

  return provider;
}

export interface BackchannelLogoutHandlerOptions {
  client: SsoClient;
  registry: LogoutRegistry;
}

/**
 * Route Handler for the back-channel logout URI:
 *
 * ```ts
 * // app/api/sso/backchannel-logout/route.ts
 * export const POST = createBackchannelLogoutHandler({ client, registry });
 * ```
 */
export function createBackchannelLogoutHandler(options: BackchannelLogoutHandlerOptions): (request: Request) => Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const invalid = (description: string): Response =>
    Response.json({ error: 'invalid_request', error_description: description }, { status: 400, headers });

  return async (request) => {
    let logoutToken: FormDataEntryValue | null = null;

    try {
      logoutToken = (await request.formData()).get('logout_token');
    } catch {
      return invalid('Body harus application/x-www-form-urlencoded.');
    }

    if (typeof logoutToken !== 'string') {
      return invalid('logout_token wajib diisi.');
    }

    try {
      const claims = await options.client.verifyLogoutToken(logoutToken);
      await options.registry.markEnded(claims);
    } catch (error) {
      if (error instanceof SsoError) {
        return invalid(error.message);
      }

      throw error;
    }

    return new Response(null, { status: 200, headers });
  };
}

/**
 * True when the SSO session behind an Auth.js session was ended by back-channel logout.
 * Call it from the `jwt` callback with the `sub`, `sid` and `auth_time` you stored at sign in.
 */
export async function isSessionEnded(registry: LogoutRegistry, lookup: SessionLookup): Promise<boolean> {
  return registry.isEnded(lookup);
}
