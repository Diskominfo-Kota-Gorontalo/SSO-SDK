<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\CodeIgniter\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Filter "sso": halaman hanya untuk pengguna yang sudah login lewat SSO. Juga menerapkan back-channel logout.
 * Contoh: $routes->group('admin', ['filter' => 'sso'], ...).
 */
class SsoAuthFilter implements FilterInterface
{
    /**
     * @param  list<string>|null  $arguments
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        if (service('sso')->user() !== null) {
            return null;
        }

        if ($request->getHeaderLine('Accept') === 'application/json' || $request->hasHeader('X-Requested-With')) {
            return service('response')->setStatusCode(401)->setJSON(['message' => 'Unauthenticated.']);
        }

        /** @var \Gorontalokota\Sso\CodeIgniter\Config\Sso $config */
        $config = config('Sso');
        $uri = $request->getUri();
        $returnTo = '/'.ltrim($uri->getPath(), '/').($uri->getQuery() !== '' ? '?'.$uri->getQuery() : '');

        return redirect()->to(site_url(trim($config->routePrefix, '/').'/login').'?return_to='.rawurlencode($returnTo));
    }

    /**
     * @param  list<string>|null  $arguments
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
