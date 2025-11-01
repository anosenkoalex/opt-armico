FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile false \
  && pnpm prisma:gen

CMD ["pnpm", "run", "dev"]
