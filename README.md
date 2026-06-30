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

## External Access Setup (SSH Reverse Tunnel)

Since the dev machine has no public IP, a cloud VM is used as a relay to expose the local server for OAuth, E2E testing.

```
Browser → http://<domain>:4430 → cloud VM (public IP) → SSH reverse tunnel → localhost:4430
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
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_gcp -C "<nickname>"
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
ssh -i ~/.ssh/id_ed25519_gcp \
    -R 4430:localhost:8080 \
    -N <nickname>@<domain>
```

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

