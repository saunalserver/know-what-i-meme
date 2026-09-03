#!/bin/bash
set -euo pipefail

# Know What I Meme - Interactive Setup

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

cd "$(dirname "$0")"

echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}   Know What I Meme - Setup Wizard     ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

echo -e "${YELLOW}Checking prerequisites...${NC}"
missing=0
if ! command -v node &> /dev/null; then
    echo -e "${RED}Missing: node. Install Node.js 20 or newer.${NC}"; missing=1
else
    node_major=$(node -p "process.versions.node.split('.')[0]")
    if [ "$node_major" -lt 20 ]; then
        echo -e "${YELLOW}Warning: Node $(node -v) found; this project needs 20 or newer.${NC}"
    else
        echo -e "Node $(node -v) ${GREEN}OK${NC}"
    fi
fi
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Missing: npm.${NC}"; missing=1
else
    echo -e "npm $(npm -v) ${GREEN}OK${NC}"
fi
[ "$missing" -eq 1 ] && { echo -e "${RED}Install the missing tools and run this again.${NC}"; exit 1; }
echo ""

# --- .env -------------------------------------------------------------------
if [ -f .env ]; then
    echo -e "${YELLOW}A .env already exists.${NC}"
    read -r -p "Overwrite it? (y/N): " overwrite
    if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Keeping your existing .env.${NC}"
        skip_env=1
    fi
fi

if [ "${skip_env:-0}" -ne 1 ]; then
    echo -e "${BLUE}--- Configuration ---${NC}"
    echo -e "GIF search uses the Klipy API (free key at https://klipy.com)."
    read -r -p "Klipy API key: " klipy_key
    while [ -z "$klipy_key" ]; do
        read -r -p "The key cannot be empty. Klipy API key: " klipy_key
    done

    read -r -p "Backend port [3002]: " port
    port=${port:-3002}

    echo ""
    echo -e "Players join by scanning a QR code. If this server sits behind a public"
    echo -e "address (e.g. https://example.com/kwim), enter it so the QR points there."
    echo -e "Leave blank for LAN play. ${YELLOW}Note: phone cameras need HTTPS.${NC}"
    read -r -p "Public URL [none]: " public_url

    [ -f .env ] && cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
    cat > .env << ENVFILE
KLIPY_API_KEY=$klipy_key
PORT=$port
VITE_PUBLIC_URL=$public_url
ENVFILE
    chmod 600 .env
    echo -e "${GREEN}Configuration saved to .env${NC}"
fi
echo ""

# --- install ----------------------------------------------------------------
read -r -p "Install dependencies now? (Y/n): " install_choice
if [[ ! "${install_choice:-y}" =~ ^[Nn]$ ]]; then
    echo -e "${YELLOW}Installing...${NC}"
    npm install
    echo -e "${GREEN}Dependencies installed.${NC}"
fi

echo ""
echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}   Setup Complete!                     ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""
echo -e "Play locally:"
echo -e "  ${BLUE}npm run dev:all${NC}     server on :3002, client on :5173"
echo ""
echo -e "Or run the production build:"
echo -e "  ${BLUE}npm run build && npm start${NC}"
echo ""
echo -e "Before committing:  ${BLUE}npm run check${NC}  (lint + tests)"
echo ""
