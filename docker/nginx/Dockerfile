FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
ARG CACHE_BUST=unknown
RUN echo "Cache bust: $CACHE_BUST"
COPY frontend/ .
COPY VERSION /VERSION
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /var/www/frontend/dist
