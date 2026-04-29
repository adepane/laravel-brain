<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Commands;

use Illuminate\Console\Command;
use LaraMint\LaravelBrain\Analysis\ProjectAnalyzer;

class ScanCommand extends Command
{
    protected $signature = 'brain:scan
                            {--watch : Watch for PHP file changes and auto-rescan}
                            {--interval=3 : Poll interval in seconds (watch mode only)}';

    protected $description = 'Analyze this Laravel project and open the interactive graph viewer';

    public function handle(): int
    {
        ini_set('memory_limit', '1024M');

        $projectPath = base_path();

        if ($this->option('watch')) {
            return $this->watch($projectPath);
        }

        return $this->runScan($projectPath, verbose: true);
    }

    // ── Watch mode ────────────────────────────────────────────────────────────

    private function watch(string $projectPath): int
    {
        $interval = max(1, (int) $this->option('interval'));

        $this->line('');
        $this->line('  <fg=magenta>LaraMint\LaravelBrain — watch mode</>');
        $this->line("  <fg=gray>Polling every {$interval}s for changes in app/, routes/, config/</>");
        $this->line('  <fg=gray>Press Ctrl+C to stop</>');
        $this->line('');

        // Initial scan
        $this->runScan($projectPath, verbose: true);
        $mtimes = $this->collectMtimes($projectPath);

        while (true) { // @phpstan-ignore while.alwaysTrue
            sleep($interval);

            $current = $this->collectMtimes($projectPath);
            $changed = $this->detectChanges($mtimes, $current);

            if (! empty($changed)) {
                $this->line('  <fg=yellow>Changed:</> '.$this->summariseChanged($changed));
                $this->runScan($projectPath, verbose: false);
                $mtimes = $current;
            }
        }

        return self::SUCCESS; // @phpstan-ignore-line (unreachable, loop exits via Ctrl+C)
    }

    private function collectMtimes(string $projectPath): array
    {
        $mtimes = [];

        foreach (['app', 'routes', 'config'] as $dir) {
            $base = $projectPath.'/'.$dir;
            if (! is_dir($base)) {
                continue;
            }

            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($base, \FilesystemIterator::SKIP_DOTS),
            );

            foreach ($iterator as $file) {
                if ($file->getExtension() !== 'php') {
                    continue;
                }
                $mtimes[$file->getPathname()] = $file->getMTime();
            }
        }

        return $mtimes;
    }

    private function detectChanges(array $old, array $new): array
    {
        $changed = [];

        foreach ($new as $path => $mtime) {
            if (! isset($old[$path]) || $old[$path] !== $mtime) {
                $changed[] = $path;
            }
        }
        foreach (array_keys($old) as $path) {
            if (! isset($new[$path])) {
                $changed[] = $path; // deleted
            }
        }

        return $changed;
    }

    private function summariseChanged(array $changed): string
    {
        $names = array_map('basename', array_slice($changed, 0, 3));
        $label = implode(', ', $names);
        if (count($changed) > 3) {
            $label .= ' +'.(count($changed) - 3).' more';
        }

        return $label;
    }

    // ── Shared scan logic ─────────────────────────────────────────────────────

    private function runScan(string $projectPath, bool $verbose): int
    {
        if ($verbose) {
            $this->line('');
            $this->line('  <fg=magenta>LaraMint\LaravelBrain — analyzing project...</>');
            $this->line('  <fg=gray>Path: '.$projectPath.'</>');
            $this->line('');
            $this->line('  Scanning routes, controllers, models and call chains...');
        }

        $analyzer = new ProjectAnalyzer;
        $result = $analyzer->analyze($projectPath);

        $storageDir = storage_path('app/laravel-brain');
        if (! is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }

        file_put_contents($storageDir.'/.graph-manifest.json', $result->manifestJson);
        file_put_contents($storageDir.'/.graph-all.json', $result->fullGraph->toJson());

        foreach ($result->subgraphs as $tabId => $subgraph) {
            file_put_contents($storageDir."/.graph-{$tabId}.json", $subgraph->toJson());
        }

        if ($verbose) {
            $url = rtrim(config('app.url', 'http://localhost'), '/').'/_laravel-brain';
            $this->line('');
            $this->line("  <fg=green>Done!</> Open the viewer at: <fg=cyan>{$url}</>");
            $this->line('');
        } else {
            $this->line('  <fg=green>✓</> Graph updated at <fg=cyan>'.date('H:i:s').'</> — '.
                $result->fullGraph->nodeCount().' nodes, '.$result->fullGraph->edgeCount().' edges');
        }

        return self::SUCCESS;
    }
}
