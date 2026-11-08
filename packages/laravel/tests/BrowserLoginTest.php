<?php

declare(strict_types=1);

namespace Gorontalokota\Sso\Laravel\Tests;

use Gorontalokota\Sso\Internal\JwtVerifier;
use Gorontalokota\Sso\Laravel\Events\SsoAuthenticated;
use Gorontalokota\Sso\Laravel\SsoManager;
use Gorontalokota\Sso\Laravel\Tests\Fixtures\User;
use Gorontalokota\Sso\Testing\FakeProvider;
use Illuminate\Support\Facades\Event;

final class BrowserLoginTest extends TestCase
{
    /**
     * Starts a login and returns the pending state and nonce sent to the SSO.
     *
     * @return array{state: string, nonce: string}
     */
    private function startLogin(string $returnTo = '/dashboard'): array
    {
        $response = $this->get('/sso/login?return_to='.urlencode($returnTo));
        parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

        return ['state' => (string) $query['state'], 'nonce' => (string) $query['nonce']];
    }

    private function ssoReturnsTokens(string $nonce, array $claims = []): void
    {
        $accessToken = $this->provider->accessToken();
        $this->provider->tokenResponse = [
            'access_token' => $accessToken, 'token_type' => 'Bearer', 'expires_in' => 600, 'refresh_token' => 'r1',
            'id_token' => $this->provider->idToken($nonce, ['at_hash' => JwtVerifier::hashClaim($accessToken), ...$claims]),
        ];
    }

    private function signIn(): User
    {
        $user = User::create(['nip' => '199001012020011001', 'name' => 'Nama Lama']);
        $login = $this->startLogin();
        $this->ssoReturnsTokens($login['nonce']);
        $this->get('/sso/callback?code=abc&state='.$login['state']);

        return $user;
    }

    public function test_login_redirects_to_the_sso_with_pkce(): void
    {
        $response = $this->get('/sso/login');

        $response->assertRedirect();
        $this->assertStringStartsWith(FakeProvider::ISSUER.'/authorize?', (string) $response->headers->get('Location'));
        $this->assertStringContainsString('code_challenge_method=S256', (string) $response->headers->get('Location'));
    }

    public function test_callback_links_an_existing_user_by_nip_and_signs_them_in(): void
    {
        Event::fake([SsoAuthenticated::class]);
        $user = User::create(['nip' => '199001012020011001', 'name' => 'Nama Lama']);
        $login = $this->startLogin('/dashboard?tab=2');
        $this->ssoReturnsTokens($login['nonce']);

        $this->get('/sso/callback?code=abc&state='.$login['state'])->assertRedirect('/dashboard?tab=2');

        $this->assertAuthenticatedAs($user);
        $this->assertSame('sub-123', $user->fresh()->sso_sub);
        $this->assertSame('Budi Santoso', $user->fresh()->name, 'Synced from the "name" claim.');
        Event::assertDispatched(SsoAuthenticated::class);
    }

    public function test_people_without_a_local_account_are_refused_when_creation_is_off(): void
    {
        $login = $this->startLogin();
        $this->ssoReturnsTokens($login['nonce']);

        $this->get('/sso/callback?code=abc&state='.$login['state'])->assertRedirect('/')->assertSessionHas('sso_error');

        $this->assertGuest();
    }

    public function test_users_are_created_when_enabled(): void
    {
        config(['sso.user.create' => true]);
        $login = $this->startLogin();
        $this->ssoReturnsTokens($login['nonce']);

        $this->get('/sso/callback?code=abc&state='.$login['state']);

        $this->assertAuthenticated();
        $this->assertSame('sub-123', User::query()->sole()->sso_sub);
    }

    public function test_a_denied_consent_shows_a_message(): void
    {
        $login = $this->startLogin();

        $this->get('/sso/callback?error=access_denied&state='.$login['state'])
            ->assertRedirect('/')
            ->assertSessionHas('sso_error', 'Anda membatalkan login atau menolak izin akses data.');
    }

    public function test_a_forged_state_is_rejected(): void
    {
        $login = $this->startLogin();
        $this->ssoReturnsTokens($login['nonce']);

        $this->get('/sso/callback?code=abc&state=forged')->assertSessionHas('sso_error');

        $this->assertGuest();
    }

    public function test_back_channel_logout_signs_the_user_out_on_the_next_request(): void
    {
        $this->signIn();
        $this->get('/dashboard')->assertOk();

        $this->post('/sso/backchannel-logout', ['logout_token' => $this->provider->logoutToken()])
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');

        $this->get('/dashboard')->assertRedirect('/')->assertSessionHas('sso_error');
        $this->assertGuest();
    }

    public function test_an_invalid_logout_token_is_answered_with_400(): void
    {
        $this->post('/sso/backchannel-logout', ['logout_token' => 'not-a-jwt'])->assertStatus(400);
        $this->post('/sso/backchannel-logout')->assertStatus(400);
    }

    public function test_logout_ends_the_local_session_and_redirects_to_the_sso(): void
    {
        $this->signIn();

        $response = $this->post('/sso/logout');

        $this->assertStringStartsWith(FakeProvider::ISSUER.'/logout?', (string) $response->headers->get('Location'));
        $this->assertStringContainsString('id_token_hint=', (string) $response->headers->get('Location'));
        $this->assertGuest();
        $this->assertNull(session(SsoManager::SESSION_KEY));
    }

    public function test_the_user_endpoint_serves_spa_frontends(): void
    {
        $this->getJson('/sso/user')->assertUnauthorized();

        $this->signIn();

        $this->getJson('/sso/user')->assertOk()->assertJsonPath('user.sub', 'sub-123')->assertJsonMissingPath('user.nonce');
    }
}
