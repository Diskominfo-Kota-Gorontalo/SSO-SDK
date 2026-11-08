<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel;

use Gorontalokota\Sso\Exception\SsoException;
use Gorontalokota\Sso\Logout\LogoutRegistry;
use Gorontalokota\Sso\SsoClient;
use Gorontalokota\Sso\SsoUser;
use Gorontalokota\Sso\TokenSet;
use Illuminate\Contracts\Session\Session;

/**
 * SSO state of the current browser session (available through the Sso facade).
 */
class SsoManager
{
    public const SESSION_KEY = 'gorontalokota_sso';

    public function __construct(
        private readonly SsoClient $client,
        private readonly LogoutRegistry $registry,
        private readonly Session $session,
    ) {}

    public function client(): SsoClient
    {
        return $this->client;
    }

    public function registry(): LogoutRegistry
    {
        return $this->registry;
    }

    /**
     * Records a completed SSO login in the session.
     */
    public function remember(TokenSet $tokens): void
    {
        $this->session->put(self::SESSION_KEY, ['tokens' => $tokens->toArray(), 'authenticated_at' => time()]);
    }

    public function forget(): void
    {
        $this->session->forget(self::SESSION_KEY);
    }

    /**
     * The SSO identity of the signed-in user (from the verified ID token), or null.
     */
    public function user(): ?SsoUser
    {
        return $this->tokens()?->user();
    }

    public function tokens(): ?TokenSet
    {
        $data = $this->session->get(self::SESSION_KEY.'.tokens');

        return is_array($data) ? TokenSet::fromArray($data) : null;
    }

    public function idToken(): ?string
    {
        return $this->tokens()?->idToken;
    }

    /**
     * True when the SSO ended this session through back-channel logout.
     */
    public function sessionEnded(): bool
    {
        $user = $this->user();

        if ($user === null) {
            return false;
        }

        return $this->registry->isEnded($user->sub, $user->sessionId, (int) $this->session->get(self::SESSION_KEY.'.authenticated_at', 0));
    }

    /**
     * Access token for calling SSO-protected APIs, refreshed when about to expire. Null when unavailable.
     */
    public function accessToken(): ?string
    {
        $tokens = $this->tokens();

        if ($tokens === null) {
            return null;
        }

        if (! $tokens->isExpired(time())) {
            return $tokens->accessToken;
        }

        if ($tokens->refreshToken === null) {
            return null;
        }

        try {
            $fresh = $this->client->refresh($tokens->refreshToken);
        } catch (SsoException) {
            return null;
        }

        $this->session->put(self::SESSION_KEY.'.tokens', (new TokenSet(
            accessToken: $fresh->accessToken,
            expiresAt: $fresh->expiresAt,
            refreshToken: $fresh->refreshToken,
            idToken: $fresh->idToken ?? $tokens->idToken,
            idTokenClaims: $fresh->idTokenClaims !== [] ? $fresh->idTokenClaims : $tokens->idTokenClaims,
            scope: $fresh->scope,
        ))->toArray());

        return $fresh->accessToken;
    }
}
