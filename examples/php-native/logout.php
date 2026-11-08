<?php

declare(strict_types=1);

require __DIR__.'/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ! hash_equals(csrf_token(), (string) ($_POST['csrf'] ?? ''))) {
    http_response_code(405);
    exit;
}

header('Location: '.$sso->logout());
