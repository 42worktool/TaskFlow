#!/bin/sh
set -e

npx prisma generate --schema ./prisma
npx prisma migrate deploy --schema ./prisma

exec npm run dev
