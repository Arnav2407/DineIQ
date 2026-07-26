#!/bin/bash

echo "Fixing sales service - datetime.date issue"

# Create backup
cp ./services/sales/main.py ./services/sales/main.py.bak

# Fix the import statement - add 'date' to datetime import
sed -i 's/^from datetime import datetime$/from datetime import datetime, date/' ./services/sales/main.py

# Replace all 'datetime.date' with just 'date' in the file
sed -i 's/datetime\.date/date/g' ./services/sales/main.py

# Find the get_sales_trends function and add response_model=None to its decorator
# This handles the case where the return type annotation might still be problematic
sed -i '/def get_sales_trends(/ { s/^@app\.get(/@app.get(response_model=None, /; }' ./services/sales/main.py

echo "Fixes applied. Rebuilding sales-service..."
sudo docker compose up --build sales-service
