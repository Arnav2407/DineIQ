#!/usr/bin/env bash

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;0m'

echo -e "${BLUE}=== DineIQ Module 5 (Customer Feedback Aggregator) Verification ===${NC}\n"

# Verify Python syntax and imports
echo -e "${YELLOW}Checking Python FastAPI code syntax and compilation...${NC}"
cd services/feedback
python3 -m py_compile main.py

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ main.py compiled successfully!${NC}\n"
else
    echo -e "${RED}✗ main.py compilation failed.${NC}\n"
    exit 1
fi

echo -e "${GREEN}=== ALL MODULE 5 COMPILE & SYNTAX TESTS PASSED ===${NC}"
