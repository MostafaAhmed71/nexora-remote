FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:stable-alpine
COPY --from=build /app/dist/web /usr/share/nginx/html
COPY infrastructure/docker/nginx.conf /etc/nginx/nginx.conf
