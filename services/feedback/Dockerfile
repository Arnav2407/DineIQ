FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY main.py .

ENV PORT=3007
EXPOSE 3007

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3007"]
