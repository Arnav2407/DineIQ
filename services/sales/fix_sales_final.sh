#!/bin/bash

echo "Fixing sales service FastAPI annotations..."

# Backup
cp ./services/sales/main.py ./services/sales/main.py.bak

# Ensure date is imported
if ! grep -q "^from datetime import date" ./services/sales/main.py; then
    sed -i 's/^from datetime import datetime$/from datetime import datetime, date/' ./services/sales/main.py
fi

# Replace all datetime.date with date in function definitions
sed -i 's/def get_sales_trends(\(.*\)datetime\.date/def get_sales_trends(\1date/g' ./services/sales/main.py

# Also fix any other datetime.date occurrences
sed -i 's/: datetime\.date/: date/g' ./services/sales/main.py

# Rebuild just sales service
sudo docker compose up --build sales-service
