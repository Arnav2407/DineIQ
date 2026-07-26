#!/usr/bin/env bash

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;0m'

echo -e "${BLUE}=== DineIQ Frontend React PWA Verification ===${NC}\n"

# Verify React/Vite TSX compiling
echo -e "${YELLOW}Installing node dependencies in frontend...${NC}"
cd frontend
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed successfully!${NC}\n"
else
    echo -e "${RED}✗ Dependencies installation failed.${NC}\n"
    exit 1
fi

echo -e "${YELLOW}Building React/Vite application...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend built successfully under dist/!${NC}\n"
else
    echo -e "${RED}✗ Frontend build failed.${NC}\n"
    exit 1
fi

echo -e "${GREEN}=== ALL FRONTEND COMPILE & SYNTAX TESTS PASSED ===${NC}"
