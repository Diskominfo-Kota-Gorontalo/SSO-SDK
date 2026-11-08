<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Facades;

use Gorontalokota\Sso\Laravel\SsoManager;
use Illuminate\Support\Facades\Facade;

/**
 * @method static \Gorontalokota\Sso\SsoUser|null user()
 * @method static string|null accessToken()
 * @method static string|null idToken()
 * @method static \Gorontalokota\Sso\TokenSet|null tokens()
 * @method static bool sessionEnded()
 * @method static \Gorontalokota\Sso\SsoClient client()
 *
 * @see SsoManager
 */
final class Sso extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return SsoManager::class;
    }
}
