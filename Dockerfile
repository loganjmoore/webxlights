# Build context: repo root. Serves the Vue SPA + Laravel API from one Render web service
# (DECISIONS.md: "Static SPA served by the same Laravel container").

# Pinned to the major CI tests on (.github/workflows/ci.yml). Dependabot bumped this to 26
# once; nothing tested it, so the pin is deliberate and Dependabot is told not to.
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

# 8.4 is the locked runtime (DECISIONS.md). Dependabot's bump to 8.5 broke the image build:
# docker-php-ext-install opcache fails there, and it took production down until it was reverted.
FROM php:8.5-fpm-alpine
RUN apk add --no-cache nginx supervisor postgresql-dev \
    && docker-php-ext-install pdo_pgsql opcache

WORKDIR /var/www/html
COPY --from=vendor /app ./
COPY --from=web-build /repo/apps/web/dist ./public/app

COPY apps/api/docker/nginx.conf /etc/nginx/http.d/default.conf
COPY apps/api/docker/supervisord.conf /etc/supervisord.conf
COPY apps/api/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

EXPOSE 10000
# Prepares the Render persistent disk, applies pending migrations, then starts nginx +
# php-fpm. Migrating on start rather than trusting render.yaml's preDeployCommand is
# deliberate - see the comments in entrypoint.sh.
CMD ["/usr/local/bin/entrypoint.sh"]
