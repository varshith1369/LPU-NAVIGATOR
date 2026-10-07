FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY backend ./backend
COPY database ./database
COPY data ./data
COPY scripts ./scripts
USER node
EXPOSE 3001
CMD ["sh", "-c", "node scripts/setup-db.mjs && exec node backend/src/server.mjs"]
