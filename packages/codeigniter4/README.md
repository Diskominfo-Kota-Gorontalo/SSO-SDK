# gorontalokota/sso-codeigniter4

Login SSO Pemerintah Kota Gorontalo untuk CodeIgniter 4.4+: route siap pakai, filter `sso` untuk halaman, filter `ssotoken` untuk API, dan back-channel logout.

## Instalasi

```bash
composer require gorontalokota/sso-codeigniter4
```

Route dan filter terdaftar otomatis lewat auto-discovery modul (pastikan `Config\Modules::$discoverInComposer = true`, bawaan CI4).

`.env`:

```dotenv
sso.realm = internal            # internal (ASN) atau external (masyarakat)
sso.clientId = internal-xxxx
sso.clientSecret = xxxx
sso.scopes = "openid profile email asn"
```

Kecualikan back-channel logout dari CSRF di `app/Config/Filters.php`:

```php
public array $globals = [
    'before' => [
        'csrf' => ['except' => ['sso/backchannel-logout']],
    ],
];
```

Daftarkan di portal pengembang SSO:

- Redirect URI: `https://aplikasi.go.id/sso/callback`
- Back-channel logout URI: `https://aplikasi.go.id/sso/backchannel-logout`
- Post logout redirect URI: `https://aplikasi.go.id/`

## Pemakaian

```php
// app/Config/Routes.php
$routes->group('admin', ['filter' => 'sso'], static function ($routes) {
    $routes->get('/', 'Admin::index');
});
```

```php
helper('sso');
$user = sso_user();          // Gorontalokota\Sso\SsoUser atau null
$user->nip();
sso_access_token();          // untuk memanggil API lain yang dilindungi SSO
```

Tombol keluar harus POST dengan CSRF:

```php
<form method="post" action="<?= url_to('sso.logout') ?>">
    <?= csrf_field() ?>
    <button type="submit">Keluar</button>
</form>
```

Pesan kegagalan login tersedia di `session('sso_error')`.

### Menautkan ke tabel users

Setelah login berhasil, event `sso_login` dipicu. Kembalikan `false` untuk menolak pengguna yang tidak terdaftar:

```php
// app/Config/Events.php
Events::on('sso_login', static function (Gorontalokota\Sso\SsoUser $ssoUser) {
    $users = model(UserModel::class);
    $user = $users->where('sso_sub', $ssoUser->sub)->first()
        ?? $users->where('nip', $ssoUser->nip())->where('sso_sub', null)->first();   // tautkan akun lama sekali saja

    if ($user === null) {
        return false;
    }

    $users->update($user['id'], ['sso_sub' => $ssoUser->sub, 'name' => $ssoUser->name]);
    session()->set('user_id', $user['id']);
});
```

## API dengan bearer token

```php
$routes->group('api', ['filter' => 'ssotoken'], ...);              // token valid
$routes->get('api/pegawai', 'Api::pegawai', ['filter' => 'ssotoken:asn']);   // + scope wajib
```

Klaim token di controller: `\Gorontalokota\Sso\CodeIgniter\Filters\SsoTokenFilter::claims()`.

## Konfigurasi lain

Salin `vendor/gorontalokota/sso-codeigniter4/src/Config/Sso.php` ke `app/Config/Sso.php` (namespace `Config`, `extends \Gorontalokota\Sso\CodeIgniter\Config\Sso`) untuk mengubah `home`, `routePrefix`, `cacheDirectory` (folder bersama bila lebih dari satu server), atau `apiAudiences`.
