#!/bin/sh
set -e

npx prisma migrate deploy --schema ./prisma

if [ "$NODE_ENV" = "production" ]; then
  exec node dist/index.js
fi

npx prisma generate --schema ./prisma
exec npm run dev
