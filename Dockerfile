# Use official Node.js image
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production \
    && npm cache clean --force

COPY . .
EXPOSE 8080
CMD ["npm", "run", "start"]
