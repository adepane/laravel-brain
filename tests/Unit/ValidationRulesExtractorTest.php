<?php

use LaraMint\LaravelBrain\Analysis\ValidationRulesExtractor;

$fixtureRequest = __DIR__.'/../fixtures/laravel-project/app/Http/Requests/ProfileStoreRequest.php';

it('detects a concrete rules() method', function () use ($fixtureRequest) {
    $extractor = new ValidationRulesExtractor;
    expect($extractor->hasNonAbstractRulesMethod($fixtureRequest))->toBeTrue();
});

it('extracts validation rows from rules() return arrays', function () use ($fixtureRequest) {
    $extractor = new ValidationRulesExtractor;
    $rows = $extractor->extractFromFile($fixtureRequest);

    expect($rows)->not->toBeEmpty();

    $fields = implode(' ', array_column($rows, 'field'));
    expect($fields)->toContain('name');
    expect($fields)->toContain('email');

    $rulesText = implode(' ', array_column($rows, 'rules'));
    expect($rulesText)->toContain('required');
});
