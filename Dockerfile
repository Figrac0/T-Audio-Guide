# Stage 1 — build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# These build-args let the backend developer override API URLs at build time.
# Pass them via: docker build --build-arg VITE_API_URL=https://... .
ARG VITE_API_URL=https://tguide.enzolu.ru/api
ARG VITE_MAP_PROVIDER=osm
ARG VITE_USE_MOCK_API=false

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAP_PROVIDER=$VITE_MAP_PROVIDER
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API

RUN npm run build

# Stage 2 — serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
