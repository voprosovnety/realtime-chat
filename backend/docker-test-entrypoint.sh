#!/bin/sh
set -eu

# Never run the fixture schema reset against a configured PostgreSQL database.
export APP_ENV=test APP_DEBUG=1 DATABASE_URL=sqlite:///:memory:
mkdir -p var config/jwt
php bin/console lexik:jwt:generate-keypair --skip-if-exists
exec "$@"
