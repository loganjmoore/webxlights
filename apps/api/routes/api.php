<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ControllerController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\LayoutController;
use App\Http\Controllers\LayoutVersionController;
use App\Http\Controllers\ModelEntityController;
use App\Http\Controllers\ModelGroupController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectMemberController;
use App\Http\Controllers\LibraryController;
use App\Http\Controllers\LyricAlignmentController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\SequenceController;
use App\Http\Controllers\SequencerViewController;
use App\Http\Controllers\SequenceVersionController;
use App\Http\Controllers\ShaderController;
use App\Http\Controllers\ShaderGenerationController;
use App\Http\Controllers\ViewObjectController;
use Illuminate\Support\Facades\Route;

// The two routes anyone on the internet can hit without an account. Throttled per IP so a
// password can't be guessed at speed and accounts can't be minted by a script.
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
// Which sign-in buttons to offer besides email and password. The Google redirect and callback
// themselves live in routes/web.php: the callback arrives from Google, with no Referer that
// Sanctum would count as stateful, and it needs the session all the same.
Route::get('/auth/providers', fn () => ['google' => GoogleAuthController::enabled()]);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::prefix('v1')->group(function () {
        // The shader library. Not scoped to a layout or a project, unlike everything else
        // here: a shader is content one person makes and everyone can use.
        Route::get('shaders', [ShaderController::class, 'index']);
        Route::post('shaders', [ShaderController::class, 'store']);
        Route::get('shaders/{shader}', [ShaderController::class, 'show']);
        Route::patch('shaders/{shader}', [ShaderController::class, 'update']);
        Route::delete('shaders/{shader}', [ShaderController::class, 'destroy']);
        Route::post('shaders/{shader}/used', [ShaderController::class, 'used']);
        Route::post('shaders/{shader}/favourite', [ShaderController::class, 'favourite']);
        Route::delete('shaders/{shader}/favourite', [ShaderController::class, 'unfavourite']);

        // Rate limited on top of the credit cost. Credits stop a user spending more than they
        // have; this stops a script spending a whole balance in a second and stops one account
        // monopolising the upstream.
        Route::post('shaders/generate', [ShaderGenerationController::class, 'generate'])
            ->middleware('throttle:10,1');
        Route::get('credits', [ShaderGenerationController::class, 'credits']);

        Route::apiResource('projects', ProjectController::class)->only(['index', 'store', 'show']);
        Route::get('projects/{project}/layouts', [LayoutController::class, 'index']);

        Route::get('layouts/{layout}/models', [ModelEntityController::class, 'index']);
        Route::post('layouts/{layout}/models/bulk', [ModelEntityController::class, 'bulkUpsert']);
        Route::patch('layouts/{layout}/models/{model}', [ModelEntityController::class, 'update']);
        Route::delete('layouts/{layout}/models/{model}', [ModelEntityController::class, 'destroy']);

        Route::get('layouts/{layout}/model-groups', [ModelGroupController::class, 'index']);
        Route::post('layouts/{layout}/model-groups/bulk', [ModelGroupController::class, 'bulkUpsert']);
        Route::delete('layouts/{layout}/model-groups/{modelGroup}', [ModelGroupController::class, 'destroy']);

        Route::get('layouts/{layout}/views', [SequencerViewController::class, 'index']);
        Route::put('layouts/{layout}/views', [SequencerViewController::class, 'replace']);
        Route::get('layouts/{layout}/effect-presets', [SequencerViewController::class, 'presets']);
        Route::put('layouts/{layout}/effect-presets', [SequencerViewController::class, 'replacePresets']);
        Route::get('layouts/{layout}/house-model', [\App\Http\Controllers\HouseModelController::class, 'show']);
        Route::post('layouts/{layout}/house-model/lookup', [\App\Http\Controllers\HouseDraftController::class, 'lookup'])->middleware('throttle:10,1,house-lookup:');
        Route::post('layouts/{layout}/house-model/generate', [\App\Http\Controllers\HouseDraftController::class, 'generate'])->middleware('throttle:3,1,house-generate:');
        Route::put('layouts/{layout}/house-model', [\App\Http\Controllers\HouseModelController::class, 'replace']);
        Route::put('layouts/{layout}/background', [SequencerViewController::class, 'replaceBackground']);

        Route::get('layouts/{layout}/view-objects', [ViewObjectController::class, 'index']);
        Route::post('layouts/{layout}/view-objects/bulk', [ViewObjectController::class, 'bulkUpsert']);

        Route::get('projects/{project}/sequences', [SequenceController::class, 'index']);
        Route::post('projects/{project}/sequences', [SequenceController::class, 'store']);
        Route::get('sequences/{sequence}', [SequenceController::class, 'show']);
        Route::patch('sequences/{sequence}', [SequenceController::class, 'updateSettings']);
        Route::put('sequences/{sequence}/body', [SequenceController::class, 'updateBody']);
        Route::delete('sequences/{sequence}', [SequenceController::class, 'destroy']);
        Route::post('sequences/{sequence}/audio', [SequenceController::class, 'uploadAudio']);
        Route::get('sequences/{sequence}/audio', [SequenceController::class, 'audio']);
        // A project's files: the audio and images it has uploaded.
        Route::get('projects/{project}/media', [MediaController::class, 'index']);
        Route::post('projects/{project}/media', [MediaController::class, 'store']);
        Route::patch('media/{media}', [MediaController::class, 'update']);
        Route::delete('media/{media}', [MediaController::class, 'destroy']);
        Route::get('media/{media}/file', [MediaController::class, 'file']);
        // Automatic lyric timing. Each listen is a paid call, so a burst is stopped at the door.
        Route::post('sequences/{sequence}/lyrics', [LyricAlignmentController::class, 'store'])->middleware('throttle:6,1');
        Route::get('sequences/{sequence}/lyrics', [LyricAlignmentController::class, 'latest']);
        // The shared sequence library.
        Route::get('library', [LibraryController::class, 'index']);
        Route::get('library/{library}', [LibraryController::class, 'show']);
        Route::get('library/{library}/audio', [LibraryController::class, 'audio']);
        Route::post('library/{library}/copy', [LibraryController::class, 'copy']);
        Route::delete('library/{library}', [LibraryController::class, 'destroy']);
        Route::post('sequences/{sequence}/publish', [LibraryController::class, 'publish'])->middleware('throttle:10,1');

        Route::get('layouts/{layout}/versions', [LayoutVersionController::class, 'index']);
        Route::post('layouts/{layout}/versions', [LayoutVersionController::class, 'store']);
        Route::post('layouts/{layout}/versions/{version}/restore', [LayoutVersionController::class, 'restore']);
        Route::post('layouts/{layout}/versions/purge', [LayoutVersionController::class, 'purge']);
        Route::get('sequences/{sequence}/versions', [SequenceVersionController::class, 'index']);
        Route::post('sequences/{sequence}/versions', [SequenceVersionController::class, 'store']);
        Route::post('sequences/{sequence}/versions/{version}/restore', [SequenceVersionController::class, 'restore']);
        Route::post('sequences/{sequence}/versions/purge', [SequenceVersionController::class, 'purge']);
        Route::delete('sequences/{sequence}/versions/{version}', [SequenceVersionController::class, 'destroy']);

        Route::get('projects/{project}/members', [ProjectMemberController::class, 'index']);
        Route::post('projects/{project}/members', [ProjectMemberController::class, 'store']);
        Route::delete('projects/{project}/members/{user}', [ProjectMemberController::class, 'destroy']);

        Route::get('projects/{project}/controllers', [ControllerController::class, 'index']);
        Route::post('projects/{project}/controllers', [ControllerController::class, 'store']);
        Route::patch('controllers/{controller}', [ControllerController::class, 'update']);
        Route::delete('controllers/{controller}', [ControllerController::class, 'destroy']);
    });
});
