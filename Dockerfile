FROM node:22-alpine

WORKDIR /app

# Booking times are entered as local wall-clock times ("9:00 AM") and turned
# into real moments using the server's timezone, which is also what KeyCafe
# access windows are built from. Containers default to UTC, which would send
# KeyCafe a 2:00 AM window for a 9:00 AM booking. Override with TZ in .env if
# the motor pool ever runs somewhere else (keep KEYCAFE_TIMEZONE the same).
ENV TZ=America/Phoenix

COPY package.json package-lock.json ./

# Runtime dependencies only. docker-compose.dev.yml builds with
# INSTALL_DEV=true to also get nodemon for local development.
ARG INSTALL_DEV=false
RUN if [ "$INSTALL_DEV" = "true" ]; then npm ci; else npm ci --omit=dev; fi \
  && npm cache clean --force

COPY --chown=node:node . .

ENV NODE_ENV=production
ENV PORT=8080

# Don't run the app as root inside the container.
USER node

EXPOSE 8080

CMD ["node", "app.js"]
