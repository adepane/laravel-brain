<?php

use LaraMint\LaravelBrain\Analysis\FilamentAnalyzer;

$fixture = __DIR__.'/../fixtures/filament-project';
$discoverFixture = __DIR__.'/../fixtures/filament-discover-project';

it('returns detected=false when Filament is not installed', function () {
    $result = (new FilamentAnalyzer)->analyze(__DIR__.'/../fixtures/laravel-project');

    expect($result['detected'])->toBeFalse();
    expect($result['panels'])->toBeEmpty();
    expect($result['resources'])->toBeEmpty();
});

it('detects Filament when vendor directory exists', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    expect($result['detected'])->toBeTrue();
});

it('extracts the admin panel definition', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    expect($result['panels'])->toHaveCount(1);

    $panel = $result['panels'][0];
    expect($panel->id)->toBe('admin');
    expect($panel->path)->toBe('/admin');
    expect($panel->fqcn)->toBe('App\\Providers\\Filament\\AdminPanelProvider');
    expect($panel->resources)->toContain('App\\Filament\\Resources\\PostResource');
    expect($panel->pages)->toContain('App\\Filament\\Pages\\Settings');
    expect($panel->widgets)->toContain('App\\Filament\\Widgets\\PostStatsWidget');
});

it('extracts PostResource with correct model FQCN', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    expect($result['resources'])->toHaveCount(1);

    $resource = $result['resources'][0];
    expect($resource->fqcn)->toBe('App\\Filament\\Resources\\PostResource');
    expect($resource->modelFqcn)->toBe('App\\Models\\Post');
    expect($resource->panelId)->toBe('admin');
});

it('extracts resource pages from getPages()', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    $resource = $result['resources'][0];
    expect($resource->pages)->toHaveKey('index');
    expect($resource->pages)->toHaveKey('create');
    expect($resource->pages)->toHaveKey('edit');
    expect($resource->pages['index'])->toContain('ListPosts');
    expect($resource->pages['create'])->toContain('CreatePost');
    expect($resource->pages['edit'])->toContain('EditPost');
});

it('extracts relation managers from getRelations()', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    $resource = $result['resources'][0];
    expect($resource->relations)->toHaveCount(1);
    expect($resource->relations[0])->toContain('CommentsRelationManager');
});

it('extracts relation manager definitions', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    expect($result['relationManagers'])->toHaveCount(1);

    $rm = $result['relationManagers'][0];
    expect($rm->fqcn)->toContain('CommentsRelationManager');
    expect($rm->relationship)->toBe('comments');
    expect($rm->parentResourceFqcn)->toContain('PostResource');
});

it('extracts widget definitions', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    expect($result['widgets'])->toHaveCount(1);

    $widget = $result['widgets'][0];
    expect($widget->fqcn)->toBe('App\\Filament\\Widgets\\PostStatsWidget');
    expect($widget->widgetType)->toBe('stats-overview');
});

it('extracts custom page definitions', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    $customPages = array_filter(
        $result['pages'],
        fn ($p) => $p->pageType === 'custom'
    );
    expect(count($customPages))->toBeGreaterThanOrEqual(1);

    $settings = array_values(array_filter($customPages, fn ($p) => str_contains($p->fqcn, 'Settings')));
    expect($settings)->toHaveCount(1);
    expect($settings[0]->fqcn)->toBe('App\\Filament\\Pages\\Settings');
});

it('classifies resource pages by type', function () use ($fixture) {
    $result = (new FilamentAnalyzer)->analyze($fixture);

    $resourcePages = array_filter(
        $result['pages'],
        fn ($p) => $p->pageType !== 'custom'
    );

    $types = array_column(array_values($resourcePages), 'pageType');
    expect($types)->toContain('index');
    expect($types)->toContain('create');
    expect($types)->toContain('edit');
});

// ── discoverResources / discoverPages tests ───────────────────────────────────

it('detects discoverResources namespace from panel provider', function () use ($discoverFixture) {
    $result = (new FilamentAnalyzer)->analyze($discoverFixture);

    expect($result['detected'])->toBeTrue();

    $panel = $result['panels'][0];
    expect($panel->discoverResourcesFor)->toContain('App\\Filament\\Resources');
    expect($panel->discoverPagesFor)->toContain('App\\Filament\\Pages');
});

it('links discovered resources to the panel via namespace matching', function () use ($discoverFixture) {
    $result = (new FilamentAnalyzer)->analyze($discoverFixture);

    $panel = $result['panels'][0];
    expect($panel->resources)->toContain('App\\Filament\\Resources\\PostResource');
});

it('links discovered custom pages to the panel via namespace matching', function () use ($discoverFixture) {
    $result = (new FilamentAnalyzer)->analyze($discoverFixture);

    $panel = $result['panels'][0];
    expect($panel->pages)->toContain('App\\Filament\\Pages\\Settings');
});

it('attaches the panel ID to discovered resources', function () use ($discoverFixture) {
    $result = (new FilamentAnalyzer)->analyze($discoverFixture);

    $resource = $result['resources'][0];
    expect($resource->panelId)->toBe('admin');
});
