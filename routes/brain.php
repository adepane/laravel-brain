<?php

use Illuminate\Support\Facades\Route;
use LaraMint\LaravelBrain\Http\Controllers\BrainController;

Route::prefix('_laravel-brain')->group(function () {
    Route::get('/api/source', [BrainController::class, 'source']);
    Route::post('/api/scan', [BrainController::class, 'scan']);
    Route::get('/{any?}', [BrainController::class, 'serve'])->where('any', '.*');
});
