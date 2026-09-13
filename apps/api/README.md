# apps/api

The Laravel API: accounts and sessions (Sanctum), projects, layouts, sequences, the shader
library and the shader assistant. See the [root README](../../README.md) for setup, and
[SECURITY.md](../../SECURITY.md) for the security model.

```bash
cp .env.example .env && php artisan key:generate
php artisan migrate
php artisan serve --port=8000
php artisan test
```
