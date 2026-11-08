<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Config;

use CodeIgniter\Config\BaseConfig;

/**
 * Konfigurasi SSO. Semua nilai bisa diisi dari .env, mis.:
 *   sso.realm = internal
 *   sso.clientId = ...
 *   sso.clientSecret = ...
 * Atau salin file ini ke app/Config/Sso.php (namespace Config, extends kelas ini) untuk menimpa.
 */
class Sso extends BaseConfig
{
    /** "internal" (ASN) atau "external" (masyarakat). */
    public string $realm = 'internal';

    public string $baseUrl = 'https://sso.gorontalokota.go.id';

    /** Isi hanya untuk menimpa issuer (mis. staging). */
    public string $issuer = '';

    public string $clientId = '';

    public string $clientSecret = '';

    /** Dipisah spasi. */
    public string $scopes = 'openid profile email';

    /** Kosong = site_url('sso/callback'). Harus sama dengan yang didaftarkan di SSO. */
    public string $redirectUri = '';

    /** Kosong = base_url('/'). */
    public string $postLogoutRedirectUri = '';

    /** Tujuan setelah login berhasil bila tidak ada return_to. */
    public string $home = '/';

    /** Prefix route bawaan (/sso/login, /sso/callback, /sso/logout, /sso/backchannel-logout, /sso/user). */
    public string $routePrefix = 'sso';

    /** Daftarkan route bawaan otomatis. */
    public bool $routes = true;

    /**
     * Folder cache discovery/JWKS dan daftar sesi yang diakhiri (back-channel logout).
     * Kosong = WRITEPATH . 'cache/sso'. Bila aplikasi berjalan di beberapa server, pakai folder bersama.
     */
    public string $cacheDirectory = '';

    /** client_id yang access token-nya diterima filter API (dipisah koma). Kosong = clientId aplikasi ini. */
    public string $apiAudiences = '';
}
