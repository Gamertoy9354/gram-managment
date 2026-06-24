FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chown -R nodeapp:nodejs /app
USER nodeapp
EXPOSE 3000
CMD ["npm", "start"]
