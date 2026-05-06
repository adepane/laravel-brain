<?php

use LaraMint\LaravelBrain\Analysis\ControllerAnalyzer;
use LaraMint\LaravelBrain\Analysis\ControllerMiddleware;
use LaraMint\LaravelBrain\Analysis\MethodTracer;
use LaraMint\LaravelBrain\Analysis\RouteAnalyzer;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

it('resolves controller files from routes', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    expect($controllers)->not->toBeEmpty();
});

it('extracts constructor dependencies', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    $authController = null;
    foreach ($controllers as $c) {
        if (str_contains($c->fqcn, 'AuthController')) {
            $authController = $c;
            break;
        }
    }

    expect($authController)->not->toBeNull();
    expect($authController->constructorDeps)->toHaveKey('authService');
});

it('extracts HasMiddleware static middleware() declarations', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    $userController = null;
    foreach ($controllers as $c) {
        if (str_contains($c->fqcn, 'UserController')) {
            $userController = $c;
            break;
        }
    }

    expect($userController)->not->toBeNull();

    $middlewareNames = array_map(fn ($m) => $m->middleware, $userController->middlewares);
    expect($middlewareNames)->toContain('auth');
    expect($middlewareNames)->toContain('log');
    expect($middlewareNames)->toContain('subscribed');

    // 'log' applies only to index + show
    $logMw = collect($userController->middlewares)->first(fn ($m) => $m->middleware === 'log');
    expect($logMw->only)->toBe(['index', 'show']);
    expect($logMw->except)->toBeNull();

    // 'subscribed' applies to all except index
    $subscribedMw = collect($userController->middlewares)->first(fn ($m) => $m->middleware === 'subscribed');
    expect($subscribedMw->only)->toBeNull();
    expect($subscribedMw->except)->toBe(['index']);
});

it('extracts $this->middleware() calls from constructor', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    $profileController = null;
    foreach ($controllers as $c) {
        if (str_contains($c->fqcn, 'ProfileController')) {
            $profileController = $c;
            break;
        }
    }

    expect($profileController)->not->toBeNull();

    $middlewareNames = array_map(fn ($m) => $m->middleware, $profileController->middlewares);
    expect($middlewareNames)->toContain('auth');
    expect($middlewareNames)->toContain('verified');
    expect($middlewareNames)->toContain('log');

    // 'verified' only for store
    $verifiedMw = collect($profileController->middlewares)->first(fn ($m) => $m->middleware === 'verified');
    expect($verifiedMw->only)->toBe(['store']);

    // 'log' except destroy (fluent chain)
    $logMw = collect($profileController->middlewares)->first(fn ($m) => $m->middleware === 'log');
    expect($logMw->except)->toBe(['destroy']);
});

it('HasMiddleware::appliesToAction() respects only/except', function () {
    $auth = new ControllerMiddleware('auth');
    $log = new ControllerMiddleware('log', only: ['index', 'show']);
    $sub = new ControllerMiddleware('subscribed', except: ['index']);

    expect($auth->appliesToAction('index'))->toBeTrue();
    expect($auth->appliesToAction('destroy'))->toBeTrue();

    expect($log->appliesToAction('index'))->toBeTrue();
    expect($log->appliesToAction('show'))->toBeTrue();
    expect($log->appliesToAction('store'))->toBeFalse();

    expect($sub->appliesToAction('index'))->toBeFalse();
    expect($sub->appliesToAction('store'))->toBeTrue();
});

it('resolves same-namespace extends to FQCN and merges inherited actions', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    $v3 = $controllers['App\\Http\\Controllers\\V3\\ThingV3Controller'] ?? null;
    expect($v3)->not->toBeNull();
    expect($v3->parent)->toBe('App\\Http\\Controllers\\V3\\AbstractThingController');

    $names = array_map(fn ($m) => $m->name, $v3->methods);
    expect($names)->toContain('index');
    expect($names)->toContain('label');
    expect($v3->ancestorFqcns)->toBe(['App\\Http\\Controllers\\V3\\AbstractThingController']);

    expect($v3->constructorDeps)->toHaveKey('fixtureHelper')
        ->and($v3->constructorDeps['fixtureHelper'])->toBe('App\\Services\\V3\\FixtureV3Helper');
});

it('resolves $this inside inherited methods against the declaring class', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $analyzer = new ControllerAnalyzer;
    $controllers = $analyzer->analyze($fixtureProject, $routes);
    $edges = (new MethodTracer)->trace($controllers, $analyzer->getPsr4Map(), $fixtureProject);

    $ping = array_filter(
        $edges,
        fn ($e) => $e->callerMethod === 'index'
            && $e->callerFqcn === 'App\\Http\\Controllers\\V3\\ThingV3Controller'
            && $e->calleeFqcn === 'App\\Services\\V3\\FixtureV3Helper'
            && $e->calleeMethod === 'ping'
    );
    expect($ping)->not->toBeEmpty();

    $wrong = array_filter($edges, fn ($e) => $e->calleeMethod === 'warmPanelCache'
        && $e->calleeFqcn === 'App\\Http\\Controllers\\V3\\ThingV3Controller');
    expect($wrong)->toBeEmpty();

    $right = array_filter($edges, fn ($e) => $e->calleeMethod === 'warmPanelCache'
        && $e->calleeFqcn === 'App\\Http\\Controllers\\V3\\AbstractThingController');
    expect($right)->not->toBeEmpty();
});

it('traces call chains for actions declared only on abstract parents', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $analyzer = new ControllerAnalyzer;
    $controllers = $analyzer->analyze($fixtureProject, $routes);
    $edges = (new MethodTracer)->trace($controllers, $analyzer->getPsr4Map(), $fixtureProject);

    $fromInherited = array_filter(
        $edges,
        fn ($e) => $e->callerFqcn === 'App\\Http\\Controllers\\V3\\ThingV3Controller'
            && $e->callerMethod === 'index'
            && $e->type === 'view'
    );

    expect($fromInherited)->not->toBeEmpty();
});

it('finds methods on controllers', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);

    $orderController = null;
    foreach ($controllers as $c) {
        if (str_contains($c->fqcn, 'OrderController')) {
            $orderController = $c;
            break;
        }
    }

    expect($orderController)->not->toBeNull();

    $methodNames = array_map(fn ($m) => $m->name, $orderController->methods);
    expect($methodNames)->toContain('index');
    expect($methodNames)->toContain('store');
    expect($methodNames)->toContain('show');
    expect($methodNames)->toContain('destroy');
});
