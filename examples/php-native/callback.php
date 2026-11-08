<?php

declare(strict_types=1);

use Gorontalokota\Sso\Exception\AuthorizationDeniedException;
use Gorontalokota\Sso\Exception\SsoException;

require __DIR__.'/bootstrap.php';

try {
    $user = $sso->handleCallback($_GET);
} catch (AuthorizationDeniedException) {
    exit('Anda membatalkan login. <a href="/">Kembali</a>');
} catch (SsoException $exception) {
    error_log('SSO callback gagal: '.$exception->getMessage());
    exit('Login gagal. <a href="/login.php">Coba lagi</a>');
}

// Tautkan ke akun lokal di sini: cari berdasarkan $user->sub; NIP/NIK hanya dipakai sekali untuk menautkan akun lama.

header('Location: '.$sso->pullReturnTo('/'));
