# Build static assets (ไม่จำเป็นต้อง bake API key ใน bundle)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Node server: static + Anthropic proxy
FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
