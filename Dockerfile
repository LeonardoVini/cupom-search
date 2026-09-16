# Node 22 roda TypeScript direto: sem etapa de build, sem dependência em produção.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000

# Só o que o servidor precisa em runtime.
COPY package.json ./
COPY src ./src
COPY data/coupons.seed.json ./data/coupons.seed.json

# O banco JSON fica em volume para sobreviver ao redeploy.
ENV COUPON_DB_PATH=/data/db.json
VOLUME ["/data"]

RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "src/api/server.ts"]
