# iC2 Clients App

Frontend rebuild for the iC2 client management platform, replacing the existing Bubble.io frontend with a custom Next.js application hosted on Azure App Service.

## Current focus

The initial build is centered on the core v1 workflows:

- create a new client
- search and open an existing client
- update client details
- capture file notes and document records
- generate basic client letters
- administer users, licensees, and practices

## Stack

- Next.js
- React
- TypeScript
- ESLint

## Getting started

1. Copy `.env.example` to `.env.local`
2. Set `NEXT_PUBLIC_API_BASE_URL`
3. Install dependencies with `npm install`
4. Run the development server with `npm run dev`

## Local testing options

- Real API mode: set `NEXT_PUBLIC_API_BASE_URL` to your backend and leave `NEXT_PUBLIC_ENABLE_MOCK_AUTH=false`
- Mock login mode: set `NEXT_PUBLIC_ENABLE_MOCK_AUTH=true` to bypass the live login API locally and enter the app with any email and password

## Third-party integrations

Server-side integration proxies can be configured with private env vars so secrets do not reach the browser.

Current integration env vars:

- `REX_TOKEN_API_BASE_URL`
- `REX_TOKEN_FUNCTION_AUTH_URL`
- `REX_TOKEN_AUTHORIZATION_URL`
- `REX_TOKEN_BEARER_TOKEN`
- `REX_TOKEN_SUBSCRIPTION_KEY`
- `REX_TOKEN_CLIENT_ID`
- `REX_TOKEN_CLIENT_SECRET`
- `REX_TOKEN_REDIRECT_URI`
- `REX_TOKEN_SCOPE`

Current proxy route:

- `GET /api/integrations/rex-token/user`
- `POST /api/integrations/rex-token/token`
- `POST /api/integrations/rex-token/refresh`
- `GET /api/integrations/rex-token/connect`
- `GET /api/integrations/rex-token/callback`
- `POST /api/integrations/rex-token/disconnect`

## Structure

- `src/app`: route-based pages
- `src/components`: reusable UI building blocks
- `src/lib/api`: API client and domain access helpers
- `src/lib`: shared navigation and types
