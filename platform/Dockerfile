# The payments server, for Cloud Run (or anything else that runs a container).
#
# Deliberately not a multi-stage build: there is nothing to compile here, and
# a second stage would only add a way for the two to disagree.

FROM node:22-slim

# Tini, because Node as PID 1 does not reap children or forward SIGTERM, and
# Cloud Run sends SIGTERM to stop an instance. Without it, shutdown is a kill
# after the grace period, mid-request.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a change to the server code does not re-resolve them.
# `npm ci` would be better and needs a lockfile this repo does not have; when
# one is added, change this line with it.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY *.mjs ./

# Cloud Run sets PORT and the server reads it. This is only the default for
# somewhere that does not.
ENV PORT=8080
EXPOSE 8080

# No service-account.json is copied in, and none should be: on Cloud Run the
# runtime service account is the credential, and a private key baked into an
# image cannot be revoked by deleting a file.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]
