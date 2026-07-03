FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; psycopg2-binary ships wheels.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
