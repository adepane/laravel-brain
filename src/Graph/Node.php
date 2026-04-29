<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Graph;

class Node implements \JsonSerializable
{
    public function __construct(
        public readonly string $id,
        public readonly string $type,
        public readonly string $label,
        public readonly array $data = [],
    ) {}

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'label' => $this->label,
            'data' => $this->data,
        ];
    }
}
