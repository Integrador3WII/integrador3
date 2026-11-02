FROM --platform=$BUILDPLATFORM node:22-alpine AS build

WORKDIR /app

# Install workspace dependencies before copying the source for better layer caching.
COPY package.json package-lock.json ./
COPY apps/admin-web/package.json ./apps/admin-web/package.json
RUN npm ci

COPY . .

# Vite embeds these public configuration values into the browser bundle at build time.
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_PUBLISHABLE_KEY=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build:admin

FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist/ /usr/share/nginx/html/
EXPOSE 80

