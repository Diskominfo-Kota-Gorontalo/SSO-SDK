<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Gorontalokota\Sso\AccessTokenClaims;
use Gorontalokota\Sso\Exception\InsufficientScopeException;
use Gorontalokota\Sso\Exception\SsoException;

/**
 * Filter "ssotoken" untuk API: memverifikasi "Authorization: Bearer <access token>" dari SSO.
 * Scope wajib sebagai argumen: ['filter' => 'ssotoken:asn,profile']. Klaim tersedia lewat SsoTokenFilter::claims().
 */
class SsoTokenFilter implements FilterInterface
{
    private static ?AccessTokenClaims $claims = null;

    public static function claims(): ?AccessTokenClaims
    {
        return self::$claims;
    }

    /**
     * @param  array<int, string>|null  $arguments
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        self::$claims = null;
        $header = $request->getHeaderLine('Authorization');

        if (! preg_match('/^Bearer\s+(\S+)$/i', $header, $matches)) {
            return $this->deny(401, 'Unauthenticated.', 'Bearer');
        }

        try {
            self::$claims = service('ssoClient')->verifyAccessToken($matches[1], array_values($arguments ?? []));
        } catch (InsufficientScopeException $exception) {
            return $this->deny(403, 'Token tidak memiliki scope yang dibutuhkan.', 'Bearer error="insufficient_scope", scope="'.implode(' ', $arguments ?? []).'"', ['missing_scopes' => $exception->missingScopes]);
        } catch (SsoException) {
            return $this->deny(401, 'Token tidak valid atau kedaluwarsa.', 'Bearer error="invalid_token"');
        }

        return null;
    }

    /**
     * @param  list<string>|null  $arguments
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function deny(int $status, string $message, string $challenge, array $extra = []): ResponseInterface
    {
        return service('response')->setStatusCode($status)->setHeader('WWW-Authenticate', $challenge)->setJSON(['message' => $message, ...$extra]);
    }
}
