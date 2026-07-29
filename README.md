디렉터리 구조
<br><br>
my-project<br>
├── docker-compose.yml<br>
├── nginx<br>
│   └── default.conf<br>
├── frontend<br>
│   ├── Dockerfile<br>
│   └── ... (Vue.js 프로젝트 파일)<br>
└── backend<br>
    ├── Dockerfile<br>
    └── ... (Node.js + TypeScript 프로젝트 파일)<br>

## API documentation

Authentication, account, Google OAuth, and session endpoints are documented in
[`docs/auth-api.md`](docs/auth-api.md).

With the Docker stack running, interactive Swagger documentation is available at
`https://localhost:4430/api/docs/`. The raw OpenAPI document is available at
`https://localhost:4430/api/docs.json`.

The authenticated WebSocket foundation, event format, extension points, and
channel security rules are documented in [`docs/realtime.md`](docs/realtime.md).
The current add/list/remove friend contract is documented in
[`docs/friends.md`](docs/friends.md).

## Google OAuth local setup

The local Docker entrypoint is `https://localhost:4430`. The backend supports the
currently registered Google callback URI:

```text
https://localhost:4430/oauth/google
```

1. Copy `.env.example` to `.env` and set the OAuth client values.
2. Set a `JWT_ACCESS_SECRET` with at least 32 characters.
3. Rebuild and start the stack with `docker compose up --build`.
4. Open `https://localhost:4430/signin` and choose Google login.

The canonical callback endpoint is also available at
`/api/auth/oauth/callback/google`. For a public deployment, add the exact HTTPS
URL to the Google OAuth client and update both `APP_ORIGIN` and
`GOOGLE_REDIRECT_URI`; never derive the redirect URI from request headers.

## External Access Setup (SSH Reverse Tunnel)

Since the dev machine has no public IP, a cloud VM is used as a relay to expose the local server for OAuth, E2E testing.

```
Browser → https://<domain>:4430 → cloud VM (public IP) → SSH reverse tunnel → localhost:4430
```

### 1. Cloud VM (GCP)
- Instance type: `e2-micro`
- Region: `us-west1`
- Promote the VM's external IP to **static**

### 2. Firewall rule
- Allow ingress TCP `4430` from `0.0.0.0/0`
(ports below 1024, e.g. 443, require root and won't work for non-root reverse tunnels)

### 3. DDNS
- Point your domain to the GCP VM's static IP

### 4. SSH key setup
```bash
ssh-keygen -t ed25519 -f ~/.ssh/<private-key> -C "<nickname>"
# leave passphrase empty for unattended tunneling
```
Add the `.pub` key content to the VM via Console → VM instance → Edit → SSH Keys.

### 5. Enable GatewayPorts on the VM
```bash
sudo nano /etc/ssh/sshd_config
# add: GatewayPorts yes
sudo systemctl restart sshd
```

### 6. Start the tunnel (run on local machine)
```bash
ssh -i ~/.ssh/<private-key> \
    -R 4430:localhost:4430 \
    -N <nickname>@<domain>
```

or add below config to your ~/.ssh/config

```
Host tunnel
  HostName <cloud-vm-ip>
  User <nickname>
  RemoteForward 4430 localhost:4430
  SessionType none
```

and run

```bash
ssh tunnel
```

For this public origin, add `https://<domain>:4430/oauth/google` to the Google
client's authorized redirect URIs and set the same value as
`GOOGLE_REDIRECT_URI`. Set `APP_ORIGIN=https://<domain>:4430` and install a
publicly trusted TLS certificate for the domain.

### 7. Vite config
```ts
// vite.config.ts
export default defineConfig({
  server: {
    allowedHosts: ['<domain>'],
  },
})
```

### Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `Permission denied (publickey)` | passphrase set / wrong key | `ssh-keygen -p -f ~/.ssh/id_ed25519_gcp` |
| `remote port forwarding failed for listen port 443` | port < 1024 needs root | use port ≥ 1024 (e.g. 4430) |
| `refused to connect` | `GatewayPorts` not enabled | set `GatewayPorts yes` in `sshd_config` |
| `allowedHosts` error | Vite blocks unknown host | add domain to `vite.config.ts` |
