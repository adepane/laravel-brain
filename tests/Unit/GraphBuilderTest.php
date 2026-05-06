<?php

use LaraMint\LaravelBrain\Analysis\ContainerBindingAnalyzer;
use LaraMint\LaravelBrain\Analysis\ControllerAnalyzer;
use LaraMint\LaravelBrain\Analysis\MethodTracer;
use LaraMint\LaravelBrain\Analysis\MiddlewareRegistry;
use LaraMint\LaravelBrain\Analysis\ModelAnalyzer;
use LaraMint\LaravelBrain\Analysis\RouteAnalyzer;
use LaraMint\LaravelBrain\Graph\GraphBuilder;

$fixtureProject = __DIR__.'/../fixtures/laravel-project';

it('builds a graph with nodes and edges from fixture project', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);
    $modelFqcns = array_map(fn ($t) => $t->calleeFqcn, array_filter($traces, fn ($t) => $t->type === 'model'));
    $models = (new ModelAnalyzer)->analyze($fixtureProject, $modelFqcns);

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);

    expect($graph->nodeCount())->toBeGreaterThan(0);
    expect($graph->edgeCount())->toBeGreaterThan(0);
});

it('produces valid JSON output', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);

    $modelFqcns = array_map(fn ($t) => $t->calleeFqcn, array_filter($traces, fn ($t) => $t->type === 'model'));
    $models = (new ModelAnalyzer)->analyze($fixtureProject, $modelFqcns);

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);
    $json = $graph->toJson();
    $decoded = json_decode($json, true);

    expect($decoded)->toHaveKey('meta');
    expect($decoded)->toHaveKey('nodes');
    expect($decoded)->toHaveKey('edges');
    expect($decoded['meta'])->toHaveKey('project');
    expect($decoded['nodes'])->toBeArray();
    expect($decoded['edges'])->toBeArray();
});

it('creates route nodes for each route', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);
    $models = [];

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models);

    $routeNodes = array_filter($graph->nodes(), fn ($n) => $n->type === 'route');
    expect(count($routeNodes))->toBe(count($routes));
});

it('exposes parent controller nodes and extends edges for inherited actions', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $controllers = (new ControllerAnalyzer)->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers);
    $models = [];

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models, $fixtureProject);

    $extends = array_values(array_filter($graph->edges(), fn ($e) => $e->type === 'controller-extends'));
    expect($extends)->not->toBeEmpty();

    $ids = array_map(fn ($n) => $n->id, $graph->nodes());
    expect($ids)->toContain('controller::App\\Http\\Controllers\\V3\\AbstractThingController');

    $handlesFromParent = array_filter(
        $graph->edges(),
        fn ($e) => $e->type === 'controller-to-action'
            && $e->source === 'controller::App\\Http\\Controllers\\V3\\AbstractThingController'
    );
    expect($handlesFromParent)->not->toBeEmpty();
});

it('wires form request rules nodes and exposes validationRules on graph nodes', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $analyzer = new ControllerAnalyzer;
    $controllers = $analyzer->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers, $analyzer->getPsr4Map(), $fixtureProject);
    $models = [];

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models, $fixtureProject);

    $frEdges = array_values(array_filter($graph->edges(), fn ($e) => $e->type === 'action-to-form-request'));
    expect($frEdges)->not->toBeEmpty();

    $formRequestNodes = array_values(array_filter(
        $graph->nodes(),
        fn ($n) => ($n->data['fqcn'] ?? '') === 'App\\Http\\Requests\\ProfileStoreRequest'
            && ($n->data['method'] ?? '') === 'rules'
    ));
    expect($formRequestNodes)->not->toBeEmpty();
    expect($formRequestNodes[0]->type)->toBe('validation_request');
    expect($formRequestNodes[0]->data['validationRules'] ?? [])->toBeArray()->not->toBeEmpty();
});

it('adds IoC binding edges from service providers to interfaces and implementations', function () use ($fixtureProject) {
    $routes = (new RouteAnalyzer)->analyze($fixtureProject);
    $middlewareRegistry = new MiddlewareRegistry([], [], []);
    $analyzer = new ControllerAnalyzer;
    $controllers = $analyzer->analyze($fixtureProject, $routes);
    $traces = (new MethodTracer)->trace($controllers, $analyzer->getPsr4Map(), $fixtureProject);
    $models = [];
    $bindings = (new ContainerBindingAnalyzer)->analyze($fixtureProject);

    $graph = (new GraphBuilder)->build('test', $routes, $middlewareRegistry, $controllers, $traces, $models, $fixtureProject, [], $bindings);

    $types = array_map(fn ($e) => $e->type, $graph->edges());
    expect($types)->toContain('binding-resolution');
    expect($types)->toContain('binding-registered-in');

    $resolution = array_values(array_filter($graph->edges(), fn ($e) => $e->type === 'binding-resolution'));
    expect($resolution)->not->toBeEmpty();
    expect($resolution[0]->label)->toContain('SqlThingRepository');
});
