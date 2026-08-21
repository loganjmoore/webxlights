<?php

return [

    // The shader assistant. Absent in local development and in CI, which is why every path that
    // needs it checks rather than assuming - a server without a key answers 503 and refunds,
    // instead of throwing.
    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        // Haiku is the default because generating a shader is a small, well-specified job and
        // the bill is dominated by output tokens. A frontier model costs roughly an order of
        // magnitude more per shader for a result the compile-and-repair loop mostly equalises,
        // and the operator of a public instance is paying for every one.
        'model' => env('SHADER_MODEL', 'claude-haiku-4-5'),
        // Whether a user may send their own key with a request. On for the hosted site, where it
        // is how someone keeps generating past their credits at their own expense; an operator
        // who would rather not proxy other people's keys can turn it off.
        'allow_user_keys' => (bool) env('SHADER_ALLOW_USER_KEYS', true),
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
