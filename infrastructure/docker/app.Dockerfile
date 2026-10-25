FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
USER node
EXPOSE 3000
CMD ["node","dist/apps/server/src/main.js"]
