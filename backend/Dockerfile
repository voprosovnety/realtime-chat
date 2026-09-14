FROM php:8.3-fpm-alpine AS base

RUN apk add --no-cache git unzip icu-dev libzip-dev postgresql-dev openssl
RUN docker-php-ext-install intl zip pdo pdo_pgsql
RUN printf "upload_max_filesize=50M\npost_max_size=55M" \
    > /usr/local/etc/php/conf.d/uploads.ini
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

WORKDIR /var/www/backend/app
COPY docker-entrypoint.sh docker-test-entrypoint.sh /usr/local/bin/
COPY database-url.php /usr/local/bin/database-url.php
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-test-entrypoint.sh

# .dockerignore excludes local secrets, dependencies and test artifacts.
COPY app/ .
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]

FROM base AS development
ENV APP_ENV=dev APP_DEBUG=1
RUN apk add --no-cache oniguruma-dev sqlite-dev libxml2-dev \
    && docker-php-ext-install mbstring pdo_sqlite dom xml xmlwriter
RUN composer install --no-interaction --no-scripts

FROM development AS test
ENV APP_ENV=test APP_DEBUG=1 DATABASE_URL=sqlite:///:memory:
ENTRYPOINT ["docker-test-entrypoint.sh"]
CMD ["php", "bin/phpunit"]

FROM base AS production
ENV APP_ENV=prod APP_DEBUG=0
RUN composer install --no-dev --classmap-authoritative --no-interaction --no-scripts
