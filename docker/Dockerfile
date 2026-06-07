FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    xvfb \
    x11-utils \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    wget \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash chrome && \
    mkdir -p /home/chrome/.config/chromium && \
    chown -R chrome:chrome /home/chrome

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9222

ENV DISPLAY=:99
ENV CHROME_BIN=/usr/bin/chromium

USER chrome
WORKDIR /home/chrome

ENTRYPOINT ["/entrypoint.sh"]
