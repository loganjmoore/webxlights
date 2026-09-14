<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The redirect override in a developer's .env must not leak in: the test pins APP_URL's form.
        config(['services.google.client_id' => 'id', 'services.google.client_secret' => 'secret', 'services.google.redirect' => null]);
    }

    private function fakeGoogle(array $profile): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'tok']),
            'openidconnect.googleapis.com/*' => Http::response($profile),
        ]);
    }

    private function state(): string
    {
        $redirect = $this->get('/api/auth/google/redirect');
        $redirect->assertRedirect();
        parse_str(parse_url($redirect->headers->get('Location'), PHP_URL_QUERY), $query);
        $this->assertSame('http://localhost/api/auth/google/callback', $query['redirect_uri']);

        return $query['state'];
    }

    public function test_the_button_is_offered_only_when_configured(): void
    {
        $this->getJson('/api/auth/providers')->assertOk()->assertJson(['google' => true]);
        config(['services.google.client_id' => null]);
        $this->getJson('/api/auth/providers')->assertJson(['google' => false]);
        $this->get('/api/auth/google/redirect')->assertNotFound();
    }

    public function test_embedded_browsers_get_recovery_instead_of_a_google_redirect(): void
    {
        Http::fake();
        $browsers = [
            'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/139.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/530.0.0.0;]',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/530.0.0.0;]',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 390.0.0',
            'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 Version/4.0 Chrome/139.0 Mobile Safari/537.36',
        ];
        foreach ($browsers as $browser) {
            $this->withHeader('User-Agent', $browser)
                ->getJson('/api/auth/providers')
                ->assertOk()->assertJson(['google' => true, 'google_requires_browser' => true]);
            $this->withSession(['google_oauth_state' => 'stale-state'])
                ->get('/api/auth/google/redirect')
                ->assertRedirect('/auth?error=google_browser')
                ->assertSessionMissing('google_oauth_state');
        }
        Http::assertNothingSent();
        $this->assertGuest('web');
    }

    public function test_regular_mobile_browsers_can_start_google_sign_in(): void
    {
        $browsers = [
            'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
        ];
        foreach ($browsers as $browser) {
            $this->withHeader('User-Agent', $browser)
                ->getJson('/api/auth/providers')
                ->assertOk()->assertJson(['google' => true, 'google_requires_browser' => false]);
            $response = $this->get('/api/auth/google/redirect')->assertRedirect();
            $this->assertSame('accounts.google.com', parse_url($response->headers->get('Location'), PHP_URL_HOST));
            $response->assertSessionHas('google_oauth_state');
        }
    }

    public function test_a_new_person_gets_an_account_and_a_session(): void
    {
        $this->fakeGoogle(['sub' => 'g-1', 'email' => 'sam@example.com', 'email_verified' => true, 'name' => 'Sam']);

        $this->get('/api/auth/google/callback?code=abc&state='.$this->state())->assertRedirect('/projects');

        $user = User::where('email', 'sam@example.com')->first();
        $this->assertSame('g-1', $user->google_id);
        $this->assertSame('Sam', $user->name);
        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_an_existing_email_is_linked_rather_than_duplicated(): void
    {
        $existing = User::factory()->create(['email' => 'sam@example.com']);
        $this->fakeGoogle(['sub' => 'g-2', 'email' => 'sam@example.com', 'email_verified' => true, 'name' => 'Other']);

        $this->get('/api/auth/google/callback?code=abc&state='.$this->state())->assertRedirect('/projects');

        $this->assertSame(1, User::count());
        $this->assertSame('g-2', $existing->fresh()->google_id);
        $this->assertAuthenticatedAs($existing, 'web');
    }

    public function test_a_wrong_state_is_refused(): void
    {
        $this->fakeGoogle(['sub' => 'g-3', 'email' => 'sam@example.com', 'email_verified' => true]);
        $this->state();
        $this->get('/api/auth/google/callback?code=abc&state=forged')->assertRedirect('/auth?error=google');
        $this->assertGuest('web');
        $this->assertSame(0, User::count());
    }

    public function test_an_unverified_email_is_refused(): void
    {
        $this->fakeGoogle(['sub' => 'g-4', 'email' => 'sam@example.com', 'email_verified' => false]);
        $this->get('/api/auth/google/callback?code=abc&state='.$this->state())->assertRedirect('/auth?error=google');
        $this->assertGuest('web');
        $this->assertSame(0, User::count());
    }
}
