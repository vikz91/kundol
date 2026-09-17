# The test client contains fixture code, not a host bind mount or socket.
FROM oven/bun:1

RUN apt-get update && apt-get install -y --no-install-recommends docker.io busybox-static tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/kundol
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY registry ./registry
COPY tests/docker-acceptance ./tests/docker-acceptance

RUN mkdir -p /sandbox/home /sandbox/tmp
ENV HOME=/sandbox/home
ENV TMPDIR=/sandbox/tmp
