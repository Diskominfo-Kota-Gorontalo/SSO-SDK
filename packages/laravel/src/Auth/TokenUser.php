<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Auth;

use Gorontalokota\Sso\AccessTokenClaims;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * API caller built from a verified access token when no local user lookup is configured.
 */
final class TokenUser implements Authenticatable
{
    public function __construct(public readonly AccessTokenClaims $token) {}

    public function getAuthIdentifierName(): string
    {
        return 'sub';
    }

    public function getAuthIdentifier(): string
    {
        return $this->token->subject;
    }

    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function getAuthPassword(): string
    {
        return '';
    }

    public function getRememberToken(): ?string
    {
        return null;
    }

    public function setRememberToken($value): void {}

    public function getRememberTokenName(): string
    {
        return '';
    }

    public function __get(string $name): mixed
    {
        return $this->token->claims[$name] ?? null;
    }
}
