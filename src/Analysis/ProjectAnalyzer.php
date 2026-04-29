<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Analysis;

use LaraMint\LaravelBrain\Graph\Graph;
use LaraMint\LaravelBrain\Graph\GraphBuilder;
use LaraMint\LaravelBrain\Graph\GraphSplitter;
use LaraMint\LaravelBrain\Graph\TabManifestEntry;

class AnalysisResult
{
    public function __construct(
        public readonly Graph $fullGraph,
        /** @var array<string, Graph> tabId => subgraph */
        public readonly array $subgraphs,
        /** @var TabManifestEntry[] */
        public readonly array $manifest,
        public readonly string $manifestJson,
        public readonly string $projectName,
        public readonly string $analyzedAt,
        public readonly int $totalRoutes,
        public readonly int $totalCommands = 0,
        public readonly int $totalChannels = 0,
    ) {}
}

class ProjectAnalyzer
{
    private RouteAnalyzer $routeAnalyzer;

    private MiddlewareAnalyzer $middlewareAnalyzer;

    private ControllerAnalyzer $controllerAnalyzer;

    private MethodTracer $methodTracer;

    private ModelAnalyzer $modelAnalyzer;

    private ConsoleAnalyzer $consoleAnalyzer;

    private ChannelAnalyzer $channelAnalyzer;

    private QueryTracer $queryTracer;

    private GraphBuilder $graphBuilder;

    private GraphSplitter $graphSplitter;

    public function __construct()
    {
        $this->routeAnalyzer = new RouteAnalyzer;
        $this->middlewareAnalyzer = new MiddlewareAnalyzer;
        $this->controllerAnalyzer = new ControllerAnalyzer;
        $this->methodTracer = new MethodTracer;
        $this->modelAnalyzer = new ModelAnalyzer;
        $this->consoleAnalyzer = new ConsoleAnalyzer;
        $this->channelAnalyzer = new ChannelAnalyzer;
        $this->queryTracer = new QueryTracer;
        $this->graphBuilder = new GraphBuilder;
        $this->graphSplitter = new GraphSplitter;
    }

    public function analyze(string $projectRoot): AnalysisResult
    {
        $projectRoot = rtrim($projectRoot, '/');
        $projectName = basename($projectRoot);
        $analyzedAt = date('c');

        $this->output("Analyzing project: {$projectName}");

        $this->output('  → Scanning routes...');
        $routes = $this->routeAnalyzer->analyze($projectRoot);
        $this->output('    Found '.count($routes).' route(s)');

        $this->output('  → Scanning middleware...');
        $middlewareRegistry = $this->middlewareAnalyzer->analyze($projectRoot);

        $this->output('  → Analyzing controllers...');
        $controllers = $this->controllerAnalyzer->analyze($projectRoot, $routes);
        $this->output('    Found '.count($controllers).' controller(s)');

        $this->output('  → Tracing full lifecycle (deep)...');
        $psr4Map = $this->controllerAnalyzer->getPsr4Map();
        $callChain = $this->methodTracer->trace($controllers, $psr4Map, $projectRoot);
        $this->output('    Discovered '.count($callChain).' call chain edge(s)');

        $this->output('  → Analyzing models...');
        $modelFqcns = [];
        foreach ($callChain as $edge) {
            if ($edge->type === 'model') {
                $modelFqcns[] = $edge->calleeFqcn;
            }
        }
        $modelFqcns = array_unique($modelFqcns);
        $models = $this->modelAnalyzer->analyze($projectRoot, $modelFqcns);
        $this->output('    Found '.count($models).' model(s)');

        $this->output('  → Scanning console commands...');
        $consoleResult = $this->consoleAnalyzer->analyze($projectRoot);
        $commands = $consoleResult['commands'];
        $schedules = $consoleResult['schedule'];
        $this->output('    Found '.count($commands).' command(s), '.count($schedules).' schedule(s)');

        $this->output('  → Scanning broadcast channels...');
        $channels = $this->channelAnalyzer->analyze($projectRoot);
        $this->output('    Found '.count($channels).' channel(s)');

        $this->output('  → Tracing command call chains...');
        $commandEdges = [];
        foreach ($commands as $cmd) {
            if ($cmd->class) {
                $edges = $this->methodTracer->traceMethod($cmd->class, 'handle', $psr4Map, $projectRoot);
                $commandEdges = array_merge($commandEdges, $edges);
            }
        }
        $this->output('    Discovered '.count($commandEdges).' command call chain edge(s)');

        $this->output('  → Tracing channel call chains...');
        $channelEdges = [];
        foreach ($channels as $ch) {
            if ($ch->class) {
                $edges = $this->methodTracer->traceMethod($ch->class, '__invoke', $psr4Map, $projectRoot);
                if (empty($edges)) {
                    $edges = $this->methodTracer->traceMethod($ch->class, 'join', $psr4Map, $projectRoot);
                }
                $channelEdges = array_merge($channelEdges, $edges);
            }
        }
        $this->output('    Discovered '.count($channelEdges).' channel call chain edge(s)');

        $this->output('  → Tracing DB queries...');
        $dbQueryMap = $this->queryTracer->buildQueryMap($callChain, $controllers, $psr4Map, $projectRoot);
        $this->output('    Found DB query info for '.count($dbQueryMap).' action(s)');

        $this->output('  → Building graph...');
        $fullGraph = $this->graphBuilder->build(
            $projectName, $routes, $middlewareRegistry, $controllers, $callChain, $models, $projectRoot, $dbQueryMap,
        );
        $this->graphBuilder->addConsoleCommands($commands, $schedules, $commandEdges);
        $this->graphBuilder->addChannels($channels, $channelEdges);
        $this->output("    {$fullGraph->nodeCount()} nodes, {$fullGraph->edgeCount()} edges");

        $this->output('  → Splitting into tab subgraphs...');
        $split = $this->graphSplitter->split($fullGraph, $routes, $commands, $channels, $schedules, $projectName, $analyzedAt);
        $this->output('    '.count($split['subgraphs']).' tab(s) generated');

        $manifestJson = $this->graphSplitter->buildManifestJson(
            $split['manifest'], $fullGraph, $projectName, $analyzedAt, count($routes),
        );

        return new AnalysisResult(
            fullGraph: $fullGraph,
            subgraphs: $split['subgraphs'],
            manifest: $split['manifest'],
            manifestJson: $manifestJson,
            projectName: $projectName,
            analyzedAt: $analyzedAt,
            totalRoutes: count($routes),
            totalCommands: count($commands),
            totalChannels: count($channels),
        );
    }

    private function output(string $message): void
    {
        echo $message.PHP_EOL;
    }
}
