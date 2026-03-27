#!/bin/bash

# Know What I Meme - Interactive Setup Script

# Colors for better UI
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}   Know What I Meme - Setup Wizard     ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

# Prerequisite check
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Warning: 'node' not found. Please install Node.js to run this project.${NC}"
fi
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}Warning: 'npm' not found. Please install npm to run this project.${NC}"
fi
echo "Done."
echo ""

# Configuration gathering
echo -e "${BLUE}--- Configuration ---${NC}"

# Klipy API Key
echo -e "This game uses the Klipy API for GIF searching."
read -p "Enter your Klipy API Key: " klipy_key
while [ -z "$klipy_key" ]; do
    read -p "API Key cannot be empty. Please enter your Klipy API Key: " klipy_key
done

# Port
read -p "Enter the backend port [default: 3002]: " port
port=${port:-3002}

# Generate .env file
echo ""
echo -e "${YELLOW}Generating .env file...${NC}"
cat > .env << EOF
KLIPY_API_KEY=$klipy_key
PORT=$port
EOF

echo -e "${GREEN}Configuration saved to .env!${NC}"
echo ""

# Installation
read -p "Would you like to install dependencies now? (y/n): " install_choice
if [[ "$install_choice" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}Dependencies installed successfully!${NC}"
fi

echo ""
echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}   Setup Complete!                     ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""
echo -e "To start the game:"
echo -e "1. Start the server:  ${BLUE}npm run dev:server${NC}"
echo -e "2. Start the frontend: ${BLUE}npm run dev${NC}"
echo ""
