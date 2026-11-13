# gorontalokota/sso-laravel

Login SSO Pemerintah Kota Gorontalo untuk Laravel 12–13 (PHP 8.2+): route siap pakai, penautan akun lokal, back-channel logout otomatis, dan guard API bearer token.

## Instalasi

```bash
composer require gorontalokota/sso-laravel
php artisan sso:install   # publikasikan config + migrasi, tampilkan URI untuk didaftarkan
php artisan migrate       # menambah kolom users.sso_sub
```

`.env`:

```dotenv
SSO_REALM=internal            # internal (ASN) atau external (masyarakat)
SSO_CLIENT_ID=internal-xxxx
SSO_CLIENT_SECRET=xxxx
SSO_SCOPES="openid profile email employee"
```

Daftarkan di portal pengembang SSO (perintah `sso:install` menampilkan nilainya):

- Redirect URI: `{APP_URL}/sso/callback`
- Back-channel logout URI: `{APP_URL}/sso/backchannel-logout`
- Post logout redirect URI: `{APP_URL}/`

## Login di aplikasi web

Tombol masuk dan keluar:

```blade
<a href="{{ route('sso.login') }}">Masuk dengan SSO</a>

<form method="POST" action="{{ route('sso.logout') }}">
    @csrf
    <button type="submit">Keluar</button>
</form>

@if (session('sso_error'))
    <p role="alert">{{ session('sso_error') }}</p>
@endif
```

Arahkan tamu yang membuka halaman ber-middleware `auth` ke SSO (`bootstrap/app.php`, Laravel 11+):

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->redirectGuestsTo(fn () => route('sso.login'));
})
```

Setelah login, pengguna lokal tersedia lewat `auth()->user()` seperti biasa. Data SSO-nya lewat facade:

```php
use Gorontalokota\Sso\Laravel\Facades\Sso;

Sso::user()->nip();          // NIP (realm internal)
Sso::user()->employment();   // organization_code, organization_name, position, grade, employment_status (scope employee)
Sso::user()->phoneNumber();  // +6281234567890 (scope phone), phoneNumberVerified()
Sso::user()->nik();          // scope nik (terbatas, perlu izin admin SSO)
Sso::user()->photo();        // nama berkas foto (scope photo), picture() = URL foto bila diatur server SSO
Sso::accessToken();          // untuk memanggil API lain yang dilindungi SSO, diperbarui otomatis
```

### Menautkan akun lokal

Atur di `config/sso.php`:

```php
'user' => [
    'model' => App\Models\User::class,
    'sub_column' => 'sso_sub',
    'match_by' => ['nip' => 'nip'],   // akun lama dicocokkan SEKALI lewat NIP, lalu disimpan sub-nya
    'create' => false,                // true: buat akun baru untuk pengguna SSO yang belum ada
    'sync' => ['name' => 'name'],     // kolom yang diperbarui dari SSO setiap login
],
```

Untuk aturan sendiri (mis. hanya pegawai OPD tertentu), buat kelas yang mengimplementasikan `Gorontalokota\Sso\Laravel\Contracts\UserResolver` dan isi `sso.user.resolver`. Kembalikan `null` untuk menolak akses.

Event yang tersedia: `SsoAuthenticated` (setelah login) dan `SsoSessionEnded` (back-channel logout).

### Back-channel logout

Aktif otomatis. Middleware ditambahkan ke grup `web` sehingga pengguna yang sesinya diakhiri SSO langsung keluar pada request berikutnya. Gunakan cache bersama (Redis/database) bila aplikasi berjalan di lebih dari satu server: `SSO_CACHE_STORE=redis`.

## Frontend Vue / Inertia (BFF)

`GET /sso/user` mengembalikan JSON pengguna aktif (401 bila belum login). Pakai bersama `useSso()` dari paket npm `@gorontalokota/sso/vue`. Token tetap di server.

## API dengan bearer token (seperti keycloak-guard)

`config/auth.php`:

```php
'guards' => [
    'api' => ['driver' => 'sso', 'provider' => 'users'],
],
```

```php
Route::middleware('auth:api')->get('/profil', fn () => auth('api')->user());
Route::middleware(['auth:api', 'sso.scope:employee'])->get('/kepegawaian', ...);
```

- `SSO_API_AUDIENCES`: client_id yang tokennya diterima API ini (dipisah koma). Bawaan: client_id aplikasi ini.
- `sso.api.load_user = true`: `auth('api')->user()` adalah model lokal (dicari lewat `sso_sub`). Bila `false`, isinya `TokenUser` berisi klaim token.
- Klaim token: `$request->attributes->get('sso_token')` (`AccessTokenClaims`).

## Pengujian

```php
use Gorontalokota\Sso\Laravel\SsoServiceProvider;
use Gorontalokota\Sso\Testing\FakeProvider;

$provider = new FakeProvider('https://sso.test/internal', 'client-tes');
config(['sso.issuer' => $provider->issuer, 'sso.client_id' => $provider->clientId]);
app()->instance(SsoServiceProvider::HTTP_CLIENT, $provider->http());

$this->withToken($provider->accessToken())->getJson('/api/profil')->assertOk();
```
