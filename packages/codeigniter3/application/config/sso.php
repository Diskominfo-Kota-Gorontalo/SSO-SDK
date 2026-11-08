<?php
defined('BASEPATH') or exit('No direct script access allowed');

/*
| SSO Pemerintah Kota Gorontalo. Butuh PHP 8.1+ dan:
|   composer require gorontalokota/sso-php
|   $config['composer_autoload'] = FCPATH.'vendor/autoload.php';  (application/config/config.php)
*/

// "internal" (ASN) atau "external" (masyarakat).
$config['sso_realm'] = getenv('SSO_REALM') ?: 'internal';
$config['sso_base_url'] = getenv('SSO_BASE_URL') ?: 'https://sso.gorontalokota.go.id';
$config['sso_client_id'] = getenv('SSO_CLIENT_ID') ?: '';
$config['sso_client_secret'] = getenv('SSO_CLIENT_SECRET') ?: '';
$config['sso_scopes'] = 'openid profile email';

// Kosong = site_url('sso/callback') dan base_url(). Harus sama dengan yang didaftarkan di SSO.
$config['sso_redirect_uri'] = '';
$config['sso_post_logout_redirect_uri'] = '';

// Tujuan setelah login berhasil.
$config['sso_home'] = '/';

// Cache discovery/JWKS dan daftar sesi yang diakhiri (back-channel logout). Folder harus bisa ditulis.
$config['sso_cache_dir'] = APPPATH.'cache/sso';
