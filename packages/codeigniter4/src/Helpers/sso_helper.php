<?php

use Gorontalokota\Sso\SsoUser;

if (! function_exists('sso_user')) {
    /**
     * Pengguna SSO yang sedang login, atau null. Muat dengan helper('sso').
     */
    function sso_user(): ?SsoUser
    {
        return service('sso')->user();
    }
}

if (! function_exists('sso_access_token')) {
    /**
     * Access token untuk memanggil API yang dilindungi SSO (diperbarui otomatis), atau null.
     */
    function sso_access_token(): ?string
    {
        return service('sso')->accessToken();
    }
}
