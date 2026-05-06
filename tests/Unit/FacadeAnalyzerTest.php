<?php

declare(strict_types=1);

use LaraMint\LaravelBrain\Analysis\ContainerBindingRecord;
use LaraMint\LaravelBrain\Analysis\ContainerBindingRegistry;
use LaraMint\LaravelBrain\Analysis\FacadeAnalyzer;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

it('discovers a facade via multi-level inheritance (class → abstract parent → Facade)', function () use ($fixtureProject) {
    $registry = (new FacadeAnalyzer)->analyze($fixtureProject);

    // ShortUrlV3Facade extends AbstractVersionedShortUrlFacade extends Facade.
    // getFacadeAccessor() is defined on the abstract parent, not on the concrete class.
    $record = $registry->get('App\Services\V3\ShortUrlV3Facade');
    expect($record)->not->toBeNull();
    expect($record->accessor)->toBe('App\Services\V3\ShortUrlV3Service');
    expect($record->concreteFqcn)->toBe('App\Services\V3\ShortUrlV3Service');
});

it('does not register abstract intermediate facade classes', function () use ($fixtureProject) {
    $registry = (new FacadeAnalyzer)->analyze($fixtureProject);

    // AbstractVersionedShortUrlFacade is abstract and must not appear in the registry.
    expect($registry->get('App\Services\V3\AbstractVersionedShortUrlFacade'))->toBeNull();
});

it('discovers a facade that returns a string key accessor', function () use ($fixtureProject) {
    $registry = (new FacadeAnalyzer)->analyze($fixtureProject);

    $record = $registry->get('App\Services\V3\ShortUrlV3KeyFacade');
    expect($record)->not->toBeNull();
    expect($record->accessor)->toBe('short-url-v3');
    expect($record->concreteFqcn)->toBeNull();
});

it('resolves string-key accessor via container binding registry', function () use ($fixtureProject) {
    $facadeRegistry = (new FacadeAnalyzer)->analyze($fixtureProject);

    $bindings = new ContainerBindingRegistry;
    $bindings->add(new ContainerBindingRecord(
        abstractFqcn: 'short-url-v3',
        concreteFqcn: 'App\Services\V3\ShortUrlV3Service',
        providerFqcn: 'App\Providers\AppServiceProvider',
        kind: 'singleton',
    ));

    $facadeRegistry->resolveWith($bindings);

    $record = $facadeRegistry->get('App\Services\V3\ShortUrlV3KeyFacade');
    expect($record?->concreteFqcn)->toBe('App\Services\V3\ShortUrlV3Service');
});

it('returns an empty registry for a project without an app/ directory', function () {
    $registry = (new FacadeAnalyzer)->analyze('/nonexistent/path');
    expect($registry->all())->toBeEmpty();
});

it('does not register non-facade classes', function () use ($fixtureProject) {
    $registry = (new FacadeAnalyzer)->analyze($fixtureProject);

    expect($registry->get('App\Services\V3\ShortUrlV3Service'))->toBeNull();
});

it('resolveWith does not overwrite an already-resolved concreteFqcn', function () use ($fixtureProject) {
    $facadeRegistry = (new FacadeAnalyzer)->analyze($fixtureProject);

    $bindings = new ContainerBindingRegistry;
    $bindings->add(new ContainerBindingRecord(
        abstractFqcn: 'App\Services\V3\ShortUrlV3Service',
        concreteFqcn: 'App\Services\V3\SomeOtherService',
        providerFqcn: 'App\Providers\AppServiceProvider',
        kind: 'singleton',
    ));

    $facadeRegistry->resolveWith($bindings);

    // The ::class accessor was already resolved — must not be overwritten.
    $record = $facadeRegistry->get('App\Services\V3\ShortUrlV3Facade');
    expect($record?->concreteFqcn)->toBe('App\Services\V3\ShortUrlV3Service');
});
