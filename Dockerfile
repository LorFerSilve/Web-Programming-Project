FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --chown=node:node server.js ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/

# Nieuwe Docker-volumes nemen deze beschrijfbare map over.
RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
CMD ["node", "server.js"]
