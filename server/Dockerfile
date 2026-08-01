FROM node:24-alpine

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server .
COPY data /app/data

EXPOSE 3001

CMD ["npm", "run", "dev"]
