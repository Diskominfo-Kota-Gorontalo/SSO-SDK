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
  opdKode?: string;
  opdNama?: string;
  jabatan?: string;
  golongan?: string;
  statusKepegawaian?: string;
  /** External realm (citizens). */
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  tingkatAkun?: string;
  nik?: string;
  realm?: Realm;
  /** Original claims. */
  raw: Record<string, unknown>;
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
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
    opdKode: str(claims.opd_kode),
    opdNama: str(claims.opd_nama),
    jabatan: str(claims.jabatan),
    golongan: str(claims.golongan),
    statusKepegawaian: str(claims.status_kepegawaian),
    phoneNumber: str(claims.phone_number),
    phoneNumberVerified: bool(claims.phone_number_verified),
    tingkatAkun: str(claims.tingkat_akun),
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
