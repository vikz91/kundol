# Disposable development image. No Docker socket or host filesystem mount is required.
FROM oven/bun:1

WORKDIR /opt/kundol
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY src ./src
COPY scripts/seed-demo-workspace.ts scripts/seed-docker-sandbox.ts scripts/fake-docker-cli.ts scripts/fake-startup-runner.ts scripts/docker-kundol.ts ./scripts/
COPY docker/kundol docker/docker docker/demo-entrypoint /usr/local/bin/
RUN chmod 755 /usr/local/bin/kundol /usr/local/bin/docker /usr/local/bin/demo-entrypoint \
    && mkdir -p /sandbox \
    && chown -R bun:bun /sandbox /opt/kundol

ENV HOME=/sandbox/home
ENV TMPDIR=/sandbox/tmp
USER bun
RUN bun scripts/seed-docker-sandbox.ts /sandbox

WORKDIR /sandbox
ENTRYPOINT ["/usr/local/bin/demo-entrypoint"]
