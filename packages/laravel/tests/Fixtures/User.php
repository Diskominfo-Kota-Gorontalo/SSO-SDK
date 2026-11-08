<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Tests\Fixtures;

use Illuminate\Foundation\Auth\User as Authenticatable;

final class User extends Authenticatable
{
    protected $table = 'users';

    protected $guarded = [];
}
