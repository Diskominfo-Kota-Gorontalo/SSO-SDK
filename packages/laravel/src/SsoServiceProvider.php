<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel;

use Gorontalokota\Sso\Laravel\Auth\SsoTokenGuard;
use Gorontalokota\Sso\Laravel\Console\InstallCommand;
use Gorontalokota\Sso\Laravel\Contracts\UserResolver;
use Gorontalokota\Sso\Laravel\Http\Middleware\EnforceBackchannelLogout;
use Gorontalokota\Sso\Laravel\Http\Middleware\RequireScopes;
use Gorontalokota\Sso\Logout\LogoutRegistry;
use Gorontalokota\Sso\SsoClient;
use Gorontalokota\Sso\SsoConfig;
use GuzzleHttp\Client;
use Illuminate\Auth\AuthManager;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Foundation\Http\Kernel as FoundationKernel;
use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;

class SsoServiceProvider extends ServiceProvider
{
    /** Container key of the Guzzle client used to reach the SSO (rebind it in tests with FakeProvider::http()). */
    public const HTTP_CLIENT = 'gorontalokota.sso.http';

    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/sso.php', 'sso');

        $this->app->bindIf(self::HTTP_CLIENT, fn (): Client => new Client);

        $this->app->singleton(SsoConfig::class, function (Application $app): SsoConfig {
            $config = (array) $app['config']->get('sso');
            $routesEnabled = (bool) ($config['routes']['enabled'] ?? true);

            return SsoConfig::fromArray([
                'issuer' => $config['issuer'] ?? null,
                'realm' => $config['realm'] ?? 'internal',
                'base_url' => $config['base_url'] ?? null,
                'client_id' => (string) ($config['client_id'] ?? ''),
                'client_secret' => $config['client_secret'] ?? null,
                'redirect_uri' => $config['redirect_uri'] ?? ($routesEnabled ? $app['url']->route('sso.callback') : null),
                'scopes' => $config['scopes'] ?? 'openid profile email',
                'post_logout_redirect_uri' => $config['post_logout_redirect_uri'] ?? $app['url']->to('/'),
                'audiences' => $config['api']['audiences'] ?? [],
                'leeway' => (int) ($config['leeway'] ?? 60),
                'http_timeout' => (float) ($config['http_timeout'] ?? 10),
            ]);
        });

        $this->app->singleton(SsoClient::class, fn (Application $app): SsoClient => new SsoClient(
            $app->make(SsoConfig::class),
            $app->make(self::HTTP_CLIENT),
            $app['cache']->store($app['config']->get('sso.cache_store')),
        ));

        $this->app->singleton(LogoutRegistry::class, fn (Application $app): LogoutRegistry => new LogoutRegistry(
            $app['cache']->store($app['config']->get('sso.cache_store')),
        ));

        $this->app->scoped(SsoManager::class, fn (Application $app): SsoManager => new SsoManager(
            $app->make(SsoClient::class),
            $app->make(LogoutRegistry::class),
            $app['session.store'],
        ));

        $this->app->bind(UserResolver::class, fn (Application $app): UserResolver => $app->make((string) $app['config']->get('sso.user.resolver')));
    }

    public function boot(Router $router): void
    {
        if ($this->app['config']->get('sso.routes.enabled', true)) {
            $this->loadRoutesFrom(__DIR__.'/../routes/sso.php');
        }

        $router->aliasMiddleware('sso.scope', RequireScopes::class);
        $router->aliasMiddleware('sso.backchannel', EnforceBackchannelLogout::class);

        if ($this->app['config']->get('sso.enforce_backchannel_logout', true)) {
            $this->appendToWebGroup($router);
        }

        $this->app->make(AuthManager::class)->extend('sso', function (Application $app, string $name, array $config): SsoTokenGuard {
            $guard = new SsoTokenGuard(
                $app->make(SsoClient::class),
                $app['request'],
                isset($config['provider']) ? $app->make(AuthManager::class)->createUserProvider($config['provider']) : null,
                (bool) $app['config']->get('sso.api.load_user', false),
                (string) $app['config']->get('sso.user.sub_column', 'sso_sub'),
            );

            $app->refresh('request', $guard, 'setRequest');

            return $guard;
        });

        if ($this->app->runningInConsole()) {
            $this->publishes([__DIR__.'/../config/sso.php' => config_path('sso.php')], 'sso-config');
            $this->publishes([
                __DIR__.'/../database/migrations/add_sso_sub_to_users_table.php.stub' => database_path('migrations/'.date('Y_m_d_His').'_add_sso_sub_to_users_table.php'),
            ], 'sso-migrations');
            $this->commands([InstallCommand::class]);
        }
    }

    /**
     * Registers through the HTTP kernel: the kernel copies its groups onto the router when it is constructed,
     * which can happen after providers boot, so a plain router push could be overwritten.
     */
    private function appendToWebGroup(Router $router): void
    {
        $kernel = $this->app->make(HttpKernel::class);

        if ($kernel instanceof FoundationKernel && isset($kernel->getMiddlewareGroups()['web'])) {
            $kernel->appendMiddlewareToGroup('web', EnforceBackchannelLogout::class);

            return;
        }

        $router->pushMiddlewareToGroup('web', EnforceBackchannelLogout::class);
    }
}
