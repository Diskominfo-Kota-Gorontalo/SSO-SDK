<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Events;

use Gorontalokota\Sso\LogoutToken;

/**
 * The SSO ended a session via back-channel logout (user signed out elsewhere, account deactivated, ...).
 */
final class SsoSessionEnded
{
    public function __construct(public readonly LogoutToken $token) {}
}
