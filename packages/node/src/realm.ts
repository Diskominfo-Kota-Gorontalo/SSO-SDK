/** SSO realm: `internal` for ASN (civil servants), `external` for citizens. Each realm is its own issuer. */
export type Realm = 'internal' | 'external';

/** Production base URL of the Pemerintah Kota Gorontalo SSO. */
export const DEFAULT_SSO_BASE_URL = 'https://sso.gorontalokota.go.id';

export const REALMS: readonly Realm[] = ['internal', 'external'];

/**
 * Returns the issuer URL of a realm, e.g. `https://sso.gorontalokota.go.id/internal`.
 */
export function issuerFor(realm: Realm, base: string = DEFAULT_SSO_BASE_URL): string {
  if (!REALMS.includes(realm)) {
    throw new TypeError(`Unknown realm "${String(realm)}", expected "internal" or "external".`);
  }

  return `${base.replace(/\/+$/, '')}/${realm}`;
}

/** Infers the realm from an issuer URL (last path segment). */
export function realmFromIssuer(issuer: string | undefined): Realm | undefined {
  if (!issuer) {
    return undefined;
  }

  const last = issuer.replace(/\/+$/, '').split('/').pop();

  return last === 'internal' || last === 'external' ? last : undefined;
}
