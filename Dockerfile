# Build context: repo root. Serves the Vue SPA + Laravel API from one Render web service
# (DECISIONS.md: "Static SPA served by the same Laravel container").

FROM node:22-alpine AS web-build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/formats/package.json packages/formats/
RUN npm ci
COPY apps/web/ apps/web/
COPY packages/ packages/
RUN npm run build -w apps/web

FROM composer:2 AS vendor
WORKDIR /app
COPY apps/api/composer.json apps/api/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist
COPY apps/api/ ./
RUN composer dump-autoload --optimize --no-dev

FROM php:8.4-fpm-alpine
RUN apk add --no-cache nginx supervisor postgresql-dev \
    && docker-php-ext-install pdo_pgsql opcache

WORKDIR /var/www/html
COPY --from=vendor /app ./
COPY --from=web-build /repo/apps/web/dist ./public/app

COPY apps/api/docker/nginx.conf /etc/nginx/http.d/default.conf
COPY apps/api/docker/supervisord.conf /etc/supervisord.conf

RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 10000
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
