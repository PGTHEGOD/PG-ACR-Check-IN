#!/bin/sh
set -euo pipefail

APP_VARIANT="${APP_VARIANT:-MYSQL-VERSION}"

ensure_mysql_ready() {
  mkdir -p /run/mysqld
  chown -R mysql:mysql /run/mysqld /var/lib/mysql

  if [ ! -d /var/lib/mysql/mysql ]; then
    mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
  fi

  MYSQL_PORT="${MYSQL_PORT:-3306}"
  mysqld --user=mysql \
    --datadir=/var/lib/mysql \
    --bind-address=0.0.0.0 \
    --port="$MYSQL_PORT" \
    --socket=/run/mysqld/mysqld.sock \
    --skip-networking=0 \
    &
  MYSQL_PID=$!

  cleanup() {
    if kill -0 "$MYSQL_PID" 2>/dev/null; then
      kill "$MYSQL_PID"
      wait "$MYSQL_PID" || true
    fi
  }
  trap cleanup INT TERM

  until mariadb-admin --protocol=socket --socket=/run/mysqld/mysqld.sock ping --silent; do
    sleep 1
  done

  DB_NAME="${MYSQL_DATABASE:-}"
  ROOT_PASS="${MYSQL_ROOT_PASSWORD:-}"
  DB_PASS="${MYSQL_PASSWORD:-$ROOT_PASS}"
  DB_USER="root"

  if [ -z "$DB_NAME" ] || [ -z "$ROOT_PASS" ]; then
    echo "ERROR: MYSQL_DATABASE and MYSQL_ROOT_PASSWORD must be provided via environment variables." >&2
    exit 1
  fi
  if [ -z "$DB_PASS" ]; then
    DB_PASS="$ROOT_PASS"
  fi

  mariadb --protocol=socket --socket=/run/mysqld/mysqld.sock -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$ROOT_PASS';"
  mariadb --protocol=socket --socket=/run/mysqld/mysqld.sock -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '$ROOT_PASS';"
  mariadb --protocol=socket --socket=/run/mysqld/mysqld.sock -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
  mariadb --protocol=socket --socket=/run/mysqld/mysqld.sock -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

  export MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}
  export MYSQL_PORT
  export MYSQL_USER="$DB_USER"
  export MYSQL_PASSWORD="$DB_PASS"

  pnpm start &
  APP_PID=$!
  wait "$APP_PID"
  cleanup
}

if [ "$APP_VARIANT" = "MYSQL-VERSION" ]; then
  ensure_mysql_ready
else
  exec pnpm start
fi
