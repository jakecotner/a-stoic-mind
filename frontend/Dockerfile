# Next.js standalone image (Railway service: frontend).
# API_URL must be set at BUILD time — next.config serializes the /api rewrite
# destination into the build. On Railway, set API_URL on this service (e.g.
# http://backend.railway.internal:8000) and it arrives here as a build arg.
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV API_URL=$API_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=build /build/.next/standalone ./
COPY --from=build /build/.next/static ./.next/static
COPY --from=build /build/public ./public
EXPOSE 3000
# PORT is injected by Railway; server.js honors PORT/HOSTNAME.
CMD ["node", "server.js"]
