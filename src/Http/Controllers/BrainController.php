<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use LaraMint\LaravelBrain\Analysis\ProjectAnalyzer;

class BrainController extends Controller
{
    public function source(Request $request): JsonResponse
    {
        $filePath = $request->query('path', '');

        if (! $filePath || ! file_exists($filePath) || pathinfo($filePath, PATHINFO_EXTENSION) !== 'php') {
            return response()->json(['error' => 'File not found'], 404);
        }

        return response()->json(['content' => file_get_contents($filePath)]);
    }

    public function scan(Request $request): JsonResponse
    {
        ini_set('memory_limit', '1024M');
        set_time_limit(300);

        $projectPath = base_path();
        $analyzer = new ProjectAnalyzer;

        // Capture output to prevent it from leaking into the response
        ob_start();
        $result = $analyzer->analyze($projectPath);
        ob_end_clean();

        $storageDir = storage_path('app/laravel-brain');
        if (! is_dir($storageDir)) {
            mkdir($storageDir, 0755, true);
        }

        file_put_contents($storageDir.'/.graph-manifest.json', $result->manifestJson);
        file_put_contents($storageDir.'/.graph-all.json', $result->fullGraph->toJson());

        foreach ($result->subgraphs as $tabId => $subgraph) {
            file_put_contents($storageDir."/.graph-{$tabId}.json", $subgraph->toJson());
        }

        return response()->json([
            'success' => true,
            'message' => 'Project scan completed successfully.',
            'analyzedAt' => $result->analyzedAt,
        ]);
    }

    public function serve(Request $request, string $any = ''): Response|JsonResponse
    {
        $any = ltrim($any, '/');

        // Graph JSON files served from storage
        if (preg_match('/^\.graph-[a-z0-9_-]+\.json$/', $any)) {
            $path = storage_path('app/laravel-brain/'.$any);
            if (! file_exists($path)) {
                return response()->json(
                    ['error' => 'No scan data found — run php artisan laravelbrain:scan first'],
                    404
                );
            }

            return response(file_get_contents($path), 200, ['Content-Type' => 'application/json']);
        }

        // Static files from the package resources/assets dir (assets, favicon, icons, etc.)
        if ($any !== '') {
            $filePath = $this->packageAssetPath($any);
            if ($filePath && file_exists($filePath) && is_file($filePath)) {
                return $this->serveFile($filePath);
            }
        }

        // SPA fallback — serve index.blade.php view
        return response()->view('laravel-brain::index');
    }

    private function serveFile(string $filePath): Response
    {
        $mimes = [
            'js' => 'application/javascript',
            'css' => 'text/css',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'ico' => 'image/x-icon',
            'json' => 'application/json',
            'html' => 'text/html',
            'woff2' => 'font/woff2',
            'woff' => 'font/woff',
        ];
        $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mime = $mimes[$ext] ?? 'application/octet-stream';

        return response(file_get_contents($filePath), 200, ['Content-Type' => $mime]);
    }

    private function packageAssetPath(string $file = ''): string
    {
        $base = realpath(__DIR__.'/../../../resources/assets');
        if (! $base) {
            return '';
        }

        $full = $base.($file !== '' ? '/'.ltrim($file, '/') : '');
        $realFull = realpath($full);

        if (! $realFull) {
            return '';
        }

        // Add trailing slash to base to ensure we are matching a directory prefix correctly
        $baseWithSlash = rtrim($base, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        // Check if the resolved path is either the base directory itself or inside it
        if ($realFull === $base || str_starts_with($realFull, $baseWithSlash)) {
            return $realFull;
        }

        return '';
    }
}
