<?php

declare(strict_types=1);

use Gorontalokota\Sso\Cache\FileCache;
use Gorontalokota\Sso\Logout\LogoutRegistry;
use Gorontalokota\Sso\Native\SsoAuth;
use Gorontalokota\Sso\SsoClient;
use Gorontalokota\Sso\SsoConfig;

require __DIR__.'/vendor/autoload.php';

$appUrl = rtrim(getenv('APP_URL') ?: 'http://localhost:8080', '/');

// Simpan kredensial di environment server, jangan di dalam kode.
$config = SsoConfig::fromArray([
    'realm' => getenv('SSO_REALM') ?: 'internal',               // internal (ASN) atau external (masyarakat)
    'base_url' => getenv('SSO_BASE_URL') ?: 'https://sso.gorontalokota.go.id',
    'client_id' => getenv('SSO_CLIENT_ID') ?: '',
    'client_secret' => getenv('SSO_CLIENT_SECRET') ?: '',
    'scopes' => 'openid profile email',
    'redirect_uri' => $appUrl.'/callback.php',
    'post_logout_redirect_uri' => $appUrl.'/',
]);

// Folder cache harus bisa ditulis web server dan TIDAK berada di folder publik.
$cache = new FileCache(__DIR__.'/storage/sso-cache');

$sso = new SsoAuth(new SsoClient($config, null, $cache), new LogoutRegistry($cache));

/** Escape output HTML. */
function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

/** Token CSRF sederhana untuk form logout. */
function csrf_token(): string
{
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
}
