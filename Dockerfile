# Stage 1: Build Angular app
FROM node:latest AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --network-timeout=100000 --retry=5
COPY . .
RUN npm run build --configuration=production

# Stage 2: Serve with Node.js for SSR
FROM node:latest
WORKDIR /app
COPY --from=build /app/dist/frontend-counter /app/dist/frontend-counter
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 81
ENV PORT=81
CMD ["node", "dist/frontend-counter/server/server.mjs"]
