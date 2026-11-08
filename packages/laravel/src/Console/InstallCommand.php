<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Console;

use Illuminate\Console\Command;

class InstallCommand extends Command
{
    protected $signature = 'sso:install {--force : Timpa file yang sudah dipublikasikan}';

    protected $description = 'Publikasikan konfigurasi dan migrasi SSO Kota Gorontalo, lalu tampilkan data pendaftaran klien';

    public function handle(): int
    {
        $this->callSilently('vendor:publish', ['--tag' => 'sso-config', '--force' => $this->option('force')]);
        $this->callSilently('vendor:publish', ['--tag' => 'sso-migrations', '--force' => $this->option('force')]);

        $this->components->info('config/sso.php dan migrasi kolom users.sso_sub sudah dipublikasikan.');

        $base = rtrim((string) config('app.url'), '/');
        $prefix = trim((string) config('sso.routes.prefix', 'sso'), '/');

        $this->components->twoColumnDetail('<fg=gray>Daftarkan di panel admin SSO</>', '');
        $this->components->twoColumnDetail('Redirect URI', "{$base}/{$prefix}/callback");
        $this->components->twoColumnDetail('Back-channel logout URI', "{$base}/{$prefix}/backchannel-logout");
        $this->components->twoColumnDetail('Post logout redirect URI', "{$base}/");

        $this->newLine();
        $this->line('  Tambahkan ke .env:');
        $this->line('  <fg=gray>SSO_REALM=internal</>        <fg=gray># internal (ASN) atau external (masyarakat)</>');
        $this->line('  <fg=gray>SSO_CLIENT_ID=</>');
        $this->line('  <fg=gray>SSO_CLIENT_SECRET=</>');
        $this->newLine();
        $this->line('  Lalu jalankan <fg=yellow>php artisan migrate</> dan arahkan tombol login ke <fg=yellow>route(\'sso.login\')</>.');

        return self::SUCCESS;
    }
}
