# SDK SSO Pemerintah Kota Gorontalo

Library resmi untuk menghubungkan aplikasi OPD ke **SSO Pemerintah Kota Gorontalo** (OpenID Connect). Cukup dipasang dan diisi kredensial, tanpa menulis ulang alur login, verifikasi token, atau logout.

| Aplikasi Anda | Paket | Panduan |
|---|---|---|
| Laravel 12–13 (PHP 8.2+) | `composer require gorontalokota/sso-laravel` | [packages/laravel](packages/laravel/README.md) |
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
| internal | `phone` | `phone_number` (format E.164, mis. `+6281234567890`), `phone_number_verified` |
| internal | `nik` | `nik` (data sensitif, perlu izin khusus Diskominfo) |
| internal | `photo` | `photo` (nama berkas foto dari data kepegawaian), `picture` (URL foto, bila server SSO mengaturnya) |
| internal | `employee` | `nip`, `organization_code`, `organization_name`, `position`, `grade`, `employment_status` |
| external | `profile` | `name` |
| external | `email`, `phone` | `email`, `phone_number`, `phone_number_verified` |
| external | `verification` | `verification_level` (`L1` daftar mandiri, `L2` NIK sudah dicek di loket) |
| external | `nik` | `nik` (data sensitif, perlu izin khusus Diskominfo) |

### Nama lama (sebelum v0.2)

Scope `asn` dan `verifikasi` masih diterima server SSO dan otomatis diubah menjadi `employee` dan `verification`. Selama masa transisi, server juga mengirim klaim lama (`opd_kode`, `opd_nama`, `jabatan`, `golongan`, `status_kepegawaian`, `tingkat_akun`) di samping klaim baru, sehingga aplikasi dengan SDK v0.1 tetap berjalan. SDK v0.2 membaca nama baru dan memakai nama lama sebagai cadangan. Perbarui ke v0.2 sebelum klaim lama dimatikan.

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

Semua perubahan dikerjakan di monorepo ini. Repositori paket PHP (`sso-php`, `sso-laravel`, `sso-codeigniter4`) hanya cermin baca-saja yang diisi otomatis oleh GitHub Actions, karena Packagist membaca `composer.json` di root repositori.

- **CI** (`.github/workflows/ci.yml`): setiap push dan pull request menjalankan tes dan analisis statis paket PHP (versi PHP terendah yang didukung dan PHP 8.4) serta tes paket Node (Node 20 dan 22).
- **Rilis** (`.github/workflows/release.yml`): mendorong tag `vX.Y.Z` akan memeriksa versi, menjalankan CI, memecah setiap paket PHP ke repositorinya (branch `main` + tag yang sama), menerbitkan paket npm dengan provenance, lalu membuat GitHub Release.

### Persiapan sekali saja

1. Buat repositori publik kosong di organisasi: `sso-php`, `sso-laravel`, `sso-codeigniter4`.
2. Buat *fine-grained personal access token* (pemilik: organisasi) dengan akses ke ketiga repositori itu, izin **Contents: Read and write**. Simpan sebagai secret `SPLIT_TOKEN` di repositori monorepo.
3. Di npmjs.com, buat organisasi `gorontalokota` dan *granular access token* dengan izin publish untuk scope `@gorontalokota`. Simpan sebagai secret `NPM_TOKEN`.
4. Setelah rilis pertama, daftarkan tiga repositori paket di packagist.org/packages/submit (urut: `sso-php` dulu), dengan akun pemilik vendor `gorontalokota`. Hubungkan Packagist ke organisasi GitHub agar update berjalan otomatis.

### Membuat rilis

```bash
# 1. Naikkan versi npm dan, bila versi minor/mayor berubah, versi sso-php yang diminta paket Laravel dan CI4
cd packages/node && npm version 0.2.0 --no-git-tag-version && cd ../..
#    packages/laravel/composer.json dan packages/codeigniter4/composer.json: "gorontalokota/sso-php": "^0.2"
.github/scripts/check-versions.sh v0.2.0        # harus "Versi cocok"

# 2. Commit, push, lalu tag
git commit -am "Rilis v0.2.0" && git push origin main
git tag v0.2.0 && git push origin v0.2.0
```

Bila pemeriksaan versi gagal, tidak ada yang diterbitkan; perbaiki versinya, hapus tag (`git push origin :refs/tags/v0.2.0`), lalu tag ulang.

### Pengembangan lokal

Blok `repositories` (path) di `composer.json` setiap paket hanya untuk pengembangan lokal dan diabaikan oleh aplikasi yang memasang paket. Menjalankan tes: `composer install && vendor/bin/phpunit` di setiap paket PHP, `npm install && npm test` di `packages/node`.
