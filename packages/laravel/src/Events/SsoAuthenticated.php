<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Events;

use Gorontalokota\Sso\SsoUser;
use Gorontalokota\Sso\TokenSet;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * A user signed in to the application through the SSO.
 */
final class SsoAuthenticated
{
    public function __construct(
        public readonly Authenticatable $user,
        public readonly SsoUser $ssoUser,
        public readonly TokenSet $tokens,
    ) {}
}
