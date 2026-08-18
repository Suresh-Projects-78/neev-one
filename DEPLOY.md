# Deploying Neev One

One host, Docker, HTTPS, nightly backups. Nothing else required.

## 1. Prerequisites

- A Linux VPS (1 GB RAM is plenty) with Docker Engine + the compose plugin
- A domain (say `books.example.com`) with an A record pointing at the VPS

## 2. First deploy

```bash
git clone https://github.com/innopay-suresh/neev-one.git
cd neev-one

# Generates .env with fresh JWT_SECRET and MAIL_SECRET_KEY
npm run env:init

# Add your domain for HTTPS
echo "DOMAIN=books.example.com" >> .env
echo "APP_URL=https://books.example.com" >> .env

docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

Caddy obtains the Let's Encrypt certificate automatically on first request.
The app is at `https://books.example.com`; the API and web ports are not
published directly — Caddy is the only way in.

## 3. Backups

```bash
# nightly at 02:30, keeps 30 days
crontab -e
30 2 * * * /path/to/neev-one/deploy/backup.sh /var/backups/neev-one
```

Restore = stop the stack, gunzip the archive over the volume's `dev.db`,
start the stack.

## 4. Updating

```bash
git pull
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

The api container applies schema changes on boot (migrate deploy when
migrations exist, schema push otherwise). Take a backup first.

## 5. Postgres instead of SQLite (optional)

Set in `.env`:

```
COMPOSE_PROFILES=postgres
POSTGRES_PASSWORD=<strong password>
DATABASE_URL=postgresql://accounting:<password>@db:5432/accounting
```

Then the same `up -d --build`.
