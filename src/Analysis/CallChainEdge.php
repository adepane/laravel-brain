<?php

declare(strict_types=1);

namespace LaraMint\LaravelBrain\Analysis;

/**
 * Represents a single directed hop discovered during deep tracing.
 *
 * e.g.  OrderController::store  →  OrderService::createOrder  (type: service)
 *       OrderService::createOrder → OrderRepository::create   (type: repository)
 *       OrderRepository::create  → Order                      (type: model)
 *       OrderService::createOrder → SendOrderConfirmationJob  (type: job)
 */
class CallChainEdge
{
    public function __construct(
        public readonly string $callerFqcn,
        public readonly string $callerMethod,
        public readonly string $calleeFqcn,
        public readonly string $calleeMethod,
        /** 'service' | 'repository' | 'model' | 'job' | 'event' */
        public readonly string $type,
    ) {}
}
