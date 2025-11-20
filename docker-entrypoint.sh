#!/bin/sh
set -euo pipefail

APP_VARIANT="${APP_VARIANT:-MYSQL-VERSION}"

ensure_mysql_ready() {
  mkdir -p /run/mysqld
  chown -R mysql:mysql /run/mysqld /var/lib/mysql

  if [ ! -d /var/lib/mysql/mysql ]; then
    mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
  fi

  mysqld --user=mysql --datadir=/var/lib/mysql --bind-address=0.0.0.0 --socket=/run/mysqld/mysqld.sock &
  MYSQL_PID=$!

  cleanup() {
    if kill -0 "$MYSQL_PID" 2>/dev/null; then
      kill "$MYSQL_PID"
      wait "$MYSQL_PID" || true
    fi
  }
  trap cleanup INT TERM

  until mariadb-admin ping --silent; do
    sleep 1
  done

  DB_NAME="${MYSQL_DATABASE:-library_system}"
  DB_USER="${MYSQL_USER:-pgdev}"
  DB_PASS="${MYSQL_PASSWORD:-parkggez}"

  mariadb -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mariadb -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
  mariadb -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%'; FLUSH PRIVILEGES;"

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
