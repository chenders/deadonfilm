# Self-Hosted Server Setup Guide

This guide walks you through setting up a self-hosted Ubuntu server to run Dead on Film with:

- **Docker** for containerization
- **Cloudflare Tunnel** to hide your home IP and provide SSL/DDoS protection
- **GitHub Actions self-hosted runner** for CI/CD
- **New Relic** for monitoring

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Installation](#server-installation)
3. [Run the Setup Script](#run-the-setup-script)
4. [Configure SSH Access](#configure-ssh-access)
5. [Configure Cloudflare Tunnel](#configure-cloudflare-tunnel)
6. [Configure Firewall](#configure-firewall)
7. [Configure GitHub Actions Runner](#configure-github-actions-runner)
8. [Configure New Relic](#configure-new-relic)
9. [Deploy the Application](#deploy-the-application)
10. [Cloudflare Dashboard Settings](#cloudflare-dashboard-settings)
11. [GitHub Actions Workflow](#github-actions-workflow)
12. [Maintenance](#maintenance)
13. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Hardware Requirements

- Ubuntu 24.04 LTS (Noble) server
- Minimum 2GB RAM (4GB recommended)
- 20GB disk space
- Stable internet connection

### Accounts Required

- **Cloudflare account** with your domain added (free tier works)
- **GitHub account** with access to the repository
- **New Relic account** (optional, for monitoring)
- **Neon PostgreSQL** database (or other PostgreSQL provider)

### Information to Gather

Before starting, collect these values:

| Item | Where to Find It |
|------|------------------|
| Domain name | Your domain registrar |
| Cloudflare account | dash.cloudflare.com |
| GitHub repo URL | github.com/your-org/your-repo |
| GitHub runner token | Repo Settings → Actions → Runners → New |
| TMDB API token | developer.themoviedb.org |
| Anthropic API key | console.anthropic.com |
| Database URL | Neon dashboard |
| New Relic license key | New Relic → API Keys |
| SSH public key | `cat ~/.ssh/id_ed25519.pub` on your local machine |

---

## Server Installation

### Option A: Fresh Ubuntu Install

1. Download Ubuntu Server 24.04 LTS from ubuntu.com
2. Install with minimal packages
3. Enable OpenSSH server during installation
4. Complete installation and reboot

### Option B: Cloud VPS

If using a cloud provider, create an Ubuntu 24.04 instance and SSH in:

```bash
ssh root@your-server-ip
```

---

## Run the Setup Script

### 1. Transfer the Setup Script

From your local machine:

```bash
scp scripts/setup-server.sh root@your-server-ip:/root/
```

Or clone the repository on the server:

```bash
git clone https://github.com/chenders/deadonfilm.git /tmp/deadonfilm
cp /tmp/deadonfilm/scripts/setup-server.sh /root/
```

### 2. Run the Script

```bash
ssh root@your-server-ip
chmod +x /root/setup-server.sh
sudo /root/setup-server.sh
```

#### Script Options

| Option | Description |
|--------|-------------|
| `--deploy-user NAME` | Username for deployment (default: deploy) |
| `--app-dir PATH` | Application directory (default: /opt/deadonfilm) |
| `--runner-count N` | Number of GitHub runner containers (default: 2) |
| `--skip-runner` | Skip GitHub Actions runner setup |
| `--skip-newrelic` | Skip New Relic installation |

Example with options:

```bash
sudo /root/setup-server.sh --deploy-user deploy --runner-count 4
```

### 3. Verify Installation

```bash
# Check Docker
docker --version
docker compose version

# Check cloudflared
cloudflared --version

# Check Node.js
node --version

# Check PostgreSQL client
psql --version

# Check GitHub CLI
gh --version
```

---

## Configure SSH Access

### 1. Add Your SSH Public Key

On your **local machine**, get your public key:

```bash
cat ~/.ssh/id_ed25519.pub
# Or if using RSA:
cat ~/.ssh/id_rsa.pub
```

On the **server**, add it to the deploy user:

```bash
echo 'your-public-key-here' >> /home/deploy/.ssh/authorized_keys
```

### 2. Test SSH Access (Before Enabling Hardening!)

From your **local machine**, verify you can connect:

```bash
ssh deploy@your-server-ip
```

### 3. Activate SSH Hardening

Only after confirming SSH works with your key:

```bash
sudo systemctl restart ssh
```

**WARNING**: If you skip step 2, you may lock yourself out of the server!

### 4. Verify Hardened SSH

From your local machine:

```bash
# This should work
ssh deploy@your-server-ip

# This should fail (password auth disabled)
ssh -o PreferredAuthentications=password deploy@your-server-ip
```

---

## Configure Cloudflare Tunnel

Cloudflare Tunnel creates an outbound connection from your server to Cloudflare, meaning:
- Your home IP is never exposed
- No port forwarding required on your router
- Automatic SSL/TLS certificates
- DDoS protection included

### 1. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser. Select your domain and authorize.

### 2. Create a Tunnel

```bash
cloudflared tunnel create deadonfilm
```

This outputs a tunnel ID and creates a credentials file. Note the tunnel ID.

### 3. Copy Credentials

```bash
sudo cp ~/.cloudflared/*.json /etc/cloudflared/credentials.json
sudo chmod 600 /etc/cloudflared/credentials.json
```

### 4. Update Tunnel Configuration

Edit `/etc/cloudflared/config.yml`:

```bash
sudo vim /etc/cloudflared/config.yml
```

Replace `YOUR_TUNNEL_ID` with your actual tunnel ID:

```yaml
tunnel: abc123-your-tunnel-id-here
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: deadonfilm.com
    service: http://localhost:8080

  - hostname: www.deadonfilm.com
    service: http://localhost:8080

  - service: http_status:404
```

### 5. Route DNS to Tunnel

```bash
cloudflared tunnel route dns deadonfilm deadonfilm.com
cloudflared tunnel route dns deadonfilm www.deadonfilm.com
```

Or configure in Cloudflare Dashboard:
1. Go to your domain → DNS
2. Add CNAME record: `@` → `<tunnel-id>.cfargotunnel.com`
3. Add CNAME record: `www` → `<tunnel-id>.cfargotunnel.com`
4. Ensure proxy status is "Proxied" (orange cloud)

### 6. Test Tunnel (Before Enabling Service)

```bash
sudo cloudflared tunnel --config /etc/cloudflared/config.yml run
```

In another terminal or from your local machine, verify:
```bash
curl -I https://deadonfilm.com/health
```

Press Ctrl+C to stop the test.

### 7. Enable Tunnel Service

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

### 8. Verify Tunnel is Running

```bash
# Check service status
sudo systemctl status cloudflared

# Check tunnel status in Cloudflare dashboard
cloudflared tunnel info deadonfilm
```

---

## Configure Firewall

With Cloudflare Tunnel, you don't need to expose ports 80/443. Only SSH is needed (and even that can be tunneled).

### Basic Setup (SSH Only)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw enable
```

### Verify Firewall

```bash
sudo ufw status verbose
```

Expected output:
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
```

### Optional: SSH via Cloudflare Tunnel

For maximum security, you can tunnel SSH through Cloudflare and close port 22:

1. Add to `/etc/cloudflared/config.yml`:
   ```yaml
   ingress:
     - hostname: ssh.deadonfilm.com
       service: ssh://localhost:22
     # ... other rules ...
   ```

2. Route DNS:
   ```bash
   cloudflared tunnel route dns deadonfilm ssh.deadonfilm.com
   ```

3. On your **local machine**, add to `~/.ssh/config`:
   ```
   Host ssh.deadonfilm.com
     ProxyCommand cloudflared access ssh --hostname %h
   ```

4. Test SSH via tunnel:
   ```bash
   ssh deploy@ssh.deadonfilm.com
   ```

5. If working, close port 22:
   ```bash
   sudo ufw delete allow 22/tcp
   ```

---

## Configure GitHub Actions Runner

The setup script creates Docker-based GitHub Actions runners using the `myoung34/github-runner` image. This provides:
- Ephemeral runners (fresh environment for each job)
- No host dependencies to manage
- Easy scaling (adjust `--runner-count` in setup)
- Docker-in-Docker support for building containers

### 1. Create a GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Configure:
    - Token name: `deadonfilm-runners`
    - Expiration: 90 days (or custom)
    - Repository access: Only select repositories → `deadonfilm`
    - Permissions:
        - Repository permissions → Administration: Read and write
4. Click "Generate token" and copy the value

### 2. Configure Runner Environment

```bash
cd /opt/github-runners
cp .env.example .env
vim .env
```

Fill in your values:

```bash
ACCESS_TOKEN=ghp_your_token_here
REPO_URL=https://github.com/chenders/deadonfilm
```

Secure the file:

```bash
chmod 600 .env
```

### 3. Start the Runners

```bash
sudo systemctl enable github-runners
sudo systemctl start github-runners
```

### 4. Verify Runners

```bash
# Check container status
docker ps | grep runner

# Check logs
docker compose -f /opt/github-runners/docker-compose.yml logs -f
```

Check GitHub: Repository → Settings → Actions → Runners

You should see your runners listed (e.g., `deadonfilm-runner-1`, `deadonfilm-runner-2`) with status "Idle".

### Runner Configuration Details

The runners are configured with these settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `EPHEMERAL=true` | Enabled | Runner exits after each job for a clean environment |
| `LABELS` | `self-hosted,linux,x64,production` | Labels for job targeting |
| `RUNNER_SCOPE` | `repo` | Repository-level runner (change to `org` for organization) |
| Docker socket | Mounted | Allows building Docker images in workflows |

### Scaling Runners

To change the number of runners, edit `/opt/github-runners/docker-compose.yml` or re-run setup:

```bash
# Re-run setup with different count
sudo /root/setup-server.sh --runner-count 4
```

### Token Renewal

Fine-grained tokens expire. Set a calendar reminder to renew before expiration:

1. Create a new token following step 1
2. Update `/opt/github-runners/.env` with the new token
3. Restart runners:
   ```bash
   sudo systemctl restart github-runners
   ```

---

## Configure New Relic

### 1. Edit Configuration

```bash
sudo vim /etc/newrelic-infra.yml
```

Add your license key:

```yaml
license_key: YOUR_NEW_RELIC_LICENSE_KEY
display_name: deadonfilm-prod
```

### 2. Enable Service

```bash
sudo systemctl enable newrelic-infra
sudo systemctl start newrelic-infra
```

### 3. Verify in New Relic

1. Go to New Relic One → Infrastructure
2. Your host should appear within a few minutes

---

## Deploy the Application

### 1. Create Environment File

```bash
sudo su - deploy
cd /opt/deadonfilm
cp .env.example .env
vim .env
```

Fill in your values:

```bash
TMDB_API_TOKEN=your_tmdb_token
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
ANTHROPIC_API_KEY=your_anthropic_key
NEW_RELIC_LICENSE_KEY=your_newrelic_key
NEW_RELIC_APP_NAME=Dead on Film
```

Secure the file:

```bash
chmod 600 .env
```

### 2. Build or Pull Docker Image

#### Option A: Build Locally

```bash
cd /opt/deadonfilm
git clone https://github.com/chenders/deadonfilm.git .
docker build -t deadonfilm:latest .
```

#### Option B: Pull from Registry

Update `docker-compose.yml` to use your registry:

```yaml
services:
  app:
    image: ghcr.io/chenders/deadonfilm:latest
```

### 3. Start the Application

```bash
exit  # Exit deploy user if still in that shell
sudo systemctl enable deadonfilm
sudo systemctl start deadonfilm
```

### 4. Verify Deployment

```bash
# Check container is running
docker ps

# Check logs
docker compose -f /opt/deadonfilm/docker-compose.yml logs -f

# Test health endpoint (locally)
curl http://localhost:8080/health

# Test via Cloudflare
curl https://deadonfilm.com/health
```

---

## Cloudflare Dashboard Settings

Configure these settings in the Cloudflare dashboard for optimal security and performance.

### SSL/TLS Settings

Navigate to: SSL/TLS → Overview

| Setting | Value | Notes |
|---------|-------|-------|
| Encryption mode | Full | Use "Full (strict)" if you add origin certs |
| Always Use HTTPS | On | |
| Automatic HTTPS Rewrites | On | |
| Minimum TLS Version | 1.2 | |

### Security Settings

Navigate to: Security → Settings

| Setting | Value |
|---------|-------|
| Security Level | Medium |
| Bot Fight Mode | On |
| Browser Integrity Check | On |

### Speed Settings

Navigate to: Speed → Optimization

| Setting | Value |
|---------|-------|
| Auto Minify | HTML, CSS, JavaScript (all) |
| Brotli | On |

### Caching Settings

Navigate to: Caching → Configuration

| Setting | Value |
|---------|-------|
| Caching Level | Standard |
| Browser Cache TTL | Respect Existing Headers |

### Network Settings

Navigate to: Network

| Setting | Value |
|---------|-------|
| HTTP/3 (QUIC) | On |
| WebSockets | On |
| Onion Routing | On |

---

## GitHub Actions Workflow

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:  # Allow manual trigger

jobs:
  build-and-deploy:
    runs-on: self-hosted
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          docker build -t deadonfilm:latest .

      - name: Deploy application
        run: |
          cd /opt/deadonfilm
          sudo docker compose down
          sudo docker compose up -d

      - name: Wait for startup
        run: sleep 10

      - name: Health check
        run: |
          curl -f http://localhost:8080/health || exit 1

      - name: Cleanup old images
        run: |
          docker image prune -f
```

### Alternative: Using GitHub Container Registry

If you prefer to push images to a registry:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

  deploy:
    needs: build
    runs-on: self-hosted
    steps:
      - name: Pull and deploy
        run: |
          cd /opt/deadonfilm
          sudo docker compose pull
          sudo docker compose up -d

      - name: Health check
        run: |
          sleep 10
          curl -f http://localhost:8080/health
```

---

## Maintenance

### View Logs

```bash
# Application logs
docker compose -f /opt/deadonfilm/docker-compose.yml logs -f

# Cloudflare Tunnel logs
sudo journalctl -u cloudflared -f

# GitHub Runner logs
docker compose -f /opt/github-runners/docker-compose.yml logs -f

# New Relic logs
sudo journalctl -u newrelic-infra -f
```

### Restart Services

```bash
# Application
sudo systemctl restart deadonfilm

# Cloudflare Tunnel
sudo systemctl restart cloudflared

# GitHub Runners
sudo systemctl restart github-runners
```

### Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### Update GitHub Runners

Docker-based runners auto-update their images. To force an update:

```bash
cd /opt/github-runners
docker compose pull
sudo systemctl restart github-runners
```

### Clean Docker Resources

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes (careful!)
docker volume prune

# Remove all unused resources
docker system prune -a
```

---

## Troubleshooting

### Application Not Accessible

1. Check if container is running:
   ```bash
   docker ps
   ```

2. Check container logs:
   ```bash
   docker compose -f /opt/deadonfilm/docker-compose.yml logs
   ```

3. Check if Cloudflare Tunnel is running:
   ```bash
   sudo systemctl status cloudflared
   ```

4. Test local connectivity:
   ```bash
   curl http://localhost:8080/health
   ```

### Cloudflare Tunnel Issues

1. Check tunnel status:
   ```bash
   cloudflared tunnel info deadonfilm
   ```

2. Verify config:
   ```bash
   cloudflared tunnel --config /etc/cloudflared/config.yml validate
   ```

3. Check DNS routing:
   ```bash
   dig deadonfilm.com
   # Should return Cloudflare IPs
   ```

### GitHub Runners Not Connecting

1. Check container status:
   ```bash
   docker ps | grep runner
   ```

2. Check runner logs:
   ```bash
   docker compose -f /opt/github-runners/docker-compose.yml logs
   ```

3. Verify environment variables:
   ```bash
   cat /opt/github-runners/.env
   # Ensure ACCESS_TOKEN and REPO_URL are set correctly
   ```

4. Check token validity:
    - Go to GitHub → Settings → Developer settings → Personal access tokens
    - Ensure the token hasn't expired
    - Verify it has "Administration" permission for the repository

5. Restart runners:
   ```bash
   sudo systemctl restart github-runners
   ```

6. Check GitHub for runner status:
    - Repository → Settings → Actions → Runners
    - Runners should show as "Idle" when connected

### SSH Access Issues

If locked out:

1. Access server console directly (physical or cloud provider console)
2. Fix SSH configuration:
   ```bash
   sudo rm /etc/ssh/sshd_config.d/hardening.conf
   sudo systemctl restart ssh
   ```
3. Re-add your SSH key and try again

### Database Connection Issues

1. Test from server:
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

2. Check if Neon allows your IP (or enable "Allow all IPs" for Cloudflare egress)

---

## Security Checklist

- [ ] SSH key-only authentication enabled
- [ ] Root login disabled
- [ ] UFW firewall enabled with minimal ports
- [ ] Cloudflare Tunnel running (no exposed ports)
- [ ] fail2ban enabled
- [ ] Environment variables in .env file (not in docker-compose.yml)
- [ ] .env file has 600 permissions
- [ ] Regular system updates scheduled
- [ ] Cloudflare security settings configured
- [ ] New Relic monitoring active (optional)
