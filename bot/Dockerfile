# Warcon Discord bot: Bun + SQLite. Mount a volume at /data so the leaderboard survives deploys.
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf ~/.bun/install/cache
COPY src ./src
EXPOSE 3000
CMD ["bun", "src/main.ts"]
