FROM node:20-slim

# Install Chromium and necessary fonts/dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the rest of your application code
COPY . .

# Set environment variable for Puppeteer to find Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose the port your app runs on
EXPOSE 3000

# Command to start your app
CMD ["node", "server.js"]