<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Analysis;

class MiddlewareRegistry
{
    public function __construct(
        public readonly array $global,
        public readonly array $groups,
        public readonly array $aliases,
    ) {}

    public function resolveAlias(string $alias): string
    {
        return $this->aliases[$alias] ?? $alias;
    }

    public function resolveGroup(string $group): array
    {
        return $this->groups[$group] ?? [];
    }
}
