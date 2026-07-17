FROM node:24-alpine AS workspace

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/buyer-web/package.json apps/buyer-web/package.json
COPY apps/supplier-web/package.json apps/supplier-web/package.json
COPY apps/landing-web/package.json apps/landing-web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:4012/api
ARG NEXT_PUBLIC_BUYER_APP_URL=http://127.0.0.1:3001
ARG NEXT_PUBLIC_SUPPLIER_APP_URL=http://127.0.0.1:3002
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_APPLE_CLIENT_ID=
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_BUYER_APP_URL=$NEXT_PUBLIC_BUYER_APP_URL \
    NEXT_PUBLIC_SUPPLIER_APP_URL=$NEXT_PUBLIC_SUPPLIER_APP_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_APPLE_CLIENT_ID=$NEXT_PUBLIC_APPLE_CLIENT_ID \
    NEXT_PUBLIC_APPLE_REDIRECT_URI=$NEXT_PUBLIC_APPLE_REDIRECT_URI
RUN pnpm db:generate && pnpm build

FROM workspace AS api
EXPOSE 4000
CMD ["pnpm", "--filter", "@marketplace/api", "start"]

FROM workspace AS admin-web
EXPOSE 3000
CMD ["pnpm", "--filter", "@marketplace/admin-web", "start"]

FROM workspace AS buyer-web
EXPOSE 3001
CMD ["pnpm", "--filter", "@marketplace/buyer-web", "start"]

FROM workspace AS supplier-web
EXPOSE 3002
CMD ["pnpm", "--filter", "@marketplace/supplier-web", "start"]

FROM workspace AS landing-web
EXPOSE 3003
CMD ["pnpm", "--filter", "@marketplace/landing-web", "start"]
