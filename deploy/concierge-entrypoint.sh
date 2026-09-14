#!/bin/sh
set -eu

# EasyPanel may provision a root-owned bind-backed volume. Initialize only this
# service's persistent directory, then run the application as an unprivileged user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R concierge:concierge /data
  exec gosu concierge "$@"
fi

exec "$@"
