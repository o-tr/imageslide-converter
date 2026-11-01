#!/bin/sh
set -e
npx prisma generate >/dev/null
npx prisma migrate deploy
exec node .output/server/index.mjs
