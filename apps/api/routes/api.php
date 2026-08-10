<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\LayoutController;
use App\Http\Controllers\ModelEntityController;
use App\Http\Controllers\ModelGroupController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectMemberController;
use App\Http\Controllers\SequenceController;
use App\Http\Controllers\SequenceVersionController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::prefix('v1')->group(function () {
        Route::apiResource('projects', ProjectController::class)->only(['index', 'store', 'show']);
        Route::get('projects/{project}/layouts', [LayoutController::class, 'index']);

        Route::get('layouts/{layout}/models', [ModelEntityController::class, 'index']);
        Route::post('layouts/{layout}/models/bulk', [ModelEntityController::class, 'bulkUpsert']);
        Route::patch('layouts/{layout}/models/{model}', [ModelEntityController::class, 'update']);

        Route::get('layouts/{layout}/model-groups', [ModelGroupController::class, 'index']);
        Route::post('layouts/{layout}/model-groups/bulk', [ModelGroupController::class, 'bulkUpsert']);

        Route::get('projects/{project}/sequences', [SequenceController::class, 'index']);
        Route::post('projects/{project}/sequences', [SequenceController::class, 'store']);
        Route::get('sequences/{sequence}', [SequenceController::class, 'show']);
        Route::put('sequences/{sequence}/body', [SequenceController::class, 'updateBody']);
        Route::post('sequences/{sequence}/audio', [SequenceController::class, 'uploadAudio']);
        Route::get('sequences/{sequence}/audio', [SequenceController::class, 'audio']);

        Route::get('sequences/{sequence}/versions', [SequenceVersionController::class, 'index']);
        Route::post('sequences/{sequence}/versions', [SequenceVersionController::class, 'store']);
        Route::post('sequences/{sequence}/versions/{version}/restore', [SequenceVersionController::class, 'restore']);

        Route::get('projects/{project}/members', [ProjectMemberController::class, 'index']);
        Route::post('projects/{project}/members', [ProjectMemberController::class, 'store']);
        Route::delete('projects/{project}/members/{user}', [ProjectMemberController::class, 'destroy']);
    });
});
