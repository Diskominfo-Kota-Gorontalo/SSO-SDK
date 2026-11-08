<?php

declare(strict_types=1);

require __DIR__.'/bootstrap.php';

$user = $sso->user();
?>
<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Contoh SSO PHP Native</title></head>
<body>
<?php if ($user === null): ?>
    <p>Anda belum masuk.</p>
    <p><a href="login.php">Masuk dengan SSO Kota Gorontalo</a></p>
<?php else: ?>
    <p>Halo, <strong><?= e($user->name) ?></strong> (<?= e($user->nip() ?? $user->email) ?>)</p>
    <form method="post" action="logout.php">
        <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">
        <button type="submit">Keluar</button>
    </form>
<?php endif ?>
</body>
</html>
