import { realmFromIssuer, type Realm } from './realm.js';

/** Application friendly view of the SSO identity claims. */
export interface SsoUser {
  sub: string;
  name?: string;
  /** For the internal realm this is the NIP. */
  preferredUsername?: string;
  email?: string;
  emailVerified?: boolean;
  /** Internal realm (ASN). */
  nip?: string;
  organizationCode?: string;
  organizationName?: string;
  position?: string;
  grade?: string;
  employmentStatus?: string;
  /** Internal realm, scope `photo`: file name as in the employee database. */
  photo?: string;
  /** Scope `photo`: photo URL (OIDC `picture`), only when the SSO server knows the photo base URL. */
  picture?: string;
  /** Scope `phone` (both realms), E.164 format. */
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  /** "L1" (self-registered) or "L2" (NIK checked at a service counter). */
  verificationLevel?: string;
  /** Scope `nik` (both realms, restricted). */
  nik?: string;
  realm?: Realm;
  /** Original claims. */
  raw: Record<string, unknown>;
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
/** English claim first, then the legacy Indonesian name sent by older SSO servers. */
const first = (claims: Record<string, unknown>, ...names: string[]): string | undefined => names.map((name) => str(claims[name])).find((value) => value !== undefined);
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

/**
 * Maps ID token / userinfo / access token claims to an {@link SsoUser}.
 */
export function toSsoUser(claims: Record<string, unknown>): SsoUser {
  const sub = str(claims.sub);

  if (!sub) {
    throw new TypeError('Claims tidak memiliki "sub".');
  }

  const realmClaim = str(claims.realm);
  const realm = realmClaim === 'internal' || realmClaim === 'external' ? realmClaim : realmFromIssuer(str(claims.iss));

  const user: SsoUser = {
    sub,
    name: str(claims.name),
    preferredUsername: str(claims.preferred_username),
    email: str(claims.email),
    emailVerified: bool(claims.email_verified),
    nip: str(claims.nip),
    organizationCode: first(claims, 'organization_code', 'opd_kode'),
    organizationName: first(claims, 'organization_name', 'opd_nama'),
    position: first(claims, 'position', 'jabatan'),
    grade: first(claims, 'grade', 'golongan'),
    employmentStatus: first(claims, 'employment_status', 'status_kepegawaian'),
    photo: str(claims.photo),
    picture: str(claims.picture),
    phoneNumber: str(claims.phone_number),
    phoneNumberVerified: bool(claims.phone_number_verified),
    verificationLevel: first(claims, 'verification_level', 'tingkat_akun'),
    nik: str(claims.nik),
    realm,
    raw: { ...claims },
  };

  for (const key of Object.keys(user) as (keyof SsoUser)[]) {
    if (user[key] === undefined) {
      delete user[key];
    }
  }

  return user;
}
