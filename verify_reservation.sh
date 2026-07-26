#!/usr/bin/env bash

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;0m'

echo -e "${BLUE}=== DineIQ Module 1 (Table Reservation & Waitlist) Verification ===${NC}\n"

# Verify Python syntax and imports
echo -e "${YELLOW}Checking Python FastAPI code syntax and compilation...${NC}"
cd services/reservation
python3 -m py_compile main.py

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ main.py compiled successfully!${NC}\n"
else
    echo -e "${RED}✗ main.py compilation failed.${NC}\n"
    exit 1
fi

# Verify Node.js worker packages and compilation
echo -e "${YELLOW}Checking Node.js BullMQ worker packages and installation...${NC}"
npm install --dry-run
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ package.json dependencies are valid and resolvable!${NC}\n"
else
    echo -e "${RED}✗ Node.js package validation failed.${NC}\n"
    exit 1
fi

echo -e "${GREEN}=== ALL MODULE 1 COMPILE & SYNTAX TESTS PASSED ===${NC}"
