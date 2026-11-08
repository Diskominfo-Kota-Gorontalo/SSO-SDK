<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Http\Controllers;

use Gorontalokota\Sso\AuthorizationRequest;
use Gorontalokota\Sso\Exception\AuthorizationDeniedException;
use Gorontalokota\Sso\Exception\SsoException;
use Gorontalokota\Sso\Laravel\Contracts\UserResolver;
use Gorontalokota\Sso\Laravel\Events\SsoAuthenticated;
use Gorontalokota\Sso\Laravel\Events\SsoSessionEnded;
use Gorontalokota\Sso\Laravel\SsoManager;
use Gorontalokota\Sso\SsoClient;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class SsoController extends Controller
{
    private const PENDING_KEY = 'gorontalokota_sso_pending';

    public function __construct(
        private readonly SsoManager $sso,
        private readonly Repository $config,
        private readonly AuthFactory $auth,
    ) {}

    public function login(Request $request): RedirectResponse
    {
        $returnTo = SsoClient::safeReturnTo($request->query('return_to'))
            ?? SsoClient::safeReturnTo($this->pathOf($request->session()->get('url.intended')));

        $pending = $this->sso->client()->createAuthorizationRequest(
            array_filter(['prompt' => $request->query('prompt'), 'login_hint' => $request->query('login_hint')], fn ($value): bool => is_string($value) && $value !== ''),
            $returnTo,
        );

        $request->session()->put(self::PENDING_KEY, $pending->toArray());

        return redirect()->away($pending->url);
    }

    public function callback(Request $request, UserResolver $resolver, Dispatcher $events): RedirectResponse
    {
        $pending = $request->session()->pull(self::PENDING_KEY);

        if (! is_array($pending)) {
            return $this->failed('Sesi login berakhir. Silakan masuk kembali.');
        }

        $pending = AuthorizationRequest::fromArray($pending);

        try {
            $tokens = $this->sso->client()->handleCallback($request->query(), $pending);
        } catch (AuthorizationDeniedException $exception) {
            return $this->failed($exception->error === 'access_denied'
                ? 'Anda membatalkan login atau menolak izin akses data.'
                : 'Login SSO gagal ('.$exception->error.'). Silakan coba lagi.');
        } catch (SsoException $exception) {
            report($exception);

            return $this->failed('Login SSO tidak dapat diverifikasi. Silakan coba lagi.');
        }

        $ssoUser = $tokens->user();
        $user = $ssoUser !== null ? $resolver->resolve($ssoUser, $tokens) : null;

        if ($ssoUser === null || $user === null) {
            return $this->failed('Akun SSO Anda belum terdaftar di aplikasi ini. Hubungi admin aplikasi.');
        }

        $this->auth->guard($this->guardName())->login($user);
        $request->session()->regenerate();
        $this->sso->remember($tokens);
        $events->dispatch(new SsoAuthenticated($user, $ssoUser, $tokens));

        return redirect()->to($pending->returnTo ?? (string) $this->config->get('sso.home', '/'));
    }

    public function logout(Request $request): RedirectResponse
    {
        $idToken = $this->sso->idToken();

        $this->auth->guard($this->guardName())->logout();
        $this->sso->forget();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->away($this->sso->client()->logoutUrl($idToken));
    }

    /**
     * POST from the SSO server (no browser session, no CSRF). Must answer quickly with 200 or 400.
     */
    public function backchannel(Request $request, Dispatcher $events): Response
    {
        $logoutToken = $request->input('logout_token');

        if (! is_string($logoutToken) || $logoutToken === '') {
            return response('', 400, ['Cache-Control' => 'no-store']);
        }

        try {
            $token = $this->sso->client()->verifyLogoutToken($logoutToken);
        } catch (SsoException) {
            return response('', 400, ['Cache-Control' => 'no-store']);
        }

        $this->sso->registry()->markEnded($token);
        $events->dispatch(new SsoSessionEnded($token));

        return response('', 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * Current user for SPA frontends (Vue/Inertia) using this app as backend-for-frontend.
     */
    public function user(): JsonResponse
    {
        $ssoUser = $this->sso->user();

        if ($ssoUser === null || ! $this->auth->guard($this->guardName())->check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $claims = array_diff_key($ssoUser->claims, array_flip(['aud', 'iss', 'nonce', 'at_hash', 'azp', 'exp', 'iat', 'auth_time', 'sid']));

        return response()->json(['user' => $claims], 200, ['Cache-Control' => 'no-store']);
    }

    private function failed(string $message): RedirectResponse
    {
        return redirect()->to((string) ($this->config->get('sso.error_redirect') ?? $this->config->get('sso.home', '/')))->with('sso_error', $message);
    }

    private function guardName(): string
    {
        return (string) $this->config->get('sso.guard', 'web');
    }

    private function pathOf(mixed $url): ?string
    {
        if (! is_string($url) || $url === '') {
            return null;
        }

        $path = parse_url($url, PHP_URL_PATH) ?: '/';
        $query = parse_url($url, PHP_URL_QUERY);

        return $path.(is_string($query) && $query !== '' ? '?'.$query : '');
    }
}
