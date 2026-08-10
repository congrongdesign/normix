FROM node:24-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server.mjs ./
COPY scripts ./scripts
RUN mkdir -p data storage/uploads storage/thumbnails storage/previews storage/originals

EXPOSE 4000
CMD ["node", "server.mjs"]
