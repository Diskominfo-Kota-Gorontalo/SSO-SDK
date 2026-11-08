# Integrasi SSO untuk CodeIgniter 3

CodeIgniter 3 tidak mendukung paket Composer secara penuh, jadi integrasinya berupa tiga file yang disalin ke aplikasi, ditambah library inti `gorontalokota/sso-php`. Butuh **PHP 8.1+** (CI 3.1.13 sudah berjalan di PHP 8.1).

## Instalasi

1. Pasang library inti di root aplikasi:

   ```bash
   composer require gorontalokota/sso-php
   ```

2. Aktifkan autoload Composer di `application/config/config.php`:

   ```php
   $config['composer_autoload'] = FCPATH.'vendor/autoload.php';
   ```

3. Salin file dari folder ini:

   ```
   application/config/sso.php
   application/libraries/Sso.php
   application/controllers/Sso.php
   ```

4. `application/config/routes.php`:

   ```php
   $route['sso/backchannel-logout'] = 'sso/backchannel_logout';
   ```

5. `application/config/config.php`, kecualikan back-channel logout dari CSRF:

   ```php
   $config['csrf_exclude_uris'] = ['sso/backchannel-logout'];
   ```

6. Isi `SSO_REALM`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET` di environment server (atau langsung di `application/config/sso.php`). Pastikan `application/cache/sso` bisa ditulis web server.

Daftarkan di portal pengembang SSO:

- Redirect URI: `https://aplikasi.go.id/sso/callback`
- Back-channel logout URI: `https://aplikasi.go.id/sso/backchannel-logout`
- Post logout redirect URI: `https://aplikasi.go.id/`

## Pemakaian

```php
class Dashboard extends CI_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->library('sso');
        $this->user = $this->sso->require_login();   // arahkan ke SSO bila belum login
    }

    public function index()
    {
        echo 'Halo '.html_escape($this->user->name).' ('.$this->user->nip().')';
    }
}
```

Tombol keluar (POST dengan CSRF):

```php
<?= form_open('sso/logout') ?>
    <button type="submit">Keluar</button>
<?= form_close() ?>
```

Tautkan ke tabel users aplikasi di `Sso::callback()`. Cari berdasarkan `$user->sub`; NIP hanya dipakai sekali untuk menautkan akun lama.
