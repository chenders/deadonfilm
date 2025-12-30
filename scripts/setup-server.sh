#!/bin/bash
#
# Dead on Film - Ubuntu Noble Server Setup Script
#
# This script automates the installation of all required packages and configuration
# for running Dead on Film on a self-hosted Ubuntu server with:
# - Docker for containerization
# - Cloudflare Tunnel for secure access (hides home IP)
# - GitHub Actions self-hosted runner for CI/CD (as Docker containers)
# - New Relic for monitoring
#
# Usage: sudo bash setup-server.sh [OPTIONS]
#
# Options:
#   --deploy-user NAME    Username for deployment (default: deploy)
#   --app-dir PATH        Application directory (default: /opt/deadonfilm)
#   --runner-count N      Number of GitHub runner containers (default: 2)
#   --skip-runner         Skip GitHub Actions runner setup
#   --skip-newrelic       Skip New Relic installation
#   --help                Show this help message
#

set -e

# ============================================
# Default Configuration
# ============================================
DEPLOY_USER="deploy"
APP_DIR="/opt/deadonfilm"
RUNNER_DIR="/opt/github-runners"
RUNNER_COUNT=2
SKIP_RUNNER=false
SKIP_NEWRELIC=false

# ============================================
# Parse command line arguments
# ============================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --deploy-user)
      DEPLOY_USER="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --runner-count)
      RUNNER_COUNT="$2"
      shift 2
      ;;
    --skip-runner)
      SKIP_RUNNER=true
      shift
      ;;
    --skip-newrelic)
      SKIP_NEWRELIC=true
      shift
      ;;
    --help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ============================================
# Preflight checks
# ============================================
if [[ $EUID -ne 0 ]]; then
  echo "Error: This script must be run as root (use sudo)"
  exit 1
fi

if [[ ! -f /etc/os-release ]] || ! grep -q "noble" /etc/os-release; then
  echo "Warning: This script is designed for Ubuntu 24.04 (Noble)"
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "============================================"
echo "Dead on Film Server Setup"
echo "============================================"
echo ""
echo "Configuration:"
echo "  Deploy user:    $DEPLOY_USER"
echo "  App directory:  $APP_DIR"
echo "  Runner dir:     $RUNNER_DIR"
echo "  Runner count:   $RUNNER_COUNT"
echo "  Skip runner:    $SKIP_RUNNER"
echo "  Skip New Relic: $SKIP_NEWRELIC"
echo ""
read -p "Continue with installation? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  exit 0
fi

# ============================================
# Update system
# ============================================
echo ""
echo "[1/12] Updating system packages..."
apt update && apt upgrade -y

# ============================================
# Install core utilities
# ============================================
echo ""
echo "[2/12] Installing core utilities..."
apt install -y \
  curl \
  wget \
  git \
  jq \
  htop \
  vim \
  unzip \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  build-essential \
  python3 \
  net-tools \
  dnsutils \
  iputils-ping \
  logrotate \
  fail2ban \
  ufw \
  certbot \
  openssl \
  openssh-server

# ============================================
# Note: GitHub Actions Runner dependencies not needed
# ============================================
# Runners are Docker-based, so no host dependencies required
echo ""
echo "[3/12] Skipping GitHub Actions Runner host dependencies (using Docker)..."

# ============================================
# Add APT repositories
# ============================================
echo ""
echo "[4/12] Adding APT repositories..."

install -m 0755 -d /etc/apt/keyrings

# Docker
echo "  - Docker..."
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cloudflare
echo "  - Cloudflare..."
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | gpg --dearmor -o /etc/apt/keyrings/cloudflare.gpg
echo "deb [signed-by=/etc/apt/keyrings/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/cloudflared.list > /dev/null

# New Relic
if [[ "$SKIP_NEWRELIC" != true ]]; then
  echo "  - New Relic..."
  curl -fsSL https://download.newrelic.com/infrastructure_agent/gpg/newrelic-infra.gpg | gpg --dearmor -o /etc/apt/keyrings/newrelic-infra.gpg
  echo "deb [signed-by=/etc/apt/keyrings/newrelic-infra.gpg] https://download.newrelic.com/infrastructure_agent/linux/apt noble main" | tee /etc/apt/sources.list.d/newrelic-infra.list > /dev/null
fi

# Node.js (remove old versions first to avoid conflicts)
echo "  - Node.js..."
apt-get remove -y nodejs npm nodejs-legacy 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true
# nosemgrep: bash.curl.security.curl-pipe-bash.curl-pipe-bash -- NodeSource official install script
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1

# PostgreSQL
echo "  - PostgreSQL..."
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list > /dev/null

# GitHub CLI
echo "  - GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null

# ============================================
# Install packages from repositories
# ============================================
echo ""
echo "[5/12] Installing packages from repositories..."
apt update

PACKAGES=(
  docker-ce
  docker-ce-cli
  containerd.io
  docker-buildx-plugin
  docker-compose-plugin
  cloudflared
  nodejs
  postgresql-client-16
  gh
)

if [[ "$SKIP_NEWRELIC" != true ]]; then
  PACKAGES+=(newrelic-infra)
fi

apt install -y "${PACKAGES[@]}"

# ============================================
# Create users
# ============================================
echo ""
echo "[6/12] Creating users..."

# Deploy user
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  echo "  Created user: $DEPLOY_USER"
else
  echo "  User $DEPLOY_USER already exists"
fi

usermod -aG docker "$DEPLOY_USER"

mkdir -p /home/$DEPLOY_USER/.ssh
chmod 700 /home/$DEPLOY_USER/.ssh
touch /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# Add current sudo user to docker group
if [ -n "$SUDO_USER" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "  Added $SUDO_USER to docker group"
fi

# ============================================
# Create directories
# ============================================
echo ""
echo "[7/12] Creating directories..."

mkdir -p $APP_DIR
chown $DEPLOY_USER:$DEPLOY_USER $APP_DIR
echo "  Created $APP_DIR"

mkdir -p /etc/cloudflared
chmod 755 /etc/cloudflared
echo "  Created /etc/cloudflared"

if [[ "$SKIP_RUNNER" != true ]]; then
  mkdir -p $RUNNER_DIR
  chown $DEPLOY_USER:$DEPLOY_USER $RUNNER_DIR
  echo "  Created $RUNNER_DIR"
fi

# ============================================
# Configure sudoers
# ============================================
echo ""
echo "[8/12] Configuring sudoers..."

cat > /etc/sudoers.d/deploy << EOF
# Allow deploy user to manage services and docker without password
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart deadonfilm
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload deadonfilm
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl status deadonfilm
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start deadonfilm
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop deadonfilm
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart cloudflared
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart github-runners
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop github-runners
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl start github-runners
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker compose *
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker *
EOF
chmod 440 /etc/sudoers.d/deploy
echo "  Configured sudoers for $DEPLOY_USER"

# ============================================
# Configure SSH hardening
# ============================================
echo ""
echo "[9/12] Configuring SSH hardening..."

ALLOWED_USERS="$DEPLOY_USER"

# Add current sudo user to allowed users if exists
if [ -n "$SUDO_USER" ]; then
  ALLOWED_USERS="$ALLOWED_USERS $SUDO_USER"
fi

cat > /etc/ssh/sshd_config.d/hardening.conf << EOF
# Dead on Film SSH Hardening Configuration
# Generated by setup-server.sh

# Disable password authentication (use SSH keys only)
PasswordAuthentication no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no

# Disable root login
PermitRootLogin no

# Only allow specific users
AllowUsers $ALLOWED_USERS

# Limit authentication attempts
MaxAuthTries 3
MaxSessions 5

# Idle timeout (5 minutes)
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

echo "  SSH hardening configured (not yet active)"
echo "  Allowed users: $ALLOWED_USERS"

# ============================================
# Create systemd services
# ============================================
echo ""
echo "[10/12] Creating systemd services..."

# Application service
cat > /etc/systemd/system/deadonfilm.service << EOF
[Unit]
Description=Dead on Film Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=$DEPLOY_USER
Group=docker
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose pull && /usr/bin/docker compose up -d

[Install]
WantedBy=multi-user.target
EOF
echo "  Created deadonfilm.service"

# Cloudflare Tunnel service
cat > /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=always
RestartSec=5
TimeoutStartSec=0
User=root

[Install]
WantedBy=multi-user.target
EOF
echo "  Created cloudflared.service"

# GitHub Actions Runner service (Docker-based)
if [[ "$SKIP_RUNNER" != true ]]; then
  cat > /etc/systemd/system/github-runners.service << EOF
[Unit]
Description=GitHub Actions Runners (Docker)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=$DEPLOY_USER
Group=docker
WorkingDirectory=$RUNNER_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose pull && /usr/bin/docker compose up -d

[Install]
WantedBy=multi-user.target
EOF
  echo "  Created github-runners.service"
fi

systemctl daemon-reload

# ============================================
# Create configuration templates
# ============================================
echo ""
echo "[11/12] Creating configuration templates..."

# Cloudflare Tunnel config template
cat > /etc/cloudflared/config.yml << 'EOF'
# Cloudflare Tunnel Configuration
#
# IMPORTANT: Update the following before starting the tunnel:
#   1. Replace YOUR_TUNNEL_ID with your actual tunnel ID
#   2. Ensure credentials.json exists at the path below
#   3. Update hostnames to match your domain
#
# See: docs/SERVER_SETUP.md for complete instructions

tunnel: YOUR_TUNNEL_ID
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Main application
  - hostname: deadonfilm.com
    service: http://localhost:8080

  # www subdomain
  - hostname: www.deadonfilm.com
    service: http://localhost:8080

  # Health check endpoint (optional, for monitoring)
  # - hostname: health.deadonfilm.com
  #   service: http://localhost:8080/health

  # Catch-all rule (required - must be last)
  - service: http_status:404
EOF
chmod 644 /etc/cloudflared/config.yml
echo "  Created /etc/cloudflared/config.yml (template)"

# Docker Compose template
cat > $APP_DIR/docker-compose.yml << 'EOF'
# Dead on Film Docker Compose Configuration
#
# IMPORTANT: Create a .env file with required environment variables:
#   TMDB_API_TOKEN=your_token
#   DATABASE_URL=postgresql://...
#   ANTHROPIC_API_KEY=your_key
#   NEW_RELIC_LICENSE_KEY=your_key (optional)
#
# See: docs/SERVER_SETUP.md for complete instructions

services:
  app:
    image: deadonfilm:latest
    # Or use a registry:
    # image: ghcr.io/chenders/deadonfilm:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=8080
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
chown $DEPLOY_USER:$DEPLOY_USER $APP_DIR/docker-compose.yml
echo "  Created $APP_DIR/docker-compose.yml (template)"

# Environment file template
cat > $APP_DIR/.env.example << 'EOF'
# Dead on Film Environment Variables
# Copy this to .env and fill in your values

# Required
TMDB_API_TOKEN=your_tmdb_api_token
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional - New Relic APM
NEW_RELIC_LICENSE_KEY=your_newrelic_license_key
NEW_RELIC_APP_NAME=Dead on Film
EOF
chown $DEPLOY_USER:$DEPLOY_USER $APP_DIR/.env.example
echo "  Created $APP_DIR/.env.example"

# ============================================
# Create GitHub Actions Runner Docker Compose
# ============================================
if [[ "$SKIP_RUNNER" != true ]]; then
  echo ""
  echo "[12/12] Creating GitHub Actions Runner configuration..."

  # Create docker-compose.yml for runners
  cat > $RUNNER_DIR/docker-compose.yml << EOF
# GitHub Actions Self-Hosted Runners (Docker)
#
# This runs GitHub Actions runners as Docker containers using the
# myoung34/github-runner image. Each runner is ephemeral and gets
# a fresh environment for each job.
#
# IMPORTANT: Create a .env file with:
#   GITHUB_ACCESS_TOKEN=your_personal_access_token
#   GITHUB_OWNER=your_org_or_username
#   GITHUB_REPOSITORY=your_repo_name
#
# See: docs/SERVER_SETUP.md for complete instructions

services:
EOF

  # Generate runner services based on RUNNER_COUNT
  for i in $(seq 1 $RUNNER_COUNT); do
    cat >> $RUNNER_DIR/docker-compose.yml << EOF
  runner-$i:
    image: myoung34/github-runner:latest
    restart: unless-stopped
    environment:
      - RUNNER_NAME=deadonfilm-runner-$i
      - RUNNER_WORKDIR=/tmp/github-runner
      - RUNNER_SCOPE=repo
      - LABELS=self-hosted,linux,x64,production
      - EPHEMERAL=true
      - DISABLE_AUTO_UPDATE=true
    env_file:
      - .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - runner-$i-work:/tmp/github-runner
    extra_hosts:
      - "host.docker.internal:host-gateway"
    security_opt:
      - label:disable

EOF
  done

  # Add volumes section
  echo "volumes:" >> $RUNNER_DIR/docker-compose.yml
  for i in $(seq 1 $RUNNER_COUNT); do
    echo "  runner-$i-work:" >> $RUNNER_DIR/docker-compose.yml
  done

  chown $DEPLOY_USER:$DEPLOY_USER $RUNNER_DIR/docker-compose.yml
  echo "  Created $RUNNER_DIR/docker-compose.yml with $RUNNER_COUNT runners"

  # Create .env.example for runners
  cat > $RUNNER_DIR/.env.example << 'EOF'
# GitHub Actions Runner Environment Variables
# Copy this to .env and fill in your values
#
# To create a Personal Access Token:
#   1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
#   2. Create a token with "Administration" repository permission (read and write)
#   3. Copy the token value below
#
# For organization runners, use ORG_NAME instead of REPO_URL

# Required - GitHub Authentication (use ACCESS_TOKEN, not GITHUB_ACCESS_TOKEN)
ACCESS_TOKEN=ghp_your_personal_access_token

# Required for repository runners - Full URL to your repository
REPO_URL=https://github.com/chenders/deadonfilm

# Alternative: For organization-level runners instead of repo-level
# ORG_NAME=your-org
# RUNNER_GROUP=default
EOF
  chown $DEPLOY_USER:$DEPLOY_USER $RUNNER_DIR/.env.example
  echo "  Created $RUNNER_DIR/.env.example"

else
  echo ""
  echo "[12/12] Skipping GitHub Actions Runner configuration..."
fi

# ============================================
# Enable services
# ============================================
echo ""
echo "Enabling services..."

systemctl enable docker
systemctl start docker
echo "  Docker: enabled and started"

systemctl enable fail2ban
systemctl start fail2ban
echo "  Fail2ban: enabled and started"

systemctl enable ssh
systemctl start ssh
echo "  SSH: enabled and started"

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Installed packages:"
echo "  - Docker CE with Compose and Buildx"
echo "  - Cloudflare Tunnel (cloudflared)"
echo "  - Node.js 22 LTS"
echo "  - PostgreSQL Client 16"
echo "  - GitHub CLI"
if [[ "$SKIP_NEWRELIC" != true ]]; then
  echo "  - New Relic Infrastructure Agent"
fi
echo ""
echo "Created users:"
echo "  - $DEPLOY_USER (deployment and runners)"
echo ""
echo "Created directories:"
echo "  - $APP_DIR (application)"
echo "  - /etc/cloudflared (tunnel config)"
if [[ "$SKIP_RUNNER" != true ]]; then
  echo "  - $RUNNER_DIR (GitHub runners)"
fi
echo ""
echo "Configuration files created:"
echo "  - /etc/cloudflared/config.yml (template - needs tunnel ID)"
echo "  - $APP_DIR/docker-compose.yml (template)"
echo "  - $APP_DIR/.env.example"
if [[ "$SKIP_RUNNER" != true ]]; then
  echo "  - $RUNNER_DIR/docker-compose.yml ($RUNNER_COUNT runners configured)"
  echo "  - $RUNNER_DIR/.env.example"
fi
echo "  - /etc/ssh/sshd_config.d/hardening.conf (not yet active)"
echo ""
echo "Systemd services created:"
echo "  - deadonfilm.service (application)"
echo "  - cloudflared.service (Cloudflare tunnel)"
if [[ "$SKIP_RUNNER" != true ]]; then
  echo "  - github-runners.service (Docker-based runners)"
fi
echo ""
echo "============================================"
echo "NEXT STEPS"
echo "============================================"
echo ""
echo "See docs/SERVER_SETUP.md for complete instructions."
echo ""
echo "Quick checklist:"
echo "  [ ] Add SSH public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  [ ] Configure Cloudflare Tunnel (cloudflared tunnel login)"
echo "  [ ] Configure UFW firewall"
if [[ "$SKIP_RUNNER" != true ]]; then
  echo "  [ ] Create $RUNNER_DIR/.env with GitHub token"
  echo "  [ ] Start runners: sudo systemctl enable github-runners && sudo systemctl start github-runners"
fi
if [[ "$SKIP_NEWRELIC" != true ]]; then
  echo "  [ ] Configure New Relic (/etc/newrelic-infra.yml)"
fi
echo "  [ ] Create $APP_DIR/.env from .env.example"
echo "  [ ] Restart SSH to apply hardening"
echo ""
echo "WARNING: Before restarting SSH, ensure you have added your"
echo "SSH public key to an allowed user's authorized_keys file!"
echo ""
