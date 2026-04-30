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

    /** @var array<string, float> step start times */
    private array $stepTimers = [];

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

        $this->newLine();
        $this->renderHeader();
        $this->line("  <fg=gray>Watch mode — polling every {$interval}s  ·  Ctrl+C to stop</>");
        $this->newLine();

        $this->runScan($projectPath, verbose: true);
        $mtimes = $this->collectMtimes($projectPath);

        while (true) { // @phpstan-ignore while.alwaysTrue
            sleep($interval);

            $current = $this->collectMtimes($projectPath);
            $changed = $this->detectChanges($mtimes, $current);

            if (! empty($changed)) {
                $this->newLine();
                $this->line('  <fg=yellow>⚡ Changed:</> '.$this->summariseChanged($changed));
                $this->runScan($projectPath, verbose: false);
                $mtimes = $current;
            }
        }

        return self::SUCCESS; // @phpstan-ignore-line
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
                $changed[] = $path;
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
        $totalStart = microtime(true);

        if ($verbose) {
            $this->newLine();
            $this->renderHeader();
            $this->line('  <fg=gray>Path: '.$projectPath.'</>');
            $this->newLine();
        }

        $analyzer = new ProjectAnalyzer;

        $result = $analyzer->analyze($projectPath, function (string $event, array $data) use ($verbose): void {
            $this->handleProgress($event, $data, $verbose);
        });

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
            $elapsed = microtime(true) - $totalStart;
            $this->newLine();
            $this->renderSummary($result->fullGraph->nodeCount(), $result->fullGraph->edgeCount(), $result->totalRoutes, $result->totalCommands, $result->totalChannels, $elapsed);
            $url = rtrim(config('app.url', 'http://localhost'), '/').'/_laravel-brain';
            $this->newLine();
            $this->line("  Open the viewer: <fg=cyan;options=bold>{$url}</>");
            $this->newLine();
        } else {
            $elapsed = microtime(true) - $totalStart;
            $this->line(
                '  <fg=green>✓</> Graph refreshed at <fg=cyan>'.date('H:i:s').'</>  '.
                '<fg=gray>'.$result->fullGraph->nodeCount().' nodes · '.$result->fullGraph->edgeCount().' edges · '.
                number_format($elapsed, 1).'s</>'
            );
        }

        return self::SUCCESS;
    }

    // ── Progress handler ──────────────────────────────────────────────────────

    private function handleProgress(string $event, array $data, bool $verbose): void
    {
        if (! $verbose) {
            return;
        }

        match ($event) {
            'step:start' => $this->renderStepStart($data),
            'step:done'  => $this->renderStepDone($data),
            default      => null,
        };
    }

    private function renderStepStart(array $data): void
    {
        $step = $data['step'];
        $label = $data['label'] ?? $step;

        $this->stepTimers[$step] = microtime(true);

        $this->getOutput()->write(
            sprintf('  <fg=gray>○</> %-38s', $label.'...')
        );
    }

    private function renderStepDone(array $data): void
    {
        $step = $data['step'];
        $count = $data['count'] ?? null;
        $unit = $data['unit'] ?? null;
        $extra = $data['extra'] ?? null;

        $elapsed = isset($this->stepTimers[$step])
            ? microtime(true) - $this->stepTimers[$step]
            : 0.0;

        $countStr = '';
        if ($count !== null && $unit !== null) {
            $suffix = $count === 1 ? $unit : $unit.'s';
            $countStr = "<fg=yellow>{$count} {$suffix}</>";
        }
        if ($extra !== null) {
            $countStr .= ($countStr ? ', ' : '')."<fg=gray>{$extra}</>";
        }

        $timeStr = '<fg=gray>('.number_format($elapsed, 2).'s)</>';

        $this->getOutput()->write(
            "\r  <fg=green>✓</> ".sprintf('%-38s', ($data['label'] ?? $step).'...')
            ."  {$countStr}  {$timeStr}\n"
        );
    }

    // ── UI helpers ────────────────────────────────────────────────────────────

    private function renderHeader(): void
    {
        $this->line('  <fg=magenta;options=bold>┌─────────────────────────────────────────┐</>');
        $this->line('  <fg=magenta;options=bold>│</>  <fg=white;options=bold>Laravel Brain</>  <fg=gray>— project analysis</>       <fg=magenta;options=bold>│</>');
        $this->line('  <fg=magenta;options=bold>└─────────────────────────────────────────┘</>');
    }

    private function renderSummary(int $nodes, int $edges, int $routes, int $commands, int $channels, float $elapsed): void
    {
        $this->line('  <fg=gray>─────────────────────────────────────────</>');
        $this->line('  <options=bold>Summary</>');
        $this->newLine();

        $rows = [
            ['Nodes',      "<fg=cyan>{$nodes}</>"],
            ['Edges',      "<fg=cyan>{$edges}</>"],
            ['Routes',     "<fg=cyan>{$routes}</>"],
            ['Commands',   "<fg=cyan>{$commands}</>"],
            ['Channels',   "<fg=cyan>{$channels}</>"],
            ['Total time', '<fg=yellow>'.number_format($elapsed, 2).'s</>'],
        ];

        foreach ($rows as [$label, $value]) {
            $this->line(sprintf('    <fg=gray>%-14s</> %s', $label, $value));
        }

        $this->line('  <fg=gray>─────────────────────────────────────────</>');
    }
}
