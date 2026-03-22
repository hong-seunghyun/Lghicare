FROM node:20-slim

WORKDIR /app

# Prevent Next.js build OOM
ENV NODE_OPTIONS=--max-old-space-size=6144
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

EXPOSE 8080
ENV PORT=8080

CMD ["npm", "run", "start"]
