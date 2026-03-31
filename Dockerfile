FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libu2f-udev \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
COPY x-outreach/requirements.txt /tmp/x-outreach-requirements.txt

RUN pip install -r /tmp/requirements.txt && \
    pip install -r /tmp/x-outreach-requirements.txt

COPY . /app

RUN mkdir -p /app/projects

COPY docker/entrypoint.sh /usr/local/bin/outreach-entrypoint
RUN chmod +x /usr/local/bin/outreach-entrypoint

ENTRYPOINT ["/usr/local/bin/outreach-entrypoint"]
CMD ["sleep", "infinity"]
