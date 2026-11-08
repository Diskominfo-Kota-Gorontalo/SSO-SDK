# SDK SSO Pemerintah Kota Gorontalo

Library resmi untuk menghubungkan aplikasi OPD ke **SSO Pemerintah Kota Gorontalo** (OpenID Connect). Cukup dipasang dan diisi kredensial, tanpa menulis ulang alur login, verifikasi token, atau logout.

| Aplikasi Anda | Paket | Panduan |
|---|---|---|
| Laravel 10–13 | `composer require gorontalokota/sso-laravel` | [packages/laravel](packages/laravel/README.md) |
| CodeIgniter 4 | `composer require gorontalokota/sso-codeigniter4` | [packages/codeigniter4](packages/codeigniter4/README.md) |
| CodeIgniter 3 | `composer require gorontalokota/sso-php` + salin 3 file | [packages/codeigniter3](packages/codeigniter3/README.md) |
| PHP native | `composer require gorontalokota/sso-php` | [packages/php-core](packages/php-core/README.md), [contoh](examples/php-native) |
| Node.js / Express | `npm i @gorontalokota/sso` | [packages/node](packages/node/README.md) |
| Next.js (Auth.js) | `npm i @gorontalokota/sso next-auth@beta` | [packages/node](packages/node/README.md#nextjs-app-router--authjs) |
| Vue (SPA) | `npm i @gorontalokota/sso` + backend di atas | [packages/node](packages/node/README.md#vue--express-bff) |
| API (resource server) | Guard `sso` Laravel, filter `ssotoken` CI4, atau `requireToken` Express | panduan masing-masing |

Semua paket membutuhkan **PHP 8.1+** atau **Node.js 20+**.

## Langkah integrasi

1. **Pilih realm.** `internal` untuk aplikasi ASN Pemerintah Kota Gorontalo, `external` untuk layanan masyarakat. Satu aplikasi memakai satu realm.
2. **Daftarkan aplikasi** di portal pengembang SSO (menu *Portal Pengembang*). Isi:
   - **Redirect URI**: `https://aplikasi-anda.go.id/sso/callback`
   - **Back-channel logout URI**: `https://aplikasi-anda.go.id/sso/backchannel-logout`
   - **Post logout redirect URI**: `https://aplikasi-anda.go.id/`
   - **Scope**: hanya yang benar-benar dibutuhkan (lihat tabel di bawah).
3. **Terima Client ID dan secret** dari Diskominfo lewat kanal resmi. Simpan di `.env`, jangan di kode atau repositori.
4. **Pasang paket** sesuai tabel di atas, lalu arahkan tombol "Masuk" ke `/sso/login`.
5. **Tautkan akun lokal lewat `sub`.** NIP atau NIK hanya dipakai **sekali** untuk menemukan akun lama, lalu simpan `sub` di tabel users. `sub` adalah kode acak yang stabil; NIP/NIK bisa salah ketik atau berubah.

## Scope dan data yang diterima

| Realm | Scope | Klaim |
|---|---|---|
| internal | `openid` (wajib) | `sub` |
| internal | `profile` | `name`, `preferred_username` (= NIP) |
| internal | `email` | `email` (email dinas) |
| internal | `asn` | `nip`, `opd_kode`, `opd_nama`, `jabatan`, `golongan`, `status_kepegawaian` |
| external | `profile` | `name` |
| external | `email`, `phone` | `email`, `phone_number` |
| external | `verifikasi` | `tingkat_akun` (`L1` daftar mandiri, `L2` NIK sudah dicek di loket) |
| external | `nik` | `nik` (data sensitif, perlu izin khusus Diskominfo) |

## Praktik yang diterapkan SDK ini

- **Authorization Code + PKCE (S256)** dengan `state` dan `nonce`, sesuai *OAuth 2.0 Security Best Current Practice*.
- **ID token dan access token diverifikasi** (tanda tangan RS256 via JWKS, issuer, audience, kedaluwarsa). Rotasi kunci SSO ditangani otomatis.
- **Token tidak pernah disimpan di browser.** Frontend Vue/Next memakai pola *backend-for-frontend*: browser hanya memegang cookie sesi aplikasi Anda.
- **Back-channel logout**: pengguna yang keluar di aplikasi lain, atau akunnya dinonaktifkan admin, otomatis keluar juga dari aplikasi Anda pada request berikutnya.
- **Proteksi open redirect**: parameter `return_to` hanya menerima path lokal.
- **Refresh token berotasi**: SDK selalu menyimpan refresh token terbaru.

## Pengujian tanpa server SSO

Paket PHP menyertakan `Gorontalokota\Sso\Testing\FakeProvider`, tiruan SSO lengkap (discovery, JWKS, token) untuk tes aplikasi Anda. Contoh pemakaian ada di [tes paket Laravel](packages/laravel/tests).

## Untuk pengelola repositori

Struktur monorepo:

```
packages/php-core      gorontalokota/sso-php           (Packagist)
packages/laravel       gorontalokota/sso-laravel       (Packagist)
packages/codeigniter4  gorontalokota/sso-codeigniter4  (Packagist)
packages/codeigniter3  file salin-tempel untuk CI3
packages/node          @gorontalokota/sso              (npm)
examples/php-native    contoh aplikasi PHP native
```

- **Packagist** membaca `composer.json` di root repositori, jadi setiap paket PHP perlu repositori baca-saja sendiri yang dipecah dari monorepo ini (mis. dengan `splitsh/lite` atau GitHub Action `symplify/monorepo-split`). Beri tag versi yang sama (`v0.1.0`) di setiap repositori.
- Blok `repositories` (path) di `composer.json` setiap paket hanya untuk pengembangan lokal dan diabaikan oleh aplikasi yang memasang paket.
- **npm**: `cd packages/node && npm publish` (sudah `access: public`).
- Menjalankan tes: `composer install && vendor/bin/phpunit` di setiap paket PHP, `npm install && npm test` di `packages/node`.
