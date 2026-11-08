<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Auth;

use Gorontalokota\Sso\Laravel\Contracts\UserResolver;
use Gorontalokota\Sso\SsoUser;
use Gorontalokota\Sso\TokenSet;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/**
 * Default resolver driven by config('sso.user'):
 *  1. find the user by the "sub" column;
 *  2. otherwise link an existing, not-yet-linked user once via "match_by" (e.g. NIP or email);
 *  3. otherwise create one when "create" is true.
 * Columns listed in "sync" are refreshed from the claims on every login.
 */
class EloquentUserResolver implements UserResolver
{
    public function __construct(private readonly Repository $config) {}

    public function resolve(SsoUser $ssoUser, TokenSet $tokens): ?Authenticatable
    {
        /** @var class-string<Model&Authenticatable> $model */
        $model = (string) $this->config->get('sso.user.model');
        $subColumn = (string) $this->config->get('sso.user.sub_column', 'sso_sub');

        if (! is_subclass_of($model, Model::class)) {
            throw new InvalidArgumentException("sso.user.model [{$model}] must be an Eloquent model.");
        }

        $user = $model::query()->where($subColumn, $ssoUser->sub)->first() ?? $this->linkExisting($model, $subColumn, $ssoUser);

        if ($user === null && $this->config->get('sso.user.create', false)) {
            $user = new $model;
            $user->setAttribute($subColumn, $ssoUser->sub);
        }

        if ($user === null) {
            return null;
        }

        foreach ((array) $this->config->get('sso.user.sync', []) as $claim => $column) {
            $value = $this->claim($ssoUser, (string) $claim);

            if ($value !== null) {
                $user->setAttribute((string) $column, $value);
            }
        }

        $user->save();

        return $user;
    }

    /**
     * @param  class-string<Model&Authenticatable>  $model
     */
    protected function linkExisting(string $model, string $subColumn, SsoUser $ssoUser): ?Model
    {
        foreach ((array) $this->config->get('sso.user.match_by', []) as $claim => $column) {
            $value = $this->claim($ssoUser, (string) $claim);

            if ($value === null || $value === '') {
                continue;
            }

            $user = $model::query()->where((string) $column, $value)->whereNull($subColumn)->first();

            if ($user !== null) {
                $user->setAttribute($subColumn, $ssoUser->sub);

                return $user;
            }
        }

        return null;
    }

    protected function claim(SsoUser $ssoUser, string $claim): mixed
    {
        return match ($claim) {
            'nip' => $ssoUser->nip(),
            'nik' => $ssoUser->nik(),
            default => $ssoUser->claim($claim),
        };
    }
}
