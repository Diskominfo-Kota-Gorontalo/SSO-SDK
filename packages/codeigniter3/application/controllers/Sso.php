<?php
defined('BASEPATH') or exit('No direct script access allowed');

use Gorontalokota\Sso\Exception\AuthorizationDeniedException;
use Gorontalokota\Sso\Exception\SsoException;

/**
 * Route SSO untuk CodeIgniter 3:
 *   GET  sso/login   GET sso/callback   POST sso/logout   POST sso/backchannel_logout   GET sso/user
 * Tambahkan 'sso/backchannel_logout' ke $config['csrf_exclude_uris'].
 * Di routes.php: $route['sso/backchannel-logout'] = 'sso/backchannel_logout';
 */
class Sso extends CI_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->library('sso');
    }

    public function login(): void
    {
        $returnTo = $this->input->get('return_to');
        redirect($this->sso->loginUrl(is_string($returnTo) ? $returnTo : null));
    }

    public function callback(): void
    {
        try {
            $user = $this->sso->handleCallback((array) $this->input->get());
        } catch (AuthorizationDeniedException $exception) {
            $this->failed($exception->error === 'access_denied' ? 'Anda membatalkan login atau menolak izin akses data.' : 'Login SSO gagal. Silakan coba lagi.');

            return;
        } catch (SsoException $exception) {
            log_message('error', 'SSO callback gagal: '.$exception->getMessage());
            $this->failed('Login SSO tidak dapat diverifikasi. Silakan coba lagi.');

            return;
        }

        // Tautkan ke tabel users aplikasi di sini, mis. cari berdasarkan $user->sub (lalu NIP sekali saja: $user->nip()).

        redirect($this->sso->pullReturnTo((string) $this->config->item('sso_home', 'sso')));
    }

    public function logout(): void
    {
        if ($this->input->method() !== 'post') {
            show_404();
        }

        redirect($this->sso->logout());
    }

    public function backchannel_logout(): void
    {
        $token = $this->input->post('logout_token');
        $status = $this->sso->handleBackchannelLogout(is_string($token) ? $token : null);

        $this->output->set_status_header($status)->set_header('Cache-Control: no-store')->set_output('');
    }

    public function user(): void
    {
        $user = $this->sso->user();

        $this->output->set_content_type('application/json')->set_header('Cache-Control: no-store');

        if ($user === null) {
            $this->output->set_status_header(401)->set_output('{"message":"Unauthenticated."}');

            return;
        }

        $this->output->set_output((string) json_encode(['user' => array_diff_key($user->claims, array_flip(['aud', 'iss', 'nonce', 'at_hash', 'azp', 'exp', 'iat', 'auth_time', 'sid']))]));
    }

    private function failed(string $message): void
    {
        $this->session->set_flashdata('sso_error', $message);
        redirect((string) $this->config->item('sso_home', 'sso'));
    }
}
