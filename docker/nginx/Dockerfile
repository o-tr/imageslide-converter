# Build the app image first, then pass its tag as --build-arg APP_IMAGE=...
ARG APP_IMAGE=imageslide-converter:latest
FROM ${APP_IMAGE} AS app
FROM nginx:1.31-alpine
COPY --from=app /app/.output/public/ /usr/share/nginx/html/
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
