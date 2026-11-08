# Contoh SSO untuk PHP native

```bash
composer install
SSO_CLIENT_ID=internal-xxxx SSO_CLIENT_SECRET=xxxx APP_URL=http://localhost:8080 php -S localhost:8080
```

Daftarkan di portal pengembang SSO: redirect URI `http://localhost:8080/callback.php`, back-channel logout URI `http://localhost:8080/backchannel-logout.php` (hanya dapat dipanggil SSO bila server Anda bisa dijangkau), post logout redirect URI `http://localhost:8080/`.

Di server produksi, letakkan `vendor/` dan `storage/` di luar document root, dan isi kredensial lewat environment server.
