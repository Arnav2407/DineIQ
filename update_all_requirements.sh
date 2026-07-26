#!/bin/bash

# Common requirements for all Python services
COMMON_REQS='fastapi==0.104.1
uvicorn[standard]==0.24.0
psycopg2-binary==2.9.9
pydantic==2.5.0
pydantic[email]==2.5.0
email-validator==2.1.0
PyJWT==2.8.0
python-dotenv==1.0.0
httpx==0.25.2
sqlalchemy==2.0.23'

# Services that need Redis (reservation only)
RESERVATION_REQS="$COMMON_REQS
redis==5.0.0"

# Update each service
for service in inventory sales feedback; do
    echo "Updating ./services/$service/requirements.txt"
    echo "$COMMON_REQS" > "./services/$service/requirements.txt"
done

# Update reservation with Redis
echo "Updating ./services/reservation/requirements.txt"
echo "$RESERVATION_REQS" > "./services/reservation/requirements.txt"

echo "All requirements files updated!"
