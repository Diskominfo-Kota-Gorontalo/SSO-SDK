<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Config;

use Gorontalokota\Sso\CodeIgniter\Filters\SsoAuthFilter;
use Gorontalokota\Sso\CodeIgniter\Filters\SsoTokenFilter;

/**
 * Didaftarkan otomatis oleh auto-discovery modul CodeIgniter 4.
 */
class Registrar
{
    /**
     * @return array{aliases: array<string, class-string>}
     */
    public static function Filters(): array
    {
        return ['aliases' => ['sso' => SsoAuthFilter::class, 'ssotoken' => SsoTokenFilter::class]];
    }
}
