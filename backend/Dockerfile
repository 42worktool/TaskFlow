FROM node:20-slim AS base
WORKDIR /app
# Prisma의 PostgreSQL TLS 연결과 인증서 처리를 위해 최소 openssl 패키지만 설치한다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS development
# 개발 단계에는 테스트·TypeScript·watch 도구를 포함한 전체 의존성이 필요하다.
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate --schema ./prisma
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]

FROM development AS build
# production에는 TypeScript 원본 대신 컴파일된 dist만 넘긴다.
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
# 빌드 도구를 제외한 런타임 의존성과 Prisma schema/client만 새 단계에 구성한다.
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev \
    && npx prisma generate --schema ./prisma
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
