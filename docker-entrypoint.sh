#!/bin/sh
set -euo pipefail

APP_VARIANT="${APP_VARIANT:-MYSQL-VERSION}"

# Set defaults based on your provided .env values
# These will be overridden if Docker passes different env vars
MYSQL_DATABASE="${MYSQL_DATABASE:-library_system}"
MYSQL_USER="${MYSQL_USER:-pgdev}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-parkggez}"

ensure_mysql_ready() {
  echo ">> Configuring MySQL permissions..."
  mkdir -p /run/mysqld
  chown -R mysql:mysql /run/mysqld /var/lib/mysql

  # Check if the 'mysql' system database exists. If not, initialize the DB.
  if [ ! -d "/var/lib/mysql/mysql" ]; then
    echo ">> Data directory is empty. Initializing database..."
    
    # Detect initialization command (handles both MariaDB and MySQL variants)
    if command -v mysql_install_db >/dev/null; then
      mysql_install_db --user=mysql --datadir=/var/lib/mysql > /dev/null
    else
      mysqld --initialize-insecure --user=mysql --datadir=/var/lib/mysql
    fi

    echo ">> Starting temporary server to create users..."
    # Start MySQL in background, skipping networking, solely to run the setup SQL
    mysqld --user=mysql --datadir=/var/lib/mysql --skip-networking --socket=/run/mysqld/mysqld.sock &
    PID=$!

    # Wait for the server to be available
    echo ">> Waiting for MySQL socket..."
    for i in $(seq 1 30); do
      if mysqladmin --socket=/run/mysqld/mysqld.sock ping --silent; then
        break
      fi
      sleep 1
    done

    echo ">> creating Database: $MYSQL_DATABASE and User: $MYSQL_USER"
    # Use a Here-Doc to feed SQL commands directly into the socket
    # FIX: We explicitly set MYSQL_HOST="" for this command. 
    # Even with --protocol=socket, if MYSQL_HOST is set to an IP (127.0.0.1), 
    # the client might force TCP, which fails because of --skip-networking.
    MYSQL_HOST="" mysql --protocol=socket --socket=/run/mysqld/mysqld.sock <<-EOSQL
      CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;
      CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
      GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
      FLUSH PRIVILEGES;
EOSQL

    echo ">> Shutting down temporary server..."
    # Ensure shutdown also ignores the TCP host env var
    MYSQL_HOST="" mysqladmin --socket=/run/mysqld/mysqld.sock shutdown
    wait "$PID"
    echo ">> Initialization complete."
  fi

  echo ">> Starting MySQL Server..."
  # exec replaces the current shell with mysqld (PID 1)
  exec mysqld --user=mysql --datadir=/var/lib/mysql --bind-address=0.0.0.0 --console
}

if [ "$APP_VARIANT" = "MYSQL-VERSION" ]; then
  ensure_mysql_ready
else
  echo ">> Starting Application..."
  exec pnpm start
fi