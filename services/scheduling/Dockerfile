FROM node:18-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install packages
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3006

CMD ["node", "dist/index.js"]
