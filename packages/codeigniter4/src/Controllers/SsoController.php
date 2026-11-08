<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Controllers;

use CodeIgniter\Controller;
use CodeIgniter\HTTP\RedirectResponse;
use CodeIgniter\HTTP\ResponseInterface;
use Gorontalokota\Sso\CodeIgniter\Config\Sso;
use Gorontalokota\Sso\Exception\AuthorizationDeniedException;
use Gorontalokota\Sso\Exception\SsoException;

/**
 * Route bawaan SSO. Setelah login, data pengguna tersedia lewat sso_user() / service('sso')->user().
 * Untuk menautkan ke tabel users aplikasi, dengarkan event "sso_login" (Events::on('sso_login', fn ($user) => ...)).
 */
class SsoController extends Controller
{
    public function login(): RedirectResponse
    {
        $returnTo = $this->request->getGet('return_to');

        return redirect()->to(service('sso')->loginUrl(is_string($returnTo) ? $returnTo : null));
    }

    public function callback(): RedirectResponse
    {
        $auth = service('sso');

        try {
            $user = $auth->handleCallback((array) $this->request->getGet());
        } catch (AuthorizationDeniedException $exception) {
            return $this->failed($exception->error === 'access_denied'
                ? 'Anda membatalkan login atau menolak izin akses data.'
                : 'Login SSO gagal ('.$exception->error.'). Silakan coba lagi.');
        } catch (SsoException $exception) {
            log_message('error', 'SSO callback gagal: {message}', ['message' => $exception->getMessage()]);

            return $this->failed('Login SSO tidak dapat diverifikasi. Silakan coba lagi.');
        }

        // Pendengar boleh mengembalikan false untuk menolak pengguna yang tidak terdaftar di aplikasi ini.
        if (\CodeIgniter\Events\Events::trigger('sso_login', $user) === false) {
            $auth->logout();

            return $this->failed('Akun SSO Anda belum terdaftar di aplikasi ini. Hubungi admin aplikasi.');
        }

        return redirect()->to($auth->pullReturnTo($this->config()->home));
    }

    public function logout(): RedirectResponse
    {
        return redirect()->to(service('sso')->logout());
    }

    /**
     * POST dari server SSO. Kecualikan route ini dari filter CSRF (Config\Filters::$globals['before']['csrf']['except']).
     */
    public function backchannel(): ResponseInterface
    {
        $token = $this->request->getPost('logout_token');
        $status = service('sso')->handleBackchannelLogout(is_string($token) ? $token : null);

        return $this->response->setStatusCode($status)->setHeader('Cache-Control', 'no-store')->setBody('');
    }

    /**
     * JSON pengguna aktif untuk frontend Vue/SPA yang memakai aplikasi ini sebagai backend (BFF).
     */
    public function user(): ResponseInterface
    {
        $user = service('sso')->user();

        if ($user === null) {
            return $this->response->setStatusCode(401)->setJSON(['message' => 'Unauthenticated.']);
        }

        $claims = array_diff_key($user->claims, array_flip(['aud', 'iss', 'nonce', 'at_hash', 'azp', 'exp', 'iat', 'auth_time', 'sid']));

        return $this->response->setHeader('Cache-Control', 'no-store')->setJSON(['user' => $claims]);
    }

    private function failed(string $message): RedirectResponse
    {
        return redirect()->to($this->config()->home)->with('sso_error', $message);
    }

    private function config(): Sso
    {
        /** @var Sso */
        return config('Sso');
    }
}
