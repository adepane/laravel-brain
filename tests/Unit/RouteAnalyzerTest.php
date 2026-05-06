<?php

use LaraMint\LaravelBrain\Analysis\RouteAnalyzer;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

function findRoute(array $routes, callable $predicate): mixed
{
    foreach ($routes as $r) {
        if ($predicate($r)) {
            return $r;
        }
    }

    return null;
}

it('extracts basic routes from api.php', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    expect($routes)->not->toBeEmpty();
});

it('finds the POST /login route', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $login = findRoute($routes, fn ($r) => str_contains($r->uri, 'login'));

    expect($login)->not->toBeNull();
    expect($login->method)->toBe('POST');
    expect($login->controller)->toContain('AuthController');
    expect($login->action)->toBe('login');
});

it('extracts middleware from groups', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $ordersRoute = findRoute($routes, fn ($r) => $r->uri === '/orders' && $r->method === 'GET');

    expect($ordersRoute)->not->toBeNull();
    expect($ordersRoute->middlewares)->toContain('auth:sanctum');
});

it('applies prefix from nested group', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $adminRoute = findRoute($routes, fn ($r) => str_contains($r->uri, 'admin'));

    expect($adminRoute)->not->toBeNull();
    expect($adminRoute->uri)->toContain('/admin/');
    expect($adminRoute->middlewares)->toContain('role:admin');
});

it('finds 13 routes total', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    expect(count($routes))->toBe(13);
});

it('captures middleware chained after the HTTP method call', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $brandsRoute = findRoute($routes, fn ($r) => $r->uri === '/brands' && $r->method === 'GET');

    expect($brandsRoute)->not->toBeNull();
    expect($brandsRoute->middlewares)->toContain('ability:view-maintenance-requests,monitor-maintenance,create-transfer');
});
