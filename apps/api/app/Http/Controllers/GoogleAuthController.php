<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

// "Continue with Google". The plain OAuth 2.0 authorization-code flow, done with the HTTP
// client rather than a package: three requests, and nothing here needs more than that.
//
// The redirect and the callback are top-level navigations, not fetches, so the session cookie
// (SameSite=Lax) rides along on both and the `state` written on the way out is there to be
// checked on the way back.
class GoogleAuthController extends Controller
{
    private const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

    public static function enabled(): bool
    {
        return (bool) config('services.google.client_id') && (bool) config('services.google.client_secret');
    }

    public function redirect(Request $request)
    {
        abort_unless(self::enabled(), 404);

        $state = Str::random(40);
        $request->session()->put('google_oauth_state', $state);

        return redirect()->away(self::AUTH_URL.'?'.http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => $this->callbackUrl(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'prompt' => 'select_account',
        ]));
    }

    public function callback(Request $request)
    {
        abort_unless(self::enabled(), 404);

        $expected = $request->session()->pull('google_oauth_state');
        if (! $expected || ! hash_equals($expected, (string) $request->query('state', ''))) {
            return redirect()->away($this->appUrl('/auth?error=google'));
        }
        if (! $request->query('code')) {
            // The person pressed Cancel on Google's screen. Not an error worth a message.
            return redirect()->away($this->appUrl('/auth'));
        }

        $token = Http::asForm()->post(self::TOKEN_URL, [
            'code' => $request->query('code'),
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => $this->callbackUrl(),
            'grant_type' => 'authorization_code',
        ]);
        if (! $token->ok() || ! $token->json('access_token')) {
            return redirect()->away($this->appUrl('/auth?error=google'));
        }

        $info = Http::withToken($token->json('access_token'))->get(self::USERINFO_URL);
        $sub = $info->json('sub');
        $email = $info->json('email');
        if (! $info->ok() || ! $sub || ! $email || ! $info->json('email_verified')) {
            return redirect()->away($this->appUrl('/auth?error=google'));
        }

        // By Google id first, then by email so someone who registered with a password and now
        // presses the Google button lands in the account they already have.
        $user = User::where('google_id', $sub)->first()
            ?? User::where('email', $email)->first();
        if ($user) {
            if (! $user->google_id) {
                $user->forceFill(['google_id' => $sub])->save();
            }
        } else {
            $user = User::create([
                'name' => $info->json('name') ?: Str::before($email, '@'),
                'email' => $email,
                // Never used: this account signs in with Google. A random one keeps the column's
                // not-null contract and gives a password guesser nothing to guess.
                'password' => Hash::make(Str::random(64)),
            ]);
            $user->forceFill(['google_id' => $sub, 'email_verified_at' => now()])->save();
        }

        Auth::guard('web')->login($user, true);
        $request->session()->regenerate();

        return redirect()->away($this->appUrl('/projects'));
    }

    // What Google sends the browser back to, registered on the OAuth client exactly as built
    // here. From APP_URL rather than the request: behind Render's proxy the request would say
    // http, and through the Vite proxy in dev it would say localhost:8000, and Google rejects
    // anything that isn't the registered string. Dev sets GOOGLE_REDIRECT_URI to the 5173 one.
    private function callbackUrl(): string
    {
        return config('services.google.redirect') ?: rtrim(config('app.url'), '/').'/api/auth/google/callback';
    }

    // Where the browser goes afterwards: the same origin the callback lives on, for the same
    // reason. A relative redirect would be resolved against the request host, which through the
    // Vite proxy is localhost:8000, where there is no app to land in.
    private function appUrl(string $path): string
    {
        return preg_replace('#/api/auth/google/callback$#', '', $this->callbackUrl()).$path;
    }
}
