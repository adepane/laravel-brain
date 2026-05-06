<?php

declare(strict_types=1);

use LaraMint\LaravelBrain\Analysis\ContainerBindingAnalyzer;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

it('extracts singleton bindings from fixture AppServiceProvider', function () use ($fixtureProject) {
    $registry = (new ContainerBindingAnalyzer)->analyze($fixtureProject);
    $rec = $registry->get('App\Contracts\ThingRepositoryInterface');

    expect($rec)->not->toBeNull();
    expect($rec->concreteFqcn)->toBe('App\Repositories\SqlThingRepository');
    expect($rec->providerFqcn)->toBe('App\Providers\AppServiceProvider');
    expect($rec->kind)->toBe('singleton');
});
