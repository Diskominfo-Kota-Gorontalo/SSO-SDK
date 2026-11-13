# @gorontalokota/sso

SDK klien Node.js untuk **SSO Pemerintah Kota Gorontalo** (penyedia OpenID Connect). Paket ini ditujukan bagi pengembang aplikasi di lingkungan OPD Kota Gorontalo yang ingin menambahkan "Masuk dengan SSO" ke aplikasi Express, Next.js (Auth.js), Vue, maupun API.

- Dibangun di atas [`openid-client`](https://github.com/panva/openid-client) v6 (alur OIDC, PKCE, validasi ID token) dan [`jose`](https://github.com/panva/jose) (verifikasi access token dan logout token, rotasi kunci JWKS otomatis).
- ESM + deklarasi TypeScript, Node.js >= 20.
- Subpath: `@gorontalokota/sso` (inti), `@gorontalokota/sso/express`, `@gorontalokota/sso/next`, `@gorontalokota/sso/vue`.

## Daftar isi

1. [Konsep singkat](#konsep-singkat)
2. [Instalasi](#instalasi)
3. [Mendaftarkan aplikasi di admin SSO](#mendaftarkan-aplikasi-di-admin-sso)
4. [Variabel lingkungan](#variabel-lingkungan)
5. [API inti](#api-inti)
6. [Express](#express)
7. [Next.js (App Router + Auth.js)](#nextjs-app-router--authjs)
8. [Vue + Express (BFF)](#vue--express-bff)
9. [Verifikasi access token di API (Bearer)](#verifikasi-access-token-di-api-bearer)
10. [Back-channel logout dan `LogoutRegistry`](#back-channel-logout-dan-logoutregistry)
11. [Catatan keamanan dan produksi](#catatan-keamanan-dan-produksi)

## Konsep singkat

SSO memiliki **dua realm**, masing-masing issuer tersendiri:

| Realm      | Pengguna                | Issuer produksi                                  |
| ---------- | ----------------------- | ------------------------------------------------ |
| `internal` | ASN / pegawai Pemkot    | `https://sso.gorontalokota.go.id/internal`       |
| `external` | Warga                   | `https://sso.gorontalokota.go.id/external`       |

Aturan server yang perlu diketahui:

- Hanya `response_type=code` dengan **PKCE S256 wajib** (SDK mengurus ini).
- ID token dan access token ditandatangani RS256; kunci dirotasi (JWKS bisa berisi beberapa kunci). SDK mengambil ulang JWKS otomatis bila menemukan `kid` baru.
- Access token adalah JWT (`typ: at+jwt`) berumur 10–15 menit, `aud` = `client_id` aplikasi yang memintanya.
- **Endpoint token tidak mendukung CORS.** Aplikasi SPA (Vue, React) tidak bisa menukar code langsung dari browser. Pola yang dipakai: **BFF (backend-for-frontend)**. Backend aplikasi Anda yang login ke SSO dan menyimpan token di sesi server; frontend cukup memakai cookie sesi. **Token tidak pernah disimpan di browser.**

Scope yang tersedia:

| Scope        | Realm    | Claim                                                                                       |
| ------------ | -------- | ------------------------------------------------------------------------------------------- |
| `openid`     | keduanya | `sub`, `sid`, `auth_time`                                                                   |
| `profile`    | keduanya | `name`, `preferred_username` (realm internal: NIP)                                          |
| `email`      | keduanya | `email`, `email_verified`                                                                   |
| `employee`     | internal | `nip`, `organization_code`, `organization_name`, `position`, `grade`, `employment_status` |
| `phone`      | keduanya | `phone_number` (E.164), `phone_number_verified`                  |
| `photo`      | internal | `photo` (nama berkas foto), `picture` (URL foto, bila diatur server SSO) |
| `verification` | external | `verification_level` (`L1`/`L2`)                                                          |
| `nik`        | keduanya | `nik`. Scope terbatas, harus diizinkan admin SSO untuk klien Anda.                          |

## Instalasi

```bash
npm install @gorontalokota/sso
# Express:
npm install express express-session
# Next.js:
npm install next-auth@beta
# Vue (frontend):
npm install vue
```

`express`, `express-session`, `next-auth`, dan `vue` adalah *optional peer dependency*. Pasang hanya yang Anda pakai.

## Mendaftarkan aplikasi di admin SSO

Minta admin SSO (Diskominfo) membuatkan klien, atau buat sendiri di panel admin SSO bila Anda punya akses. Isian yang diperlukan:

| Isian                        | Contoh (Express / Vue BFF)                          | Contoh (Next.js + Auth.js)                                       |
| ---------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Realm                        | `internal` (ASN) atau `external` (warga)            | sama                                                             |
| Tipe klien                   | *Confidential* (punya client secret)                | *Confidential*                                                   |
| Redirect URI                 | `https://app.gorontalokota.go.id/sso/callback`      | `https://app.gorontalokota.go.id/api/auth/callback/gorontalokota-sso` |
| Back-channel logout URI      | `https://app.gorontalokota.go.id/sso/backchannel-logout` | `https://app.gorontalokota.go.id/api/sso/backchannel-logout`  |
| Post logout redirect URI     | `https://app.gorontalokota.go.id/`                  | `https://app.gorontalokota.go.id/`                               |
| Scope                        | `openid profile email employee`                          | sama                                                             |

Setelah disimpan Anda mendapat `client_id` (mis. `internal-k3j...`) dan `client_secret`. **Client secret hanya ditampilkan sekali**; simpan di secret manager / `.env` server, jangan pernah di kode frontend.

Untuk pengembangan lokal daftarkan juga URI `http://localhost:3000/...` pada klien terpisah (klien pengembangan).

## Variabel lingkungan

```dotenv
# Pilih salah satu: SSO_ISSUER lengkap, atau SSO_REALM (+ SSO_BASE_URL opsional)
SSO_ISSUER=https://sso.gorontalokota.go.id/internal
SSO_CLIENT_ID=internal-xxxxxxxxxxxxxxxxxxxxxxxx
SSO_CLIENT_SECRET=rahasia-dari-admin-sso
SSO_REDIRECT_URI=https://app.gorontalokota.go.id/sso/callback
SSO_POST_LOGOUT_REDIRECT_URI=https://app.gorontalokota.go.id/
SESSION_SECRET=string-acak-panjang-minimal-32-karakter

# Next.js (Auth.js)
AUTH_SECRET=string-acak-panjang     # npx auth secret
AUTH_URL=https://app.gorontalokota.go.id
```

## API inti

```ts
import {
  createSsoClient, issuerFor, toSsoUser, MemoryLogoutRegistry,
  type Realm, type SsoUser, type TokenSet, type LogoutRegistry,
} from '@gorontalokota/sso';

const sso = createSsoClient({
  issuer: issuerFor('internal'),            // atau process.env.SSO_ISSUER
  clientId: process.env.SSO_CLIENT_ID!,
  clientSecret: process.env.SSO_CLIENT_SECRET, // kosongkan untuk klien publik
  redirectUri: process.env.SSO_REDIRECT_URI,
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI,
  scopes: ['openid', 'profile', 'email', 'employee'], // default: openid profile email
  // audiences: [...]        // aud yang diterima verifyAccessToken (default [clientId])
  // clockTolerance: 60      // detik
});
```

| Fungsi / method                                             | Keterangan |
| ----------------------------------------------------------- | ---------- |
| `issuerFor(realm, base?)`                                   | URL issuer realm. `base` default `https://sso.gorontalokota.go.id`. |
| `createSsoClient(config)`                                   | Membuat klien. Discovery dilakukan saat pertama dipakai lalu di-cache. |
| `createAuthorizationRequest(opts?)`                         | `{ url, state, nonce, codeVerifier }`. Simpan `state`, `nonce`, `codeVerifier` di sesi server, arahkan browser ke `url`. `opts`: `scopes`, `prompt` (`none`/`login`/`consent`), `loginHint`, `maxAge`, `extraParams`. |
| `handleCallback(currentUrl, pending)`                       | Validasi `state`, tukar code (PKCE), validasi ID token (tanda tangan, `iss`, `aud`, `exp`, `nonce`, `at_hash`). Mengembalikan `TokenSet` (`accessToken`, `idToken`, `refreshToken`, `expiresAt`, `claims`). |
| `refresh(refreshToken)`                                     | Tukar refresh token (server merotasi refresh token, simpan yang baru). |
| `userinfo(accessToken, expectedSubject?)`                   | Memanggil endpoint userinfo. |
| `logoutUrl({ idTokenHint?, state? })`                       | URL end-session SSO (`/logout`), termasuk `post_logout_redirect_uri` yang terdaftar. |
| `revoke(token, hint?)`                                      | Revokasi access/refresh token. |
| `verifyAccessToken(jwt, { requiredScopes? })`               | Verifikasi access token JWT (`typ` `at+jwt`, tanda tangan, `iss`, `aud` ∈ `audiences`, `exp`). Melempar `InsufficientScopeError` bila scope kurang. |
| `verifyLogoutToken(jwt)`                                    | Verifikasi logout token back-channel sesuai spesifikasi (`typ` `logout+jwt`, `events`, tanpa `nonce`, ada `sub` atau `sid`, `iat` dalam toleransi). |
| `toSsoUser(claims)`                                         | Memetakan claim ke `SsoUser` (`sub`, `name`, `preferredUsername`, `email`, `nip`, `organizationCode`, `organizationName`, `position`, `grade`, `employmentStatus`, `photo`, `picture`, `phoneNumber`, `phoneNumberVerified`, `verificationLevel`, `nik`, `realm`, `raw`). |

Kelas error (semuanya turunan `SsoError`, punya properti `code`): `StateMismatchError`, `AuthorizationError`, `AuthorizationDeniedError` (`error=access_denied`), `TokenRequestError`, `InvalidTokenError`, `InsufficientScopeError`, `DiscoveryError`, `SsoConfigurationError`.

> Pengembangan lokal dengan SSO di `http://` (mis. `http://sso.test/internal`): tambahkan `allowInsecureRequests: true`. Jangan pernah dipakai di produksi.

## Express

`createSsoRouter` memasang rute berikut (umumnya di `/sso`):

| Rute                         | Fungsi |
| ---------------------------- | ------ |
| `GET /login?returnTo=/path`  | Membuat permintaan otorisasi, menyimpannya di `req.session`, mengalihkan ke SSO. `returnTo` hanya menerima path relatif same-origin (mencegah *open redirect*). |
| `GET /callback`              | Menyelesaikan login, membuat sesi baru (`session.regenerate`), mengalihkan ke `returnTo`. |
| `POST /logout`               | Revokasi refresh token, hapus sesi, alihkan (303) ke end-session SSO. Bila `Accept: application/json`, membalas `{ redirectTo }`. |
| `POST /backchannel-logout`   | Menerima `logout_token` dari SSO, memverifikasi, mencatat di `registry`. Membalas 200 (atau 400 bila token tidak valid) dengan `Cache-Control: no-store`. |
| `GET /user`                  | `{ user }` pengguna saat ini, atau 401 `{ user: null }`. Dipakai composable Vue. |

```ts
// server.ts
import express from 'express';
import session from 'express-session';
import { createSsoClient } from '@gorontalokota/sso';
import { createSsoRouter, getAccessToken } from '@gorontalokota/sso/express';

const app = express();
app.set('trust proxy', 1); // bila di belakang Nginx / load balancer

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    // store: new RedisStore({ client: redis }), // wajib untuk produksi (lihat di bawah)
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // WAJIB 'lax' (bukan 'strict') agar cookie terkirim saat kembali dari SSO
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

const ssoClient = createSsoClient({
  issuer: process.env.SSO_ISSUER!,
  clientId: process.env.SSO_CLIENT_ID!,
  clientSecret: process.env.SSO_CLIENT_SECRET,
  redirectUri: process.env.SSO_REDIRECT_URI!, // https://app.../sso/callback
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI,
  scopes: ['openid', 'profile', 'email', 'employee'],
});

const sso = createSsoRouter({
  client: ssoClient,
  // registry: new RedisLogoutRegistry(redis), // produksi dengan >1 instance
  afterLoginRedirect: '/dashboard',
  async onLogin(user, tokens, req) {
    // Opsional: tolak login atau sinkronkan data pengguna lokal.
    if (user.realm !== 'internal') {
      throw new Error('Aplikasi ini khusus ASN');
    }
    // await db.users.upsert({ sub: user.sub, nip: user.nip, nama: user.name, opd: user.organizationCode });
  },
});

app.use('/sso', sso);

// Halaman yang butuh login. Untuk request biasa: redirect ke /sso/login?returnTo=...
// Untuk XHR / Accept: application/json: 401 JSON.
app.get('/dashboard', sso.requireAuth, (req, res) => {
  res.send(`Halo ${req.ssoUser!.name} (${req.ssoUser!.opdNama})`);
});

// Memanggil API lain atas nama pengguna: token di-refresh otomatis bila hampir kedaluwarsa.
app.get('/api/rekap', sso.requireAuth, async (req, res) => {
  const accessToken = await getAccessToken(req, ssoClient);
  if (!accessToken) return res.status(401).json({ error: 'unauthenticated' });
  const data = await fetch('https://api-lain.gorontalokota.go.id/rekap', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  res.json(await data.json());
});

app.listen(3000);
```

Tombol logout di template HTML (harus POST):

```html
<form method="post" action="/sso/logout">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
  <button type="submit">Keluar</button>
</form>
```

Data yang disimpan router di `req.session.sso`: `{ user: SsoUser, tokens: { accessToken, idToken, refreshToken, expiresAt, ... }, sid, authTime }`. Token hanya ada di sesi server.

`requireAuth` juga tersedia sebagai fungsi mandiri: `requireAuth({ registry, loginPath: '/sso/login' })`.

## Next.js (App Router + Auth.js)

Gunakan provider `GorontalokotaSso` untuk Auth.js (next-auth v5). Provider sudah mengaktifkan `checks: ['pkce', 'state', 'nonce']` dan memetakan profil ke field `SsoUser` (dengan `id = sub`).

```ts
// lib/sso.ts
import { createSsoClient, issuerFor, MemoryLogoutRegistry } from '@gorontalokota/sso';

export const ssoClient = createSsoClient({
  issuer: issuerFor('internal'),
  clientId: process.env.SSO_CLIENT_ID!,
  clientSecret: process.env.SSO_CLIENT_SECRET,
  redirectUri: `${process.env.AUTH_URL}/api/auth/callback/gorontalokota-sso`,
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI,
});

// Produksi / serverless: gunakan registry bersama (Redis), lihat bagian LogoutRegistry.
export const logoutRegistry = new MemoryLogoutRegistry();
```

```ts
// auth.ts
import NextAuth from 'next-auth';
import { GorontalokotaSso, isSessionEnded } from '@gorontalokota/sso/next';
import { TokenRequestError } from '@gorontalokota/sso';
import { logoutRegistry, ssoClient } from '@/lib/sso';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GorontalokotaSso({
      realm: 'internal',
      clientId: process.env.SSO_CLIENT_ID!,
      clientSecret: process.env.SSO_CLIENT_SECRET!,
      scopes: ['openid', 'profile', 'email', 'employee'],
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      // 1. Saat login: simpan sid, auth_time, dan token SSO di JWT (cookie terenkripsi, httpOnly).
      if (account && profile) {
        return {
          ...token,
          sub: profile.sub ?? token.sub,
          sid: profile.sid as string | undefined,
          authTime: (profile.auth_time as number | undefined) ?? Math.floor(Date.now() / 1000),
          nip: profile.nip as string | undefined,
          organizationCode: profile.organization_code as string | undefined,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at, // detik epoch
        };
      }

      // 2. Setiap request: sesi SSO sudah diakhiri (back-channel logout)? -> keluarkan.
      if (
        await isSessionEnded(logoutRegistry, {
          sub: token.sub,
          sid: token.sid as string | undefined,
          authenticatedAt: token.authTime as number | undefined,
        })
      ) {
        return null; // Auth.js menghapus sesi
      }

      // 3. Access token masih berlaku (sisa > 60 detik).
      if (typeof token.expiresAt === 'number' && Date.now() / 1000 < token.expiresAt - 60) {
        return token;
      }

      // 4. Rotasi token: refresh token SSO sekali pakai, simpan yang baru.
      if (!token.refreshToken) return null;
      try {
        const refreshed = await ssoClient.refresh(token.refreshToken as string);
        return {
          ...token,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? token.refreshToken,
          idToken: refreshed.idToken ?? token.idToken,
          expiresAt: refreshed.expiresAt,
        };
      } catch (error) {
        if (error instanceof TokenRequestError && error.error === 'invalid_grant') return null;
        return { ...token, error: 'RefreshTokenError' };
      }
    },
    async session({ session, token }) {
      // Jangan memasukkan accessToken/refreshToken/idToken ke session: objek ini terkirim ke browser.
      session.user.id = token.sub!;
      Object.assign(session.user, { nip: token.nip, organizationCode: token.organizationCode });
      return session;
    },
  },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

```ts
// app/api/sso/backchannel-logout/route.ts   (daftarkan sebagai back-channel logout URI)
import { createBackchannelLogoutHandler } from '@gorontalokota/sso/next';
import { logoutRegistry, ssoClient } from '@/lib/sso';

export const POST = createBackchannelLogoutHandler({ client: ssoClient, registry: logoutRegistry });
export const dynamic = 'force-dynamic';
```

Logout global (keluar dari aplikasi sekaligus dari SSO):

```ts
// app/api/sso/logout/route.ts
import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/auth';
import { ssoClient } from '@/lib/sso';

export async function POST(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET!,
    secureCookie: process.env.NODE_ENV === 'production',
  });
  await signOut({ redirect: false });
  const url = await ssoClient.logoutUrl({ idTokenHint: token?.idToken as string | undefined });
  return NextResponse.redirect(url, 303);
}
```

```tsx
// komponen
<form action="/api/sso/logout" method="post"><button>Keluar</button></form>
```

Login: `await signIn('gorontalokota-sso', { redirectTo: '/dashboard' })` di server action, atau `signIn('gorontalokota-sso')` dari `next-auth/react`.

Untuk dua realm dalam satu aplikasi, buat dua provider dengan `id` berbeda (`GorontalokotaSso({ id: 'sso-warga', realm: 'external', ... })`) dan daftarkan redirect URI masing-masing.

## Vue + Express (BFF)

Frontend Vue **tidak** berbicara langsung dengan SSO. Backend Express (contoh di atas) menangani login; Vue hanya memanggil `/sso/user` dengan cookie sesi.

```ts
// vite.config.ts (pengembangan): teruskan /sso dan /api ke backend agar cookie same-origin
export default defineConfig({
  server: {
    proxy: {
      '/sso': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
    },
  },
});
```

Pada produksi sajikan frontend dan backend di domain yang sama (mis. Nginx: `/` → build Vue, `/sso` dan `/api` → Express).

```vue
<!-- App.vue -->
<script setup lang="ts">
import { useSso } from '@gorontalokota/sso/vue';

const { user, loading, error, isAuthenticated, login, logout } = useSso({
  baseUrl: '/sso',
  // Bila backend memakai CSRF (mis. csrf-csrf / csurf):
  // csrfToken: () => document.querySelector<HTMLMetaElement>('meta[name=csrf-token]')?.content,
  // csrfFieldName: '_csrf',            // dikirim sebagai field form (default)
  // csrfHeaderName: 'X-CSRF-Token',    // atau sebagai header (logout via fetch)
});
</script>

<template>
  <div>
    <p v-if="loading">Memuat…</p>
    <p v-else-if="error">Gagal memuat sesi: {{ error.message }}</p>
    <template v-else-if="isAuthenticated">
      <p>Selamat datang, {{ user?.name }} ({{ user?.opdNama }})</p>
      <button @click="logout()">Keluar</button>
    </template>
    <button v-else @click="login()">Masuk dengan SSO</button>
  </div>
</template>
```

`useSso()` mengembalikan `{ user, loading, error, isAuthenticated, refresh(), login(returnTo?), logout() }`:

- `refresh()` → `GET {baseUrl}/user` dengan `credentials: 'include'`. 401 berarti belum login (bukan error).
- `login(returnTo?)` → redirect halaman penuh ke `{baseUrl}/login?returnTo=` (default: path saat ini).
- `logout()` → POST form ke `{baseUrl}/logout` (bisa membawa token CSRF), lalu browser diarahkan ke end-session SSO.

Setiap pemanggilan `useSso()` punya state sendiri; untuk berbagi state, panggil sekali (mis. di store Pinia atau `provide()` di root).

Contoh guard Vue Router:

```ts
const sso = useSso({ immediate: false });
router.beforeEach(async (to) => {
  if (to.meta.requiresAuth && !(await sso.refresh())) {
    sso.login(to.fullPath);
    return false;
  }
});
```

## Verifikasi access token di API (Bearer)

Access token SSO adalah JWT `at+jwt` dengan `aud` = `client_id` aplikasi yang meminta token. API yang menerima token dari aplikasi lain harus mendaftarkan `client_id` aplikasi-aplikasi tersebut di `audiences`.

```ts
import express from 'express';
import { createSsoClient, issuerFor } from '@gorontalokota/sso';
import { requireToken } from '@gorontalokota/sso/express';

const ssoClient = createSsoClient({
  issuer: issuerFor('internal'),
  clientId: process.env.SSO_CLIENT_ID!,
  audiences: ['internal-aplikasi-kepegawaian', 'internal-aplikasi-absensi'],
});

const app = express();

app.get('/api/pegawai/saya', requireToken({ client: ssoClient, scopes: ['employee'] }), (req, res) => {
  // req.sso: { sub, client_id, scope, scopes, realm, sid, exp, ... }
  res.json({ sub: req.sso!.sub, scopes: req.sso!.scopes });
});
```

- Tanpa token / token tidak valid → `401` + `WWW-Authenticate: Bearer error="invalid_token"`.
- Scope kurang → `403` + `WWW-Authenticate: Bearer error="insufficient_scope"`.
- Opsi `registry` menolak token milik sesi SSO yang sudah di-logout lewat back-channel.

Framework lain (Fastify, Hono, NestJS):

```ts
import { InsufficientScopeError, InvalidTokenError } from '@gorontalokota/sso';

try {
  const claims = await ssoClient.verifyAccessToken(bearerToken, { requiredScopes: ['employee'] });
} catch (error) {
  if (error instanceof InsufficientScopeError) { /* 403 */ }
  else if (error instanceof InvalidTokenError) { /* 401 */ }
  else throw error;
}
```

Access token tidak berisi profil lengkap. Bila API butuh data pengguna, panggil `ssoClient.userinfo(accessToken)`.

## Back-channel logout dan `LogoutRegistry`

Saat pengguna keluar dari SSO (atau admin mengakhiri sesinya), server SSO mengirim `POST logout_token=...` ke back-channel logout URI setiap aplikasi. Router Express (`/sso/backchannel-logout`) dan `createBackchannelLogoutHandler` (Next.js) memverifikasi token lalu memanggil `registry.markEnded(claims)`. Pada request berikutnya `requireAuth`, `/sso/user`, atau `isSessionEnded` memeriksa registry dan menghapus sesi lokal.

Semantik:

- Logout token berisi `sid` → hanya sesi SSO tersebut yang berakhir.
- Logout token hanya berisi `sub` → semua sesi pengguna itu yang diautentikasi pada atau sebelum `iat` token berakhir.

`MemoryLogoutRegistry` menyimpan data di memori proses, **hanya cocok untuk satu instance**. Dengan beberapa instance (PM2 cluster, beberapa container, serverless/Vercel) notifikasi bisa diterima instance A sementara pengguna dilayani instance B. Gunakan penyimpanan bersama, misalnya Redis:

```ts
// redis-logout-registry.ts
import { createClient } from 'redis';
import type { LogoutRegistry, LogoutTokenClaims, SessionLookup } from '@gorontalokota/sso';

const TTL_SECONDS = 7 * 24 * 3600; // >= umur sesi terpanjang aplikasi Anda

export class RedisLogoutRegistry implements LogoutRegistry {
  constructor(private redis: ReturnType<typeof createClient>, private prefix = 'sso:logout') {}

  async markEnded(claims: Pick<LogoutTokenClaims, 'sub' | 'sid' | 'iat'>): Promise<void> {
    if (claims.sid) {
      await this.redis.set(`${this.prefix}:sid:${claims.sid}`, '1', { EX: TTL_SECONDS });
      return;
    }
    if (claims.sub) {
      const key = `${this.prefix}:sub:${claims.sub}`;
      const previous = Number(await this.redis.get(key)) || 0;
      await this.redis.set(key, String(Math.max(previous, claims.iat)), { EX: TTL_SECONDS });
    }
  }

  async isEnded({ sub, sid, authenticatedAt }: SessionLookup): Promise<boolean> {
    if (sid && (await this.redis.exists(`${this.prefix}:sid:${sid}`))) return true;
    if (sub) {
      const endedAt = await this.redis.get(`${this.prefix}:sub:${sub}`);
      if (endedAt !== null) return authenticatedAt === undefined || authenticatedAt <= Number(endedAt);
    }
    return false;
  }
}

// pemakaian
const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();
const sso = createSsoRouter({ client: ssoClient, registry: new RedisLogoutRegistry(redis) });
```

## Catatan keamanan dan produksi

- **Jangan simpan token di browser** (localStorage, sessionStorage, cookie yang bisa dibaca JS). Semua token ada di sesi server.
- **Store sesi**: `MemoryStore` bawaan express-session tidak untuk produksi. Gunakan `connect-redis`, `connect-pg-simple`, dsb.
- **Cookie sesi**: `httpOnly`, `secure` (HTTPS), `sameSite: 'lax'`. Di belakang reverse proxy set `app.set('trust proxy', 1)`.
- **CSRF**: `POST /sso/logout` sebaiknya dilindungi middleware CSRF aplikasi. **Kecualikan** `POST /sso/backchannel-logout` (dipanggil server SSO, bukan browser) dari CSRF dan dari middleware autentikasi.
- **Open redirect**: `returnTo` hanya menerima path relatif (`/laporan?x=1`); URL absolut dan `//host` diabaikan.
- **Session fixation**: ID sesi diganti setelah login berhasil.
- **Scope `nik`** bersifat terbatas; minta hanya bila benar-benar diperlukan dan sudah disetujui.
- **Autentikasi klien**: SDK mengirim client secret dengan `client_secret_post` secara default. Server SSO tidak men-decode URL kredensial HTTP Basic, sedangkan `client_id` mengandung `-`; opsi `tokenEndpointAuthMethod: 'client_secret_basic'` tersedia dan mengirim kredensial tanpa form-encoding.
- **Waktu server**: toleransi jam default 60 detik. Pastikan server memakai NTP.

## Lisensi

MIT
