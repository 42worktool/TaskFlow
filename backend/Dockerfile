FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["npx", "ts-node-dev", "--respawn", "--transpile-only", "index.ts"]
