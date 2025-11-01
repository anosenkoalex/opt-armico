FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY postcss.config.cjs tailwind.config.cjs ./
COPY index.html ./
COPY src ./src

RUN pnpm install --frozen-lockfile false

CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]
