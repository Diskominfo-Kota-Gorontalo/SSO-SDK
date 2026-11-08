<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Config;

use CodeIgniter\Config\BaseService;
use Gorontalokota\Sso\Cache\FileCache;
use Gorontalokota\Sso\Logout\LogoutRegistry;
use Gorontalokota\Sso\Native\SsoAuth;
use Gorontalokota\Sso\SsoClient;
use Gorontalokota\Sso\SsoConfig;

class Services extends BaseService
{
    public static function ssoClient(bool $getShared = true): SsoClient
    {
        if ($getShared) {
            return static::getSharedInstance('ssoClient');
        }

        /** @var Sso $config */
        $config = config('Sso');

        return new SsoClient(
            SsoConfig::fromArray([
                'issuer' => $config->issuer,
                'realm' => $config->realm,
                'base_url' => $config->baseUrl,
                'client_id' => $config->clientId,
                'client_secret' => $config->clientSecret,
                'scopes' => $config->scopes,
                'redirect_uri' => $config->redirectUri !== '' ? $config->redirectUri : site_url(trim($config->routePrefix, '/').'/callback'),
                'post_logout_redirect_uri' => $config->postLogoutRedirectUri !== '' ? $config->postLogoutRedirectUri : base_url('/'),
                'audiences' => $config->apiAudiences,
            ]),
            null,
            static::ssoCache(),
        );
    }

    /**
     * Login session on top of the CodeIgniter session ($_SESSION).
     */
    public static function sso(bool $getShared = true): SsoAuth
    {
        if ($getShared) {
            return static::getSharedInstance('sso');
        }

        // Starts the CodeIgniter session with the app's handler before the SDK touches $_SESSION.
        service('session');

        return new SsoAuth(static::ssoClient(), new LogoutRegistry(static::ssoCache()));
    }

    public static function ssoCache(bool $getShared = true): FileCache
    {
        if ($getShared) {
            return static::getSharedInstance('ssoCache');
        }

        /** @var Sso $config */
        $config = config('Sso');

        return new FileCache($config->cacheDirectory !== '' ? $config->cacheDirectory : WRITEPATH.'cache/sso');
    }
}
