/**
 * Base class for every error thrown by `@gorontalokota/sso`.
 * `code` is a stable, machine readable identifier.
 */
export class SsoError extends Error {
  readonly code: string;

  constructor(message: string, code = 'sso_error', options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Invalid or incomplete SDK configuration. */
export class SsoConfigurationError extends SsoError {
  constructor(message: string) {
    super(message, 'configuration_error');
  }
}

/** The discovery document could not be fetched or is invalid. */
export class DiscoveryError extends SsoError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'discovery_error', options);
  }
}

/** The `state` returned to the callback does not match the pending request. */
export class StateMismatchError extends SsoError {
  constructor(message = 'State pada callback tidak cocok dengan permintaan login.') {
    super(message, 'state_mismatch');
  }
}

/** The authorization server returned an OAuth error to the redirect URI. */
export class AuthorizationError extends SsoError {
  readonly error: string;
  readonly errorDescription: string | undefined;

  constructor(error: string, errorDescription?: string, code = 'authorization_error') {
    super(errorDescription ? `${error}: ${errorDescription}` : error, code);
    this.error = error;
    this.errorDescription = errorDescription;
  }
}

/** The user (or the server on the user's behalf) denied the authorization request (`error=access_denied`). */
export class AuthorizationDeniedError extends AuthorizationError {
  constructor(errorDescription?: string) {
    super('access_denied', errorDescription, 'access_denied');
  }
}

/** A token request (code exchange, refresh, revocation, userinfo) failed. */
export class TokenRequestError extends SsoError {
  readonly error: string | undefined;

  constructor(message: string, error?: string, options?: { cause?: unknown }) {
    super(message, 'token_request_failed', options);
    this.error = error;
  }
}

/** A JWT (ID token, access token or logout token) failed validation. */
export class InvalidTokenError extends SsoError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'invalid_token', options);
  }
}

/** A valid access token lacks one or more required scopes. */
export class InsufficientScopeError extends SsoError {
  readonly requiredScopes: string[];
  readonly grantedScopes: string[];

  constructor(requiredScopes: string[], grantedScopes: string[]) {
    super(`Access token tidak memiliki scope: ${requiredScopes.filter((s) => !grantedScopes.includes(s)).join(' ')}`, 'insufficient_scope');
    this.requiredScopes = requiredScopes;
    this.grantedScopes = grantedScopes;
  }
}
