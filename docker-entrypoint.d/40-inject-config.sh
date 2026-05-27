#!/bin/sh
# Generates /usr/share/nginx/html/config.local.js from $YOUTUBE_API_KEY at
# container startup. Runs before nginx boots via the official image's
# /docker-entrypoint.d/ hook. The key never enters the image layers.
set -eu

KEY="${YOUTUBE_API_KEY:-}"
# Escape backslashes and double-quotes so an unusual key can't break the JS.
ESC=$(printf '%s' "$KEY" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/config.local.js <<EOF
window.WWOB_CONFIG = { youtubeApiKey: "${ESC}" };
EOF

if [ -z "$KEY" ]; then
    echo "wwob: YOUTUBE_API_KEY not set — liveness will use activeMonths fallback only" >&2
fi
