<?php
defined('BASEPATH') or exit('No direct script access allowed');

use Gorontalokota\Sso\Cache\FileCache;
use Gorontalokota\Sso\Logout\LogoutRegistry;
use Gorontalokota\Sso\Native\SsoAuth;
use Gorontalokota\Sso\SsoClient;
use Gorontalokota\Sso\SsoConfig;
use Gorontalokota\Sso\SsoUser;

/**
 * Library SSO untuk CodeIgniter 3: $this->load->library('sso'); $this->sso->user();
 *
 * @mixin SsoAuth
 */
class Sso
{
    private SsoAuth $auth;

    public function __construct()
    {
        $ci = &get_instance();
        $ci->config->load('sso', true);
        $ci->load->library('session');
        $ci->load->helper('url');

        $setting = static fn (string $key): string => (string) $ci->config->item($key, 'sso');
        $cache = new FileCache($setting('sso_cache_dir'));

        $client = new SsoClient(SsoConfig::fromArray([
            'realm' => $setting('sso_realm'),
            'base_url' => $setting('sso_base_url'),
            'client_id' => $setting('sso_client_id'),
            'client_secret' => $setting('sso_client_secret'),
            'scopes' => $setting('sso_scopes'),
            'redirect_uri' => $setting('sso_redirect_uri') !== '' ? $setting('sso_redirect_uri') : site_url('sso/callback'),
            'post_logout_redirect_uri' => $setting('sso_post_logout_redirect_uri') !== '' ? $setting('sso_post_logout_redirect_uri') : base_url(),
        ]), null, $cache);

        $this->auth = new SsoAuth($client, new LogoutRegistry($cache));
    }

    /** Pengguna SSO yang sedang login, atau null (juga menerapkan back-channel logout). */
    public function user(): ?SsoUser
    {
        return $this->auth->user();
    }

    /** Arahkan ke halaman login SSO bila belum login. Panggil di constructor controller yang dilindungi. */
    public function require_login(): SsoUser
    {
        $user = $this->auth->user();

        if ($user !== null) {
            return $user;
        }

        $ci = &get_instance();

        if ($ci->input->is_ajax_request()) {
            $ci->output->set_status_header(401)->set_content_type('application/json')->set_output('{"message":"Unauthenticated."}')->_display();
            exit;
        }

        redirect(site_url('sso/login').'?return_to='.rawurlencode((string) $ci->input->server('REQUEST_URI')));
    }

    /**
     * @param  array<int, mixed>  $arguments
     */
    public function __call(string $method, array $arguments): mixed
    {
        return $this->auth->{$method}(...$arguments);
    }
}
