#!/usr/bin/env bash
# ==============================================================================
# OpsTracker — AWS EC2 Provisioning Script (Ubuntu 22.04 / 24.04 LTS)
# Installs Docker, Docker Compose Plugin, monitoring dependencies and configures
# the deployment directory for OpsTracker.
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting OpsTracker EC2 Provisioning"
echo "=========================================================="

# 1. Update system packages
echo "--> Updating package repository..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# 2. Install essential system and monitoring utilities
echo "--> Installing essential utilities and hardware monitoring tools..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  jq \
  sysstat \
  lm-sensors \
  net-tools \
  python3 \
  python3-pip \
  python3-venv \
  ufw

# 3. Detect hardware thermal sensors (if running on bare-metal or supported hypervisor)
echo "--> Probing thermal sensors..."
sudo sensors-detect --auto || true

# 4. Set up official Docker repository
echo "--> Configuring Docker official repository..."
sudo install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
fi

echo \
  "deb [arch=\"$(dpkg --print-architecture)\" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  \"$(. /etc/os-release && echo \"$VERSION_CODENAME\")\" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y

# 5. Install Docker Engine, CLI, Containerd and Docker Compose Plugin
echo "--> Installing Docker and Docker Compose plugin..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# 6. Enable and start Docker service
echo "--> Enabling and starting Docker daemon..."
sudo systemctl enable --now docker

# 7. Add current user to docker group (avoids needing sudo for docker commands)
CURRENT_USER="${SUDO_USER:-$(whoami)}"
echo "--> Adding user '${CURRENT_USER}' to docker group..."
sudo usermod -aG docker "${CURRENT_USER}"

# 8. Create application deployment directory
DEPLOY_DIR="/home/${CURRENT_USER}/opstracker"
echo "--> Creating deployment directory at ${DEPLOY_DIR}..."
mkdir -p "${DEPLOY_DIR}"
chown -R "${CURRENT_USER}:${CURRENT_USER}" "${DEPLOY_DIR}"

echo "=========================================================="
echo " EC2 Provisioning completed successfully!"
echo " Docker version: $(docker --version)"
echo " Docker Compose version: $(docker compose version)"
echo " Deployment Directory: ${DEPLOY_DIR}"
echo " NOTE: Log out and log back in (or run 'newgrp docker') to use docker without sudo."
echo "=========================================================="
