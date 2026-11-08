import { describe, expect, it } from 'vitest';
import { MemoryLogoutRegistry, toSsoUser } from '../src/index.js';

describe('MemoryLogoutRegistry', () => {
  it('ends only the session named by sid', () => {
    const registry = new MemoryLogoutRegistry();
    registry.markEnded({ sub: 'u1', sid: 's1', iat: 1000 });

    expect(registry.isEnded({ sub: 'u1', sid: 's1', authenticatedAt: 500 })).toBe(true);
    expect(registry.isEnded({ sub: 'u1', sid: 's2', authenticatedAt: 500 })).toBe(false);
  });

  it('ends every session of sub authenticated at or before iat when sid is absent', () => {
    const registry = new MemoryLogoutRegistry();
    registry.markEnded({ sub: 'u1', iat: 1000 });

    expect(registry.isEnded({ sub: 'u1', sid: 'a', authenticatedAt: 900 })).toBe(true);
    expect(registry.isEnded({ sub: 'u1', sid: 'b', authenticatedAt: 1000 })).toBe(true);
    expect(registry.isEnded({ sub: 'u1', sid: 'c', authenticatedAt: 1001 })).toBe(false);
    expect(registry.isEnded({ sub: 'u1' })).toBe(true);
    expect(registry.isEnded({ sub: 'u2', authenticatedAt: 900 })).toBe(false);
  });

  it('forgets entries after the TTL', () => {
    let clock = 0;
    const registry = new MemoryLogoutRegistry({ ttlSeconds: 60, now: () => clock });
    registry.markEnded({ sid: 's1', iat: 0 });
    clock = 61_000;

    expect(registry.isEnded({ sid: 's1' })).toBe(false);
  });
});

describe('toSsoUser', () => {
  it('maps internal and external realm claims', () => {
    expect(
      toSsoUser({ iss: 'https://sso.gorontalokota.go.id/internal', sub: '1', name: 'A', preferred_username: '1980', nip: '1980', opd_kode: '1.01', status_kepegawaian: 'PNS' }),
    ).toMatchObject({ sub: '1', realm: 'internal', preferredUsername: '1980', nip: '1980', opdKode: '1.01', statusKepegawaian: 'PNS' });

    const citizen = toSsoUser({ iss: 'https://sso.gorontalokota.go.id/external', sub: '2', phone_number: '0812', tingkat_akun: 'L2' });
    expect(citizen).toMatchObject({ realm: 'external', phoneNumber: '0812', tingkatAkun: 'L2' });
    expect(citizen).not.toHaveProperty('nip');
  });
});
