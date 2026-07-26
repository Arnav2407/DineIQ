FROM node:18-alpine

WORKDIR /app

# Copy manifests
COPY package.json package-lock.json* ./

# Install packages
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dependencies
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "dist/index.js"]
