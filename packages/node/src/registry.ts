import type { LogoutTokenClaims } from './types.js';

export interface SessionLookup {
  sub?: string;
  sid?: string;
  /** When the local session was authenticated at the SSO (`auth_time`), seconds since the epoch. */
  authenticatedAt?: number;
}

/**
 * Remembers SSO sessions ended through back-channel logout so the application can
 * drop its own session on the next request.
 *
 * Semantics:
 * - logout token with `sid`: that SSO session has ended;
 * - logout token with only `sub`: every session of that subject authenticated at or before the token `iat` has ended.
 *
 * Implementations must be shared by every instance of the application (Redis, database, ...).
 */
export interface LogoutRegistry {
  markEnded(claims: Pick<LogoutTokenClaims, 'sub' | 'sid' | 'iat'>): Promise<void> | void;
  isEnded(lookup: SessionLookup): Promise<boolean> | boolean;
}

export interface MemoryLogoutRegistryOptions {
  /** How long an entry is remembered, in seconds. Should be >= your maximum session lifetime. Default 7 days. */
  ttlSeconds?: number;
  /** Clock override (milliseconds), for tests. */
  now?: () => number;
}

/**
 * In-memory {@link LogoutRegistry}. Only suitable for a single process: with several
 * instances (PM2 cluster, containers, serverless) use a shared store such as Redis.
 */
export class MemoryLogoutRegistry implements LogoutRegistry {
  private readonly endedSessions = new Map<string, number>();
  private readonly endedSubjects = new Map<string, { endedAt: number; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: MemoryLogoutRegistryOptions = {}) {
    this.ttlMs = (options.ttlSeconds ?? 7 * 24 * 3600) * 1000;
    this.now = options.now ?? Date.now;
  }

  markEnded(claims: Pick<LogoutTokenClaims, 'sub' | 'sid' | 'iat'>): void {
    this.prune();
    const expiresAt = this.now() + this.ttlMs;

    if (claims.sid) {
      this.endedSessions.set(claims.sid, expiresAt);

      return;
    }

    if (claims.sub) {
      const previous = this.endedSubjects.get(claims.sub);
      const endedAt = Math.max(previous?.endedAt ?? 0, claims.iat);
      this.endedSubjects.set(claims.sub, { endedAt, expiresAt });
    }
  }

  isEnded(lookup: SessionLookup): boolean {
    const now = this.now();

    if (lookup.sid) {
      const expiresAt = this.endedSessions.get(lookup.sid);

      if (expiresAt !== undefined && expiresAt > now) {
        return true;
      }
    }

    if (lookup.sub) {
      const entry = this.endedSubjects.get(lookup.sub);

      if (entry && entry.expiresAt > now) {
        return lookup.authenticatedAt === undefined || lookup.authenticatedAt <= entry.endedAt;
      }
    }

    return false;
  }

  private prune(): void {
    const now = this.now();

    for (const [sid, expiresAt] of this.endedSessions) {
      if (expiresAt <= now) {
        this.endedSessions.delete(sid);
      }
    }

    for (const [sub, entry] of this.endedSubjects) {
      if (entry.expiresAt <= now) {
        this.endedSubjects.delete(sub);
      }
    }
  }
}
