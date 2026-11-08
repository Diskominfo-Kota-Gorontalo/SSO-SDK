<?php

declare(strict_types=1);

require __DIR__.'/bootstrap.php';

// return_to hanya menerima path lokal (mis. /laporan.php); URL luar diabaikan.
$sso->redirectToLogin($_GET['return_to'] ?? null);
