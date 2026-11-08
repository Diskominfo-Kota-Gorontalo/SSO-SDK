<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Http\Middleware;

use Closure;
use Gorontalokota\Sso\AccessTokenClaims;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route middleware "sso.scope:asn,profile" for APIs behind the "sso" guard. Use after "auth:api".
 */
class RequireScopes
{
    public function handle(Request $request, Closure $next, string ...$scopes): Response
    {
        $token = $request->attributes->get('sso_token');

        if (! $token instanceof AccessTokenClaims) {
            return response()->json(['message' => 'Unauthenticated.'], 401, ['WWW-Authenticate' => 'Bearer']);
        }

        $missing = array_values(array_filter($scopes, fn (string $scope): bool => ! $token->hasScope($scope)));

        if ($missing !== []) {
            return response()->json(
                ['message' => 'Token tidak memiliki scope yang dibutuhkan.', 'missing_scopes' => $missing],
                403,
                ['WWW-Authenticate' => 'Bearer error="insufficient_scope", scope="'.implode(' ', $scopes).'"'],
            );
        }

        return $next($request);
    }
}
