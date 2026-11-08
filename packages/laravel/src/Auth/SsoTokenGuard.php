<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Auth;

use Gorontalokota\Sso\AccessTokenClaims;
use Gorontalokota\Sso\Exception\SsoException;
use Gorontalokota\Sso\SsoClient;
use Illuminate\Auth\GuardHelpers;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Contracts\Auth\UserProvider;
use Illuminate\Http\Request;

/**
 * Stateless guard for APIs: authenticates "Authorization: Bearer <access token>" issued by the SSO.
 * Config: config/auth.php → 'guards' => ['api' => ['driver' => 'sso', 'provider' => 'users']].
 */
class SsoTokenGuard implements Guard
{
    use GuardHelpers;

    private ?AccessTokenClaims $token = null;

    private bool $attempted = false;

    public function __construct(
        private readonly SsoClient $client,
        private Request $request,
        ?UserProvider $provider,
        private readonly bool $loadUser,
        private readonly string $subColumn,
    ) {
        $this->provider = $provider;
    }

    public function user(): ?Authenticatable
    {
        if ($this->user !== null || $this->attempted) {
            return $this->user;
        }

        $this->attempted = true;
        $bearer = $this->request->bearerToken();

        if ($bearer === null || $bearer === '') {
            return null;
        }

        try {
            $this->token = $this->client->verifyAccessToken($bearer);
        } catch (SsoException) {
            return null;
        }

        $this->request->attributes->set('sso_token', $this->token);

        if (! $this->loadUser) {
            return $this->user = new TokenUser($this->token);
        }

        return $this->user = $this->provider?->retrieveByCredentials([$this->subColumn => $this->token->subject]);
    }

    /**
     * Verified access token claims of the current request (null when unauthenticated).
     */
    public function token(): ?AccessTokenClaims
    {
        $this->user();

        return $this->token;
    }

    /**
     * @param  array<string, mixed>  $credentials
     */
    public function validate(array $credentials = []): bool
    {
        $token = $credentials['token'] ?? null;

        if (! is_string($token)) {
            return false;
        }

        try {
            $this->client->verifyAccessToken($token);

            return true;
        } catch (SsoException) {
            return false;
        }
    }

    public function setRequest(Request $request): static
    {
        $this->request = $request;
        $this->user = null;
        $this->token = null;
        $this->attempted = false;

        return $this;
    }
}
