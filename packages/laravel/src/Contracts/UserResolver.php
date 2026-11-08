<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Contracts;

use Gorontalokota\Sso\SsoUser;
use Gorontalokota\Sso\TokenSet;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Maps an SSO identity to the application's own user. Return null to refuse access
 * (e.g. the person has no account in this application).
 */
interface UserResolver
{
    public function resolve(SsoUser $ssoUser, TokenSet $tokens): ?Authenticatable;
}
