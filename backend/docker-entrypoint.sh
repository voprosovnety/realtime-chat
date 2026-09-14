#!/bin/sh
set -eu

# Encode URL components once; Doctrine and readiness use this same URL.
DATABASE_URL="$(php /usr/local/bin/database-url.php)"
export DATABASE_URL

echo "[entrypoint] Waiting for PostgreSQL..."
attempt=0
until php bin/console dbal:run-sql 'SELECT 1' --no-interaction >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[entrypoint] PostgreSQL readiness failed; check database configuration." >&2
    exit 1
  fi
  sleep 2
done

# Only PHP-FPM initializes shared state. Scheduler waits for its healthcheck.
if [ "${INITIALIZE_APP:-1}" = "1" ]; then
  echo "[entrypoint] Generating missing JWT keys and running migrations..."
  php bin/console lexik:jwt:generate-keypair --skip-if-exists
  php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration
fi

echo "[entrypoint] Clearing and warming up cache..."
php bin/console cache:clear
mkdir -p /var/www/uploads
chown -R www-data:www-data var/ /var/www/uploads

exec "$@"
