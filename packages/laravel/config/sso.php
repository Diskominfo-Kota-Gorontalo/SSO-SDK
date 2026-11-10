<?php

use Gorontalokota\Sso\Laravel\Auth\EloquentUserResolver;

return [

    /*
    |--------------------------------------------------------------------------
    | Realm dan issuer
    |--------------------------------------------------------------------------
    | "internal" untuk ASN Pemerintah Kota Gorontalo, "external" untuk masyarakat.
    | Issuer = base_url + "/" + realm. Isi SSO_ISSUER hanya bila perlu menimpa (mis. staging).
    */
    'realm' => env('SSO_REALM', 'internal'),
    'base_url' => env('SSO_BASE_URL', 'https://sso.gorontalokota.go.id'),
    'issuer' => env('SSO_ISSUER'),

    /*
    |--------------------------------------------------------------------------
    | Kredensial klien (dari Diskominfo setelah aplikasi didaftarkan)
    |--------------------------------------------------------------------------
    */
    'client_id' => env('SSO_CLIENT_ID'),
    'client_secret' => env('SSO_CLIENT_SECRET'),

    /*
     * Scope yang diminta. Internal: openid profile email employee. External: openid profile email phone verification (nik perlu izin khusus).
     */
    'scopes' => env('SSO_SCOPES', 'openid profile email'),

    /*
     * Kosongkan untuk memakai route bawaan: {APP_URL}/sso/callback dan {APP_URL}/.
     * Nilai ini harus sama persis dengan yang didaftarkan di panel admin SSO.
     */
    'redirect_uri' => env('SSO_REDIRECT_URI'),
    'post_logout_redirect_uri' => env('SSO_POST_LOGOUT_REDIRECT_URI'),

    /*
    |--------------------------------------------------------------------------
    | Route bawaan
    |--------------------------------------------------------------------------
    | GET  /sso/login               mulai login (opsional ?return_to=/path)
    | GET  /sso/callback            redirect URI
    | POST /sso/logout              keluar dari aplikasi dan SSO
    | POST /sso/backchannel-logout  back-channel logout URI (tanpa CSRF/sesi)
    | GET  /sso/user                JSON pengguna aktif untuk frontend Vue/SPA (BFF)
    */
    'routes' => [
        'enabled' => true,
        'prefix' => 'sso',
        'middleware' => ['web'],
    ],

    /*
     * Guard sesi tempat pengguna lokal di-login-kan, dan tujuan setelah login berhasil.
     */
    'guard' => env('SSO_GUARD', 'web'),
    'home' => env('SSO_HOME', '/'),

    /*
     * Halaman yang dituju bila login gagal/ditolak (pesan ada di session flash "sso_error").
     * Null = halaman home.
     */
    'error_redirect' => env('SSO_ERROR_REDIRECT'),

    /*
    |--------------------------------------------------------------------------
    | Penautan akun lokal
    |--------------------------------------------------------------------------
    | Akun lokal ditautkan lewat kolom "sub_column" (klaim sub SSO, stabil dan acak).
    | match_by dipakai SEKALI untuk menautkan akun lama, mis. ['nip' => 'nip'] atau ['email' => 'email']
    | (klaim => kolom). Setelah tertaut, pencocokan selalu memakai sub.
    | create: buat akun lokal baru bila tidak ditemukan. sync: kolom yang diperbarui setiap login.
    */
    'user' => [
        'resolver' => EloquentUserResolver::class,
        'model' => env('SSO_USER_MODEL', 'App\\Models\\User'),
        'sub_column' => 'sso_sub',
        'match_by' => [],
        'create' => false,
        'sync' => ['name' => 'name'],
    ],

    /*
    |--------------------------------------------------------------------------
    | Guard API (bearer access token)
    |--------------------------------------------------------------------------
    | Tambahkan di config/auth.php: 'api' => ['driver' => 'sso', 'provider' => 'users'].
    | audiences: client_id yang tokennya diterima API ini (bawaan: client_id aplikasi ini).
    | load_user: true = cari pengguna lokal lewat kolom sub; false = pengguna dibangun dari klaim token.
    */
    'api' => [
        'audiences' => env('SSO_API_AUDIENCES'),
        'load_user' => false,
    ],

    /*
     * Periksa back-channel logout di setiap request grup "web" (disarankan). Pengguna yang sesinya
     * diakhiri dari SSO (keluar di aplikasi lain, akun dinonaktifkan) langsung keluar dari aplikasi ini.
     */
    'enforce_backchannel_logout' => true,

    /*
     * Cache untuk discovery, JWKS, dan daftar sesi yang diakhiri. Harus dipakai bersama oleh semua server
     * aplikasi (Redis/database). Null = store bawaan.
     */
    'cache_store' => env('SSO_CACHE_STORE'),

    'leeway' => 60,
    'http_timeout' => 10,
];
