FROM nginx:1.27-alpine

# Static assets — only the files the running app actually needs.
COPY index.html streams.json /usr/share/nginx/html/

# Server config. The official nginx image runs envsubst on files in
# /etc/nginx/templates/ at startup, so ${PORT} gets replaced with the
# value Railway injects at runtime.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Startup script writes config.local.js from $YOUTUBE_API_KEY before
# nginx boots. The key never lands in the image layers.
COPY docker-entrypoint.d/40-inject-config.sh /docker-entrypoint.d/40-inject-config.sh
RUN chmod +x /docker-entrypoint.d/40-inject-config.sh
