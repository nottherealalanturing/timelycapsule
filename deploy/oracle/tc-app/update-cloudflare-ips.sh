#!/bin/sh
# Prints the Caddy `trusted_proxies static ...` line for the current Cloudflare
# ranges. Read-only: paste the output into the Caddyfile and reload Caddy.
set -eu
v4=$(curl -fsS https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS https://www.cloudflare.com/ips-v6)
printf 'trusted_proxies static %s\n' "$(printf '%s\n%s\n' "$v4" "$v6" | tr '\n' ' ' | sed 's/ *$//')"
