FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY src/ ./src/

EXPOSE 3001

CMD ["node", "src/index.js"]
