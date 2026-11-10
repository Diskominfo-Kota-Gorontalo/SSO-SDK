<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Tests;

final class ApiGuardTest extends TestCase
{
    public function test_a_valid_bearer_token_authenticates_the_api_call(): void
    {
        $this->withToken($this->provider->accessToken())->getJson('/api/profil')->assertOk()->assertJson(['sub' => 'sub-123']);
    }

    public function test_missing_or_invalid_tokens_are_unauthorized(): void
    {
        $this->getJson('/api/profil')->assertUnauthorized();
        $this->withToken('garbage')->getJson('/api/profil')->assertUnauthorized();
        $this->withToken($this->provider->accessToken(['aud' => 'aplikasi-lain']))->getJson('/api/profil')->assertUnauthorized();
    }

    public function test_routes_can_require_scopes(): void
    {
        $this->withToken($this->provider->accessToken())->getJson('/api/kepegawaian')
            ->assertForbidden()
            ->assertJsonPath('missing_scopes', ['employee']);

        $this->withToken($this->provider->accessToken(['scope' => 'openid employee']))->getJson('/api/kepegawaian')->assertOk();
    }
}
