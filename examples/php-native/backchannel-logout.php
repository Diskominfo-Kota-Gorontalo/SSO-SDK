<?php

declare(strict_types=1);

// Didaftarkan sebagai "Back-channel logout URI" di panel admin SSO. Dipanggil server SSO, bukan browser.
require __DIR__.'/bootstrap.php';

http_response_code($sso->handleBackchannelLogout($_POST['logout_token'] ?? null));
