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
    // ── Source ────────────────────────────────────────────────────────────────

    public function source(Request $request): JsonResponse
    {
        $filePath = $request->query('path', '');

        if (! $filePath || ! file_exists($filePath) || pathinfo($filePath, PATHINFO_EXTENSION) !== 'php') {
            return response()->json(['error' => 'File not found'], 404);
        }

        return response()->json(['content' => file_get_contents($filePath)]);
    }

    // ── Scan ──────────────────────────────────────────────────────────────────

    public function scan(Request $request): JsonResponse
    {
        ini_set('memory_limit', '1024M');
        set_time_limit(300);

        $projectPath = base_path();
        $analyzer    = new ProjectAnalyzer;

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
            'success'    => true,
            'message'    => 'Project scan completed successfully.',
            'analyzedAt' => $result->analyzedAt,
        ]);
    }

    // ── Stress test ───────────────────────────────────────────────────────────

    public function stressTest(Request $request): JsonResponse
    {
        if (! class_exists('LaraMint\LaravelStress\StressTestRunner')) {
            return response()->json(['error' => 'The laramint/laravel-stress package is not installed.'], 501);
        }

        set_time_limit(120);

        $validated = $request->validate([
            'method'      => 'required|in:GET,POST,PUT,PATCH,DELETE,HEAD',
            'url'         => 'required|url',
            'count'       => 'required|integer|min:1|max:200',
            'concurrency' => 'required|integer|min:1|max:20',
            'headers'     => 'nullable|array',
            'body'        => 'nullable|string',
            'timeout'     => 'nullable|numeric|min:1|max:30',
        ]);

        if (! $this->isAllowedHost($validated['url'])) {
            return response()->json(
                ['error' => 'URL restricted to localhost, 127.0.0.1, *.test, or *.local'],
                422
            );
        }

        try {
            $stress = app('LaraMint\LaravelStress\StressTestRunner');

            // Background strategy: respond immediately so the web-server thread
            // is freed before the Guzzle pool makes requests back to it.
            // This prevents the single-threaded `php artisan serve` deadlock.
            $jobId = $stress->startBackground($validated);

            if ($jobId !== null) {
                return response()->json(['jobId' => $jobId, 'status' => 'running']);
            }

            // Synchronous fallback for multi-threaded servers (Nginx, Herd, Valet …).
            return response()->json($stress->run($validated));

        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    public function stressTestPoll(Request $request, string $jobId): JsonResponse
    {
        if (! preg_match('/^[a-zA-Z0-9._]+$/', $jobId)) {
            return response()->json(['error' => 'Invalid job ID'], 400);
        }

        $payload = $this->readJobResult($jobId);

        if ($payload === null) {
            return response()->json(['status' => 'running']);
        }

        if (($payload['status'] ?? '') === 'done') {
            return response()->json(['status' => 'done', 'result' => $payload['result']]);
        }

        return response()->json(['status' => 'running']);
    }

    // ── SPA / static assets ───────────────────────────────────────────────────

    public function serve(Request $request, string $any = ''): Response|JsonResponse
    {
        $any = ltrim($any, '/');

        if (preg_match('/^\.graph-[a-z0-9_-]+\.json$/', $any)) {
            $path = storage_path('app/laravel-brain/'.$any);
            if (! file_exists($path)) {
                return response()->json(
                    ['error' => 'No scan data found — run php artisan brain:scan first'],
                    404
                );
            }

            return response(file_get_contents($path), 200, ['Content-Type' => 'application/json']);
        }

        if ($any !== '') {
            $filePath = $this->packageAssetPath($any);
            if ($filePath && file_exists($filePath) && is_file($filePath)) {
                return $this->serveFile($filePath);
            }
        }

        return response()->view('laravel-brain::index');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Restrict stress-test targets to development hosts only.
     */
    private function isAllowedHost(string $url): bool
    {
        $host            = (string) parse_url($url, PHP_URL_HOST);
        $allowedHosts    = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
        $allowedSuffixes = ['.test', '.local'];

        return in_array($host, $allowedHosts, true)
            || array_reduce(
                $allowedSuffixes,
                fn ($carry, $suffix) => $carry || str_ends_with($host, $suffix),
                false
            );
    }

    /**
     * Read the result file written by the laravel-stress subprocess.
     *
     * The file-naming convention (`lb_st_res_{jobId}.json`) is owned by
     * StressTestRunner::startBackground().  We mirror it here so the poll
     * endpoint can check progress without coupling to the runner's internals
     * beyond the agreed-upon file name prefix.
     *
     * Returns the decoded payload array, or null when the file is absent /
     * unreadable (meaning the subprocess hasn't written yet).
     *
     * @return array<string, mixed>|null
     */
    private function readJobResult(string $jobId): ?array
    {
        $path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'lb_st_res_'.$jobId.'.json';

        if (! file_exists($path)) {
            return null;
        }

        $raw  = file_get_contents($path);
        $data = json_decode((string) $raw, true);

        if (! is_array($data)) {
            return null;
        }

        // Delete the result file once we've delivered the final result so temp
        // files don't accumulate indefinitely.
        if (($data['status'] ?? '') === 'done') {
            @unlink($path);
        }

        return $data;
    }

    private function serveFile(string $filePath): Response
    {
        $mimes = [
            'js'    => 'application/javascript',
            'css'   => 'text/css',
            'svg'   => 'image/svg+xml',
            'png'   => 'image/png',
            'ico'   => 'image/x-icon',
            'json'  => 'application/json',
            'html'  => 'text/html',
            'woff2' => 'font/woff2',
            'woff'  => 'font/woff',
        ];

        $ext  = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
        $mime = $mimes[$ext] ?? 'application/octet-stream';

        return response(file_get_contents($filePath), 200, ['Content-Type' => $mime]);
    }

    private function packageAssetPath(string $file = ''): string
    {
        $base = realpath(__DIR__.'/../../../resources/assets');
        if (! $base) {
            return '';
        }

        $full     = $base.($file !== '' ? '/'.ltrim($file, '/') : '');
        $realFull = realpath($full);

        if (! $realFull) {
            return '';
        }

        $baseWithSlash = rtrim($base, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;

        if ($realFull === $base || str_starts_with($realFull, $baseWithSlash)) {
            return $realFull;
        }

        return '';
    }
}
