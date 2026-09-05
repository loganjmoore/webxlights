<?php

use App\Services\Shader\Providers;

return [

    // The shader assistant. Absent in local development and in CI, which is why every path that
    // needs it checks rather than assuming - a server without a key answers 503 and refunds,
    // instead of throwing.
    // The shader assistant. Provider-agnostic on purpose: whoever runs a copy of this has
    // whatever account they already have, not the one the maintainer chose. See
    // app/Services/Shader/Providers.php for the names, docs/SHADER-ASSISTANT-COST.md for costs.
    // Automatic lyric timing: a speech-to-text endpoint that returns word timestamps, in
    // OpenAI's /audio/transcriptions shape. Off until a key is set.
    'lyrics' => [
        'key' => env('LYRICS_API_KEY', env('OPENAI_API_KEY')),
        'base_url' => env('LYRICS_BASE_URL', 'https://api.openai.com/v1'),
        'model' => env('LYRICS_MODEL', 'whisper-1'),
        // Server-funded listens per person per month; 0 means uncapped.
        'monthly_limit' => (int) env('LYRICS_MONTHLY_LIMIT', 20),
    ],

    'shader' => [
        'provider' => env('SHADER_PROVIDER', 'anthropic'),
        // One key for whichever provider is selected. SHADER_API_KEY is the name to use;
        // ANTHROPIC_API_KEY is read as well so an existing deployment keeps working.
        'key' => env('SHADER_API_KEY', env('ANTHROPIC_API_KEY')),
        // Empty means "use the provider preset's default", so setting a key is enough to start.
        'model' => env('SHADER_MODEL'),
        'base_url' => env('SHADER_BASE_URL', Providers::get(env('SHADER_PROVIDER', 'anthropic'))['base_url']),
        // A model running on the operator's own machine needs no key. Without this, the
        // zero-cost option would be unreachable because the key check would reject it.
        'local' => (bool) env('SHADER_LOCAL', false),
        'allow_user_keys' => (bool) env('SHADER_ALLOW_USER_KEYS', true),
        // How many server-funded generations one user gets per UTC day, on top of the credit
        // ledger and the per-minute throttle. 0 means uncapped. Bringing your own key bypasses
        // it entirely - your key, your bill. The default's arithmetic is in
        // docs/SHADER-ASSISTANT-COST.md; change it there too if you change it here.
        'daily_limit' => (int) env('SHADER_DAILY_LIMIT', 0),
        // How many server-funded generations one user gets per calendar month (UTC). This is the
        // allowance a signed-in person gets for free; the credit ledger records each one but no
        // longer gates them. 0 means uncapped. Your own key bypasses it - your key, your bill.
        'monthly_limit' => (int) env('SHADER_MONTHLY_LIMIT', 100),
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
