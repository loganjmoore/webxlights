<?php

use App\Http\Controllers\GoogleAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// "Continue with Google". Under /api so nginx routes it to PHP, but in the web group so the
// session (which carries the OAuth state) starts on a top-level navigation from Google's
// domain, which the API group's Sanctum middleware would not treat as a stateful request.
Route::get('/api/auth/google/redirect', [GoogleAuthController::class, 'redirect'])->middleware('throttle:10,1');
Route::get('/api/auth/google/callback', [GoogleAuthController::class, 'callback'])->middleware('throttle:10,1');
