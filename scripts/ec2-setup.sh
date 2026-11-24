#!/usr/bin/env bash
# ==============================================================================
# OpsTracker — AWS EC2 Provisioning Script (Ubuntu)
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting OpsTracker EC2 Provisioning"
echo "=========================================================="

echo "--> Updating package repository..."
sudo apt-get update -y

echo "--> Installing Docker and monitoring utilities..."
# Install docker.io and docker-compose-v2 directly (fast, resilient, avoids build tools)
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing \
  ca-certificates \
  curl \
  gnupg \
  git \
  jq \
  lm-sensors \
  net-tools \
  docker.io \
  docker-compose-v2

echo "--> Enabling and starting Docker daemon..."
sudo systemctl enable --now docker

CURRENT_USER="${SUDO_USER:-$(whoami)}"
echo "--> Adding user '${CURRENT_USER}' to docker group..."
sudo usermod -aG docker "${CURRENT_USER}"

echo "=========================================================="
echo " EC2 Provisioning completed successfully!"
echo " Docker version: $(docker --version)"
echo " Docker Compose version: $(docker compose version)"
echo "=========================================================="
