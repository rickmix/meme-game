FROM node:22-bookworm

# Install ffmpeg, Python, pip, and curl
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JavaScript runtime required by yt-dlp)
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:$PATH"

# Install yt-dlp with its EJS JavaScript challenge solver
RUN pip3 install --break-system-packages -U "yt-dlp[default]"

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]