FROM node:20-slim AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=6144
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm test && npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
