import type { Realm } from './realm.js';

/** Claims common to every JWT issued by the SSO. */
export interface JwtClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  [claim: string]: unknown;
}

/** Claims of a validated ID token (and of the userinfo response). */
export interface IdTokenClaims extends JwtClaims {
  auth_time?: number;
  nonce?: string;
  sid?: string;
  azp?: string;
  at_hash?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  /** Internal realm (scope `employee`). */
  nip?: string;
  organization_code?: string;
  organization_name?: string;
  position?: string;
  grade?: string;
  employment_status?: string;
  /** @deprecated Legacy name of `organization_code`, sent only during the transition. */
  opd_kode?: string;
  /** @deprecated Legacy name of `organization_name`. */
  opd_nama?: string;
  /** @deprecated Legacy name of `position`. */
  jabatan?: string;
  /** @deprecated Legacy name of `grade`. */
  golongan?: string;
  /** @deprecated Legacy name of `employment_status`. */
  status_kepegawaian?: string;
  /** Scope `phone` (both realms), E.164 format. */
  phone_number?: string;
  phone_number_verified?: boolean;
  /** Internal realm, scope `photo`: file name as in the employee database. */
  photo?: string;
  /** Scope `photo`: photo URL, only when the SSO server knows the photo base URL. */
  picture?: string;
  verification_level?: 'L1' | 'L2' | string;
  /** @deprecated Legacy name of `verification_level`. */
  tingkat_akun?: 'L1' | 'L2' | string;
  /** Scope `nik` (both realms, restricted). */
  nik?: string;
}

/** Claims of a validated access token (JWT, `typ: at+jwt`). */
export interface AccessTokenClaims extends JwtClaims {
  jti: string;
  client_id: string;
  /** Space separated scopes. */
  scope: string;
  realm: Realm | string;
  sid?: string;
  /** Parsed `scope` claim. */
  scopes: string[];
}

/** Claims of a validated back-channel logout token. */
export interface LogoutTokenClaims {
  iss: string;
  aud: string | string[];
  iat: number;
  jti: string;
  sub?: string;
  sid?: string;
  exp?: number;
  events: Record<string, unknown>;
  [claim: string]: unknown;
}

/** Tokens returned by the token endpoint (code exchange or refresh). */
export interface TokenSet {
  accessToken: string;
  tokenType: string;
  idToken?: string;
  refreshToken?: string;
  scope?: string;
  /** Expiry of the access token, seconds since the epoch. */
  expiresAt?: number;
  /** Validated ID token claims (present when the response contained an ID token). */
  claims?: IdTokenClaims;
}

/** What must be kept (server side) between the authorization request and the callback. */
export interface PendingAuthorization {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface AuthorizationRequest extends PendingAuthorization {
  url: string;
}
