FROM python:3.12-slim

WORKDIR /app
COPY . /app

EXPOSE 1919
ENV PORT=1919
ENV HOST=0.0.0.0

CMD ["python", "server.py"]
