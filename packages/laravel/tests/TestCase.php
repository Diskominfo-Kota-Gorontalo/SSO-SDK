<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Tests;

use Gorontalokota\Sso\Laravel\SsoServiceProvider;
use Gorontalokota\Sso\Laravel\Tests\Fixtures\User;
use Gorontalokota\Sso\Testing\FakeProvider;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Orchestra\Testbench\TestCase as Orchestra;

abstract class TestCase extends Orchestra
{
    protected FakeProvider $provider;

    protected function getPackageProviders($app): array
    {
        return [SsoServiceProvider::class];
    }

    protected function defineEnvironment($app): void
    {
        $this->provider ??= new FakeProvider;

        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('k', 32)));
        $app['config']->set('database.default', 'testing');
        $app['config']->set('cache.default', 'array');
        $app['config']->set('sso.issuer', FakeProvider::ISSUER);
        $app['config']->set('sso.client_id', FakeProvider::CLIENT_ID);
        $app['config']->set('sso.client_secret', FakeProvider::SECRET);
        $app['config']->set('sso.user.model', User::class);
        $app['config']->set('sso.user.match_by', ['nip' => 'nip']);
        $app['config']->set('auth.providers.users.model', User::class);
        $app['config']->set('auth.guards.api', ['driver' => 'sso', 'provider' => 'users']);

        $app->instance(SsoServiceProvider::HTTP_CLIENT, $this->provider->http());
    }

    protected function defineDatabaseMigrations(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('sso_sub')->nullable()->unique();
            $table->string('nip')->nullable();
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('password')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });
    }

    protected function defineRoutes($router): void
    {
        Route::middleware('web')->get('/dashboard', fn () => 'dashboard')->middleware('auth');
        Route::middleware('auth:api')->get('/api/profil', fn () => ['sub' => auth('api')->id()]);
        Route::middleware(['auth:api', 'sso.scope:employee'])->get('/api/kepegawaian', fn () => 'ok');
    }
}
