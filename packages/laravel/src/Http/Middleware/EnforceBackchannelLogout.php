<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Http\Middleware;

use Closure;
use Gorontalokota\Sso\Laravel\SsoManager;
use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signs the user out when the SSO ended their session through back-channel logout.
 * Added to the "web" group automatically (config sso.enforce_backchannel_logout).
 */
class EnforceBackchannelLogout
{
    public function __construct(
        private readonly SsoManager $sso,
        private readonly AuthFactory $auth,
        private readonly Repository $config,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->hasSession() && $this->sso->sessionEnded()) {
            $this->auth->guard((string) $this->config->get('sso.guard', 'web'))->logout();
            $this->sso->forget();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson()) {
                return response()->json(['message' => 'Sesi SSO Anda telah berakhir.'], 401);
            }

            return redirect()->to((string) $this->config->get('sso.home', '/'))->with('sso_error', 'Sesi SSO Anda telah berakhir. Silakan masuk kembali.');
        }

        return $next($request);
    }
}
