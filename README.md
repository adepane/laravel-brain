<p align="center">
  <img src="public/logo-dark.svg" alt="Laravel Brain" width="300" />
</p>

<p align="center">
  <strong>Visualize your Laravel application's full request lifecycle as an interactive graph.</strong><br/>
  Understand how routes, controllers, services, models, jobs, and events connect — in seconds.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-10%20%7C%2011%20%7C%2012-red?style=flat-square&logo=laravel" alt="Laravel"/>
  <img src="https://img.shields.io/badge/PHP-8.1%2B-777BB4?style=flat-square&logo=php" alt="PHP"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
</p>

---

## What is Laravel Brain?

Laravel Brain is a developer tool that analyzes your Laravel codebase and renders an interactive node graph of your application's architecture. It traces every route through its controller, services, repositories, models, jobs, and events — giving you a bird's-eye view of the entire request lifecycle without reading a single line of code.

## Features

- **Full lifecycle tracing** — Follows every route from HTTP verb → controller → service → repository → model → events/jobs
- **Interactive graph** — Zoom, pan, click nodes to inspect, filter by type
- **Per-route tabs** — Each route gets its own isolated subgraph tab
- **Middleware mapping** — Shows which middleware guards each route
- **Model relationships** — Displays `hasMany`, `belongsTo`, and other Eloquent relations
- **N+1 detection** — Flags potential N+1 query patterns in method flowcharts
- **Method flowcharts** — Click any class node to see its internal flow as a step-by-step diagram
- **Source viewer** — Click any node to read the actual source file inline
- **Export** — Export any graph as PNG or Mermaid diagram
- **Dark / light theme** — Toggle between themes
- **Multiple layouts** — Hierarchical, force-directed, breadth-first, circle, grid

## Requirements

- PHP 8.1+
- Laravel 10, 11, or 12
- Composer

## Installation

Install as a dev dependency (it's a development tool, not needed in production):

```bash
composer require --dev mrmarchone/laravel-brain
```

Laravel will auto-discover the service provider. No manual registration needed.

## Usage

### Scan your project

```bash
php artisan laravelbrain:scan
```

This analyzes your entire codebase and writes the graph data to `storage/app/laravel-brain/`. When complete it prints the URL to open:

```
  LaravelBrain — analyzing project...
  Path: /your/project

  Scanning routes, controllers, models and call chains...

  Done! Open the viewer at: http://localhost:8000/_laravel-brain
```

### Open the viewer

Navigate to `/_laravel-brain` in your browser while your Laravel app is running (e.g. via `php artisan serve`).

The viewer is served entirely through your existing Laravel routes — no separate server process needed.

## How It Works

```
php artisan laravelbrain:scan
        │
        ├─ RouteAnalyzer      → scans all files in routes/**/*.php
        ├─ MiddlewareAnalyzer → reads Kernel.php or bootstrap/app.php
        ├─ ControllerAnalyzer → resolves controller classes + methods
        ├─ MethodTracer       → deep-traces call chains (services, repos, models)
        ├─ ModelAnalyzer      → extracts Eloquent relationships
        └─ GraphBuilder       → assembles nodes + edges
                │
                └─ Writes JSON → storage/app/laravel-brain/

GET /_laravel-brain
        │
        └─ BrainController → serves the React SPA + graph JSON via Laravel routes
```

### Route discovery

LaravelBrain recursively scans your entire `routes/` directory — not just `web.php` and `api.php`. Any PHP file under `routes/**` is analyzed, including versioned files like `routes/v1/users.php` or module-specific files like `routes/modules/admin.php`.

### Call chain tracing

From each controller action, the tracer follows:
- Direct method calls to injected services/repositories
- Static calls (`MyService::method()`)
- Job dispatches (`dispatch(new SendEmail(...))`)
- Event dispatches (`event(new OrderPlaced(...))`)

This produces the full edge list used to build the graph.

## Graph Node Types

| Node | Color | Represents |
|------|-------|------------|
| Route | Blue | HTTP endpoint (`GET /users`) |
| Controller | Purple | Controller class |
| Action | Violet | Controller method |
| Middleware | Orange | Middleware applied to route |
| Service | Teal | Service class |
| Repository | Green | Repository class |
| Model | Yellow | Eloquent model |
| Job | Red | Queued job |
| Event | Pink | Laravel event |

## Viewer Shortcuts

| Action | How |
|--------|-----|
| Zoom | Scroll wheel |
| Pan | Click + drag on canvas |
| Inspect node | Click any node |
| View source | Click a node → Source tab in sidebar |
| View flowchart | Click a class node → Flow tab |
| Filter by type | Filter panel on the left |
| Fit all nodes | Toolbar → Fit button |
| Export PNG | Toolbar → PNG button |
| Export Mermaid | Toolbar → Mermaid button |

## Routes Registered

The package registers the following routes in your application (all under the `/_laravel-brain` prefix):

```
GET /_laravel-brain          → Interactive graph viewer (SPA)
GET /_laravel-brain/api/methods  → Returns method flow steps for a class
GET /_laravel-brain/api/source   → Returns PHP source file content
GET /_laravel-brain/assets/*     → Serves frontend static assets
GET /_laravel-brain/.graph-*.json → Serves graph data written by the scan
```

## Output Files

After running `laravelbrain:scan`, the following files are written to `storage/app/laravel-brain/`:

```
.graph-manifest.json   — Tab manifest (list of all route tabs)
.graph-all.json        — Full combined graph (all routes)
.graph-{tab-id}.json   — Per-route subgraph (one per route)
```

These files are regenerated on every scan and are safe to gitignore:

```gitignore
storage/app/laravel-brain/
```

## Security

The `/_laravel-brain` routes are only registered when the package is installed. Since it's a `require-dev` dependency, it will not be present in production builds (`composer install --no-dev`).

If you do install it in a non-production environment accessible over a network, consider protecting the routes with middleware. You can do this by adding a route group override in your `AppServiceProvider` or using an environment check.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/mrmarchone/laravel-brain
cd laravel-brain
composer install
cd frontend && npm install && npm run dev
```

Tests:

```bash
composer test
```

## License

MIT — see [LICENSE](LICENSE) for details.
