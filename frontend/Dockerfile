FROM node:20-slim AS development
WORKDIR /app
# 개발 단계는 Vite dev server와 빌드 도구를 모두 포함한다.
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM development AS build
# Vue/TypeScript를 검증하면서 브라우저용 정적 파일을 생성한다.
RUN npm run build

FROM nginx:stable-alpine AS production
# 운영 이미지는 Node 런타임 없이 생성된 dist만 nginx로 제공한다.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5173
