FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]


# ─────────────────────────────────────────────
# NOTES — Milestone 1
# ─────────────────────────────────────────────
# This is the "recipe" for building ONLY the api service's image.
# Postgres and RabbitMQ don't need a Dockerfile here because they use
# pre-built images from Docker Hub (postgres:16-alpine,
# rabbitmq:3-management-alpine) — we only write a Dockerfile for code
# that's actually ours.
#
# COPY . . copies code into the image ONCE, at build time. That's why
# docker-compose.yml also mounts ./api:/app as a volume — otherwise,
# every code edit would need a full rebuild to show up.

