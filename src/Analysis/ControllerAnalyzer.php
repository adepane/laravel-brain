<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Analysis;

use LaraMint\LaravelBrain\Parser\PhpFileParser;
use PhpParser\Node;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitorAbstract;

class MethodDefinition
{
    public function __construct(
        public string $name,
        public array $dependencies, // varName => FQCN
        public ?Node\Stmt\ClassMethod $ast = null,
    ) {}
}

class ControllerDefinition
{
    public function __construct(
        public string $fqcn,
        public string $file,
        public array $constructorDeps, // varName => FQCN
        /** @var MethodDefinition[] */
        public array $methods,
        /** @var array<string, string> */
        public array $useMap = [],
    ) {}
}

class ControllerAnalyzer
{
    private PhpFileParser $parser;

    private array $psr4Map = [];

    public function __construct()
    {
        $this->parser = new PhpFileParser;
    }

    public function getPsr4Map(): array
    {
        return $this->psr4Map;
    }

    /**
     * @param  RouteDefinition[]  $routes
     * @return array<string, ControllerDefinition> FQCN => ControllerDefinition
     */
    public function analyze(string $projectRoot, array $routes): array
    {
        $this->psr4Map = $this->buildPsr4Map($projectRoot);

        $controllerFqcns = [];
        foreach ($routes as $route) {
            if ($route->controller !== 'Closure' && $route->controller !== '') {
                $controllerFqcns[$route->controller] = true;
            }
        }

        $definitions = [];
        foreach (array_keys($controllerFqcns) as $fqcn) {
            $file = $this->resolveFile($fqcn, $projectRoot);
            if ($file === null || ! file_exists($file)) {
                continue;
            }

            $definition = $this->analyzeFile($fqcn, $file);
            if ($definition !== null) {
                $definitions[$fqcn] = $definition;
            }
        }

        return $definitions;
    }

    private function analyzeFile(string $fqcn, string $file): ?ControllerDefinition
    {
        $parsed = $this->parser->parse($file);
        if ($parsed['ast'] === null) {
            return null;
        }

        $traverser = new NodeTraverser;
        $visitor = new class($parsed['useMap']) extends NodeVisitorAbstract
        {
            public array $constructorDeps = [];

            public array $methods = [];

            private array $useMap;

            public function __construct(array $useMap)
            {
                $this->useMap = $useMap;
            }

            public function enterNode(Node $node): null
            {
                if (! $node instanceof Node\Stmt\ClassMethod) {
                    return null;
                }

                $methodName = $node->name->toString();
                $deps = $this->extractTypedParams($node->params);

                if ($methodName === '__construct') {
                    $this->constructorDeps = $deps;
                } else {
                    $this->methods[] = new MethodDefinition($methodName, $deps, $node);
                }

                return null;
            }

            private function extractTypedParams(array $params): array
            {
                $deps = [];
                foreach ($params as $param) {
                    if (! $param instanceof Node\Param) {
                        continue;
                    }
                    $varName = $param->var instanceof Node\Expr\Variable ? $param->var->name : null;
                    $type = $param->type;
                    if ($varName === null || $type === null) {
                        continue;
                    }

                    $typeName = $this->resolveType($type);
                    if ($typeName) {
                        $deps[(string) $varName] = $typeName;
                    }
                }

                return $deps;
            }

            private function resolveType(Node $type): ?string
            {
                if ($type instanceof Node\Name) {
                    $name = $type->toString();

                    return $this->useMap[$name] ?? $name;
                }
                if ($type instanceof Node\NullableType) {
                    return $this->resolveType($type->type);
                }

                return null;
            }
        };

        $traverser->addVisitor($visitor);
        $traverser->traverse($parsed['ast']);

        return new ControllerDefinition(
            fqcn: $fqcn,
            file: $file,
            constructorDeps: $visitor->constructorDeps,
            methods: $visitor->methods,
            useMap: $parsed['useMap'],
        );
    }

    private function buildPsr4Map(string $projectRoot): array
    {
        $composerJson = $projectRoot.'/composer.json';
        if (! file_exists($composerJson)) {
            return [];
        }

        $data = json_decode(file_get_contents($composerJson), true);
        $map = [];

        foreach (['autoload', 'autoload-dev'] as $section) {
            foreach ($data[$section]['psr-4'] ?? [] as $namespace => $path) {
                $map[rtrim($namespace, '\\')] = rtrim($projectRoot.'/'.$path, '/');
            }
        }

        return $map;
    }

    private function resolveFile(string $fqcn, string $projectRoot): ?string
    {
        foreach ($this->psr4Map as $namespace => $basePath) {
            if (str_starts_with($fqcn, $namespace.'\\')) {
                $relative = substr($fqcn, strlen($namespace) + 1);
                $filePath = $basePath.'/'.str_replace('\\', '/', $relative).'.php';

                return $filePath;
            }
        }

        // Fallback: try common locations using full relative path
        $relative = str_replace('\\', '/', $fqcn).'.php';
        foreach (['app/Http/Controllers/', 'app/', 'src/'] as $prefix) {
            $path = $projectRoot.'/'.$prefix.$relative;
            if (file_exists($path)) {
                return $path;
            }
        }

        // Last resort: search by short class name inside app/ and src/
        return $this->searchByClassName($fqcn, $projectRoot);
    }

    private function searchByClassName(string $fqcn, string $projectRoot): ?string
    {
        $shortName = str_contains($fqcn, '\\')
            ? substr($fqcn, strrpos($fqcn, '\\') + 1)
            : $fqcn;

        $filename = $shortName.'.php';

        foreach (['app', 'src'] as $dir) {
            $base = $projectRoot.'/'.$dir;
            if (! is_dir($base)) {
                continue;
            }

            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($base, \FilesystemIterator::SKIP_DOTS)
            );

            foreach ($iterator as $file) {
                if ($file->getFilename() === $filename) {
                    return $file->getPathname();
                }
            }
        }

        return null;
    }
}
