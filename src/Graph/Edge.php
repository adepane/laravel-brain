<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Graph;

class Edge implements \JsonSerializable
{
    public function __construct(
        public readonly string $id,
        public readonly string $source,
        public readonly string $target,
        public readonly string $label,
        public readonly string $type,
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'source' => $this->source,
            'target' => $this->target,
            'label' => $this->label,
            'type' => $this->type,
        ];
    }
}
