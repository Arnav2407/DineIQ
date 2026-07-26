#!/usr/bin/env bash

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;0m'

echo -e "${BLUE}=== DineIQ Module 4 (Staff Scheduling & Attendance) Verification ===${NC}\n"

# Verify Node.js/TypeScript Express backend compilation
echo -e "${YELLOW}Compiling TypeScript code for Scheduling Service...${NC}"
cd services/scheduling
npm install
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ TypeScript backend compiled successfully!${NC}\n"
else
    echo -e "${RED}✗ TypeScript backend compilation failed.${NC}\n"
    exit 1
fi

echo -e "${GREEN}=== ALL MODULE 4 COMPILE & SYNTAX TESTS PASSED ===${NC}"
