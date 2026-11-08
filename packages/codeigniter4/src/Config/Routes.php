<?php

/**
 * Route bawaan, dimuat lewat auto-discovery modul (Config\Modules::$discoverInComposer).
 *
 * @var CodeIgniter\Router\RouteCollection $routes
 */

use Gorontalokota\Sso\CodeIgniter\Controllers\SsoController;

/** @var Gorontalokota\Sso\CodeIgniter\Config\Sso $ssoConfig */
$ssoConfig = config('Sso');

if ($ssoConfig->routes) {
    $routes->group(trim($ssoConfig->routePrefix, '/'), static function ($routes): void {
        $routes->get('login', [SsoController::class, 'login'], ['as' => 'sso.login']);
        $routes->get('callback', [SsoController::class, 'callback'], ['as' => 'sso.callback']);
        $routes->post('logout', [SsoController::class, 'logout'], ['as' => 'sso.logout']);
        $routes->post('backchannel-logout', [SsoController::class, 'backchannel'], ['as' => 'sso.backchannel']);
        $routes->get('user', [SsoController::class, 'user'], ['as' => 'sso.user']);
    });
}
