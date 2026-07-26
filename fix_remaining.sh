#!/bin/bash

# Fix feedback service
echo "Updating feedback requirements..."
cat > ./services/feedback/requirements.txt << 'END'
fastapi==0.104.1
uvicorn[standard]==0.24.0
psycopg2-binary==2.9.9
pydantic==2.5.0
pydantic[email]==2.5.0
email-validator==2.1.0
PyJWT==2.8.0
python-dotenv==1.0.0
httpx==0.25.2
sqlalchemy==2.0.23
apscheduler==3.10.4
END

# Fix sales service (downgrade to Pydantic v1 compatible)
echo "Updating sales requirements..."
cat > ./services/sales/requirements.txt << 'END'
fastapi==0.100.1
uvicorn[standard]==0.23.2
psycopg2-binary==2.9.9
pydantic==1.10.13
email-validator==2.1.0
PyJWT==2.8.0
python-dotenv==1.0.0
httpx==0.25.2
sqlalchemy==2.0.23
END

echo "Requirements updated! Rebuilding services..."
sudo docker compose up --build feedback-service sales-service
