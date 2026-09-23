#!/usr/bin/env bash
# Runs the database isolation tests against a throwaway local Postgres.
#
#   npm run test:db
#
# Applies tests/db/supabase-shim.sql, then every file in supabase/migrations
# in order, then supabase/seed.sql — the same files Supabase runs — and
# finally the tests in tests/db/.
#
# Each test file gets its own fresh copy of the seeded database.
#
# Set TEST_PG_URL to a Postgres server URL (a role that can CREATE DATABASE)
# to use an existing server instead of starting a temporary cluster
# (otherwise Postgres 15+ binaries are needed on PATH).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cleanup() { :; }
trap 'cleanup' EXIT

if [[ -z "${TEST_PG_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
  if [[ ! -x "$PG_BIN/initdb" ]]; then
    echo "Postgres binaries not found. Install Postgres 15+ or set TEST_DATABASE_URL." >&2
    exit 1
  fi

  PORT="${TEST_PG_PORT:-54329}"
  DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/peniel-test-pg.XXXXXX")"

  # Postgres refuses to run as root; use the postgres user when we are root.
  run_pg() {
    if [[ "$(id -u)" == "0" ]]; then runuser -u postgres -- "$@"; else "$@"; fi
  }
  if [[ "$(id -u)" == "0" ]]; then chown postgres "$DATA_DIR"; fi

  run_pg "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust >/dev/null
  run_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k $DATA_DIR -c listen_addresses=127.0.0.1" -l "$DATA_DIR/log" -w start >/dev/null

  cleanup() {
    run_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
  }

  TEST_PG_URL="postgres://postgres@127.0.0.1:$PORT/postgres"
fi

with_db() { echo "${TEST_PG_URL%/*}/$1"; }
psql "$TEST_PG_URL" -q -X -v ON_ERROR_STOP=1 \
  -c "drop database if exists peniel_template" -c "create database peniel_template" >/dev/null
PSQL=(psql "$(with_db peniel_template)" -v ON_ERROR_STOP=1 -q -X)

echo "→ applying Supabase shim"
"${PSQL[@]}" -f tests/db/supabase-shim.sql >/dev/null

for f in supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

echo "→ seed"
"${PSQL[@]}" -f supabase/seed.sql >/dev/null

status=0
for t in tests/db/*.test.ts; do
  name="peniel_test_$(basename "$t" .test.ts | tr -c 'a-z0-9\n' '_')"
  psql "$TEST_PG_URL" -q -X -v ON_ERROR_STOP=1 \
    -c "drop database if exists $name" -c "create database $name template peniel_template" >/dev/null
  echo "→ $(basename "$t")"
  TEST_DATABASE_URL="$(with_db "$name")" node --test "$t" || status=1
done
exit $status
