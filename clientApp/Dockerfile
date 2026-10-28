# Stage 1: Build the Vite SPA
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src

ARG VITE_MATRIX_URL=""
ARG VITE_LIVEKIT_URL=""
ARG VITE_TOKEN_SERVER_URL=""
ENV VITE_MATRIX_URL=${VITE_MATRIX_URL} \
    VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL} \
    VITE_TOKEN_SERVER_URL=${VITE_TOKEN_SERVER_URL}

RUN npm run build

# Stage 2: Serve static bundle via Nginx
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
