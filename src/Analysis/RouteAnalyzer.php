<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Analysis;

use LaraMint\LaravelBrain\Parser\PhpFileParser;
use PhpParser\Node;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitorAbstract;

class RouteDefinition
{
    public function __construct(
        public readonly string $method,
        public readonly string $uri,
        public readonly string $controller,
        public readonly string $action,
        public readonly array $middlewares,
        public readonly string $name,
        public readonly string $file,
        public readonly int $line,
        public readonly string $tabGroup = 'default',
        /** @var Node\Expr\Closure|Node\Expr\ArrowFunction|null Inline closure AST for closure routes */
        public readonly ?Node $closureNode = null,
    ) {}
}

class RouteAnalyzer
{
    private PhpFileParser $parser;

    public function __construct()
    {
        $this->parser = new PhpFileParser;
    }

    /**
     * @return RouteDefinition[]
     */
    public function analyze(string $projectRoot): array
    {
        $routes = [];
        $routeFiles = $this->findRouteFiles($projectRoot);

        foreach ($routeFiles as $file) {
            $parsed = $this->parser->parse($file);
            if ($parsed['ast'] === null) {
                continue;
            }

            $routes = array_merge($routes, $this->extractRoutes($parsed['ast'], $parsed['useMap'], $file));
        }

        return $routes;
    }

    private function findRouteFiles(string $projectRoot): array
    {
        $routesDir = rtrim($projectRoot, '/').'/routes';
        if (! is_dir($routesDir)) {
            return [];
        }

        $files = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($routesDir, \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $entry) {
            if ($entry->isFile() && $entry->getExtension() === 'php') {
                $files[] = $entry->getPathname();
            }
        }

        return $files;
    }

    /**
     * @param  Node\Stmt[]  $ast
     * @param  array<string, string>  $useMap
     * @return RouteDefinition[]
     */
    private function extractRoutes(array $ast, array $useMap, string $file): array
    {
        $routes = [];
        $traverser = new NodeTraverser;

        $visitor = new class($useMap, $file) extends NodeVisitorAbstract
        {
            public array $routes = [];

            private array $prefixStack = [];

            private array $middlewareStack = [];

            private array $useMap;

            private string $file;

            private const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'any'];

            public function __construct(array $useMap, string $file)
            {
                $this->useMap = $useMap;
                $this->file = $file;
            }

            public function enterNode(Node $node): null
            {
                // StaticCall: Route::get(), Route::group(), Route::resource()
                if ($node instanceof Node\Expr\StaticCall) {
                    $class = $this->resolveClass($node->class);
                    if ($class !== 'Route') {
                        return null;
                    }

                    $methodName = $node->name instanceof Node\Identifier ? $node->name->toString() : null;
                    if ($methodName === null) {
                        return null;
                    }

                    if (in_array($methodName, self::HTTP_METHODS, true)) {
                        $this->handleHttpRoute($node, $methodName);
                    } elseif ($methodName === 'group') {
                        $this->enterGroupFromStaticCall($node);
                    } elseif (in_array($methodName, ['resource', 'apiResource'], true)) {
                        $this->handleResource($node, $methodName);
                    }

                    return null;
                }

                // MethodCall: Route::middleware([...])->group(), Route::prefix('x')->group()
                if ($node instanceof Node\Expr\MethodCall) {
                    $methodName = $node->name instanceof Node\Identifier ? $node->name->toString() : null;
                    if ($methodName === 'group') {
                        $this->enterGroupFromMethodChain($node);
                    }
                }

                return null;
            }

            public function leaveNode(Node $node): null
            {
                $methodName = null;
                if ($node instanceof Node\Expr\StaticCall || $node instanceof Node\Expr\MethodCall) {
                    $methodName = $node->name instanceof Node\Identifier ? $node->name->toString() : null;
                }

                if ($methodName === 'group') {
                    if (! empty($this->prefixStack)) {
                        array_pop($this->prefixStack);
                    }
                    if (! empty($this->middlewareStack)) {
                        array_pop($this->middlewareStack);
                    }
                }

                return null;
            }

            private function handleHttpRoute(Node\Expr\StaticCall $node, string $method): void
            {
                $uri = $this->extractString($node->args[0] ?? null);
                if ($uri === null) {
                    return;
                }

                [$controller, $actionMethod, $closureNode] = $this->extractAction($node->args[1] ?? null);

                $fullUri = implode('', $this->prefixStack).'/'.ltrim($uri, '/');
                $fullUri = '/'.ltrim($fullUri, '/');

                $middlewares = array_merge(...$this->middlewareStack ?: [[]]);

                $this->routes[] = new RouteDefinition(
                    method: strtoupper($method),
                    uri: $fullUri,
                    controller: $controller,
                    action: $actionMethod,
                    middlewares: array_unique($middlewares),
                    name: '',
                    file: $this->file,
                    line: $node->getStartLine(),
                    tabGroup: strtoupper($method).' '.$fullUri,
                    closureNode: $closureNode,
                );
            }

            private function handleResource(Node\Expr\StaticCall $node, string $type): void
            {
                $uri = $this->extractString($node->args[0] ?? null);
                $controllerArg = $node->args[1] ?? null;
                if ($uri === null || $controllerArg === null) {
                    return;
                }

                $controllerFqcn = $this->extractClassRef($controllerArg->value);
                $fullUri = implode('', $this->prefixStack).'/'.ltrim($uri, '/');
                $fullUri = '/'.ltrim($fullUri, '/');
                $middlewares = array_merge(...$this->middlewareStack ?: [[]]);

                $methods = $type === 'apiResource'
                    ? ['GET:index', 'POST:store', 'GET:show', 'PUT:update', 'DELETE:destroy']
                    : ['GET:index', 'GET:create', 'POST:store', 'GET:show', 'GET:edit', 'PUT:update', 'DELETE:destroy'];

                foreach ($methods as $spec) {
                    [$httpMethod, $actionMethod] = explode(':', $spec);
                    $this->routes[] = new RouteDefinition(
                        method: $httpMethod,
                        uri: $fullUri,
                        controller: $controllerFqcn,
                        action: $actionMethod,
                        middlewares: array_unique($middlewares),
                        name: '',
                        file: $this->file,
                        line: $node->getStartLine(),
                        tabGroup: $httpMethod.' '.$fullUri,
                    );
                }
            }

            private function enterGroupFromStaticCall(Node\Expr\StaticCall $node): void
            {
                $prefix = '';
                $middlewares = [];

                foreach ($node->args as $arg) {
                    if (! $arg->value instanceof Node\Expr\Array_) {
                        continue;
                    }
                    foreach ($arg->value->items as $item) {
                        if ($item === null) {
                            continue;
                        }
                        $key = $item->key instanceof Node\Scalar\String_ ? $item->key->value : null;
                        if ($key === 'prefix') {
                            $prefix = $this->extractString($item) ?? '';
                        } elseif ($key === 'middleware') {
                            $middlewares = $this->extractMiddlewareList($item->value);
                        }
                    }
                }

                $this->prefixStack[] = $prefix ? '/'.ltrim($prefix, '/') : '';
                $this->middlewareStack[] = $middlewares;
            }

            private function enterGroupFromMethodChain(Node\Expr\MethodCall $node): void
            {
                // Walk up the chain: ->group() called on ->middleware([...])->prefix(...) etc.
                $prefix = '';
                $middlewares = [];
                $this->walkChain($node->var, $prefix, $middlewares);

                $this->prefixStack[] = $prefix ? '/'.ltrim($prefix, '/') : '';
                $this->middlewareStack[] = $middlewares;
            }

            private function walkChain(Node $node, string &$prefix, array &$middlewares): void
            {
                if ($node instanceof Node\Expr\StaticCall || $node instanceof Node\Expr\MethodCall) {
                    $method = $node->name instanceof Node\Identifier ? $node->name->toString() : null;

                    if ($method === 'middleware' && ! empty($node->args)) {
                        $middlewares = array_merge($middlewares, $this->extractMiddlewareList($node->args[0]->value));
                    } elseif ($method === 'prefix' && ! empty($node->args)) {
                        $prefix = $this->extractString($node->args[0]) ?? '';
                    }

                    // Walk the callee
                    $callee = $node instanceof Node\Expr\MethodCall ? $node->var : $node->class;
                    $this->walkChain($callee, $prefix, $middlewares);
                }
            }

            /**
             * @return array{0: string, 1: string, 2: Node\Expr\Closure|Node\Expr\ArrowFunction|null}
             */
            private function extractAction(?Node $node): array
            {
                if ($node === null) {
                    return ['', '', null];
                }
                $value = $node instanceof Node\Arg ? $node->value : $node;

                if ($value instanceof Node\Expr\Array_ && count($value->items) === 2) {
                    $classItem = $value->items[0];
                    $methodItem = $value->items[1];
                    if ($classItem && $methodItem) {
                        $controller = $this->extractClassRef($classItem->value);
                        $actionMethod = $this->extractString($methodItem) ?? '';

                        return [$controller, $actionMethod, null];
                    }
                }

                if ($value instanceof Node\Scalar\String_) {
                    $parts = explode('@', $value->value, 2);

                    return [count($parts) === 2 ? $parts[0] : '', $parts[1] ?? $parts[0], null];
                }

                if ($value instanceof Node\Expr\Closure || $value instanceof Node\Expr\ArrowFunction) {
                    return ['Closure', '__invoke', $value];
                }

                return ['', '', null];
            }

            private function extractClassRef(Node $node): string
            {
                if ($node instanceof Node\Expr\ClassConstFetch) {
                    $class = $node->class;
                    if ($class instanceof Node\Name) {
                        $name = $class->toString();

                        // Return FQCN from use-map, not the short name
                        return $this->useMap[$name] ?? $name;
                    }
                }
                if ($node instanceof Node\Scalar\String_) {
                    return $node->value;
                }

                return '';
            }

            private function extractMiddlewareList(Node $node): array
            {
                if ($node instanceof Node\Scalar\String_) {
                    return [$node->value];
                }
                if ($node instanceof Node\Expr\Array_) {
                    $result = [];
                    foreach ($node->items as $item) {
                        if ($item && $item->value instanceof Node\Scalar\String_) {
                            $result[] = $item->value->value;
                        }
                    }

                    return $result;
                }

                return [];
            }

            private function extractString(?Node $node): ?string
            {
                if ($node === null) {
                    return null;
                }
                $value = $node instanceof Node\Arg ? $node->value : $node;
                if ($value instanceof Node\Scalar\String_) {
                    return $value->value;
                }
                if ($value instanceof Node\Expr\ArrayItem && $value->value instanceof Node\Scalar\String_) {
                    return $value->value->value;
                }

                return null;
            }

            private function resolveClass(Node $node): string
            {
                if ($node instanceof Node\Name) {
                    $name = $node->toString();
                    $resolved = $this->useMap[$name] ?? $name;
                    // Normalize to short name for Route facade matching
                    $parts = explode('\\', $resolved);

                    return end($parts);
                }

                return '';
            }
        };

        $traverser->addVisitor($visitor);
        $traverser->traverse($ast);

        return $visitor->routes;
    }
}
