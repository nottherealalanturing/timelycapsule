# Cloudflare Origin CA certificate: steps and install

State (2026-11-07): the ECDSA P-256 key and CSR exist on tc-app in `/opt/timelycapsule/certs` (key `origin.key` root:root 0600 never left the server; `origin.csr` public). Caddy still uses `tls internal`; nothing uses the new key yet.

1. YOU (Cloudflare dashboard, zone timelycapsule.com): SSL/TLS -> Origin Server -> Create Certificate -> "Use my private key and CSR" -> paste the CSR (printed in the chat) -> hostnames: `api.timelycapsule.com` only -> validity 15 years -> Create. Copy the **Origin Certificate** PEM (public). Do not look for a private key: there is none to download.
2. Give me the certificate PEM (public; safe to paste). I install it as `/opt/timelycapsule/certs/origin.pem` (root:root 0644) and verify it matches the key: public-key fingerprint equality (key `2879d580...edfab`).
3. Validate with the real files in a throwaway container before touching Caddy: `docker run --rm --cap-drop ALL -v certs:/certs:ro -v new Caddyfile ... caddy validate` (then also a handshake test on a spare port).
4. Switch: back up `Caddyfile`, install the repo Caddyfile (Origin CA, trusted Cloudflare proxies), `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`, test with `curl --resolve api.timelycapsule.com:443:127.0.0.1 -k`: the certificate subject must be the Origin CA cert. Rollback = restore the saved Caddyfile and reload (seconds).
5. Cloudflare: SSL mode stays **Full (strict)**. Only after steps 1-4 work: G2 (DNS `api` A -> 129.159.14.229, proxied).
6. Phase 2 (G4): enable Authenticated Origin Pulls in Cloudflare, then enable the `client_auth` block in the Caddyfile (tested: no/wrong client cert rejected, right CA accepted).
File modes matter: with `cap_drop: ALL` Caddy (root in its container) can read the key only because it is owned by root:root; a key owned by another uid makes Caddy fail to start (tested).
