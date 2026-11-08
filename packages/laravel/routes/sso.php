<?php

use Gorontalokota\Sso\Laravel\Http\Controllers\SsoController;
use Illuminate\Support\Facades\Route;

$prefix = (string) config('sso.routes.prefix', 'sso');

Route::prefix($prefix)->middleware((array) config('sso.routes.middleware', ['web']))->name('sso.')->group(function (): void {
    Route::get('login', [SsoController::class, 'login'])->name('login');
    Route::get('callback', [SsoController::class, 'callback'])->name('callback');
    Route::post('logout', [SsoController::class, 'logout'])->name('logout');
    Route::get('user', [SsoController::class, 'user'])->name('user');
});

// Dipanggil server SSO: tanpa sesi, cookie, maupun CSRF.
Route::post($prefix.'/backchannel-logout', [SsoController::class, 'backchannel'])->name('sso.backchannel');
