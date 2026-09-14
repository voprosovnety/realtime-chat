<?php

// Compose supplies the same raw credentials to PostgreSQL, PHP and scheduler.
$values = [];
foreach (['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'] as $name) {
    $value = getenv($name);
    if ($value === false || $value === '') {
        fwrite(STDERR, "Missing database configuration: $name\n");
        exit(1);
    }
    $values[] = rawurlencode($value);
}

printf('postgresql://%s:%s@postgres:5432/%s?serverVersion=16&charset=utf8&connect_timeout=3', ...$values);
