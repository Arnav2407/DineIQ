FROM node:18-alpine

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for compilation)
RUN npm install

# Copy configuration files and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Remove development dependencies to optimize production image size
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/index.js"]
