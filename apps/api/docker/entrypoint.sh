#!/bin/sh
# Container start for the web service.
#
# The worker service overrides the image's CMD with its own `dockerCommand` (render.yaml), so
# this script only ever runs in the single web container - no two containers race to migrate.
set -e

# /var/data is the Render persistent disk's mount path (render.yaml) - owned by root on a
# fresh mount, so php-fpm (www-data) can't write to it until this runs on every start.
mkdir -p /var/data/audio
chown -R www-data:www-data /var/data

# Deploy and migrate are the same event now. render.yaml declares
# `preDeployCommand: php artisan migrate --force`, but Render doesn't honour that for a Docker
# service created through the public API (DECISIONS.md M0), so since M0 every schema change has
# depended on someone remembering to run a one-off job by hand. M15.7's `view_objects` table
# was the one that didn't get run: the code shipped, the table didn't, and every layout page
# 500'd on `GET /layouts/{id}/view-objects` until it did.
#
# Set RUN_MIGRATIONS=false to opt a container out (e.g. to boot a replica for debugging
# without touching the schema).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  attempt=1
  max_attempts=5
  # Retrying covers a database that isn't accepting connections yet on a cold start. Migrations
  # are idempotent - the `migrations` table records what has already run - so a retry after a
  # partial failure only picks up what's still pending.
  until php artisan migrate --force --no-interaction; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[entrypoint] migrations still failing after ${max_attempts} attempts - failing the boot" >&2
      # Deliberately fatal: Render keeps the previous healthy deploy serving when a new
      # container fails to start, so a bad migration becomes a failed deploy rather than a
      # half-migrated app quietly returning 500s on whatever the new code touches.
      exit 1
    fi
    echo "[entrypoint] migrate failed (attempt ${attempt}/${max_attempts}), retrying in 5s..." >&2
    attempt=$((attempt + 1))
    sleep 5
  done
fi

# The shaders that ship with the app. Idempotent and keyed on a stable builtin_key, so running it
# on every boot updates the library rather than duplicating it. It is here rather than in a
# seeder because seeders never run in this container, and rather than in a one-shot migration
# because a migration runs once and the library keeps changing. `|| true` because sample content
# failing to publish must never take down a boot that is otherwise healthy.
php artisan shaders:publish-builtins --no-interaction || true

exec supervisord -c /etc/supervisord.conf
