# Backend (Express + TypeScript)

## Setup

```bash
npm install
```

Copy env file:

```bash
copy .env.example .env
```

## Run (dev)

```bash
npm run dev
```

Health check:

- `GET /health`

## Build & run (prod)

```bash
npm run build
npm start
```

## Vercel deploy

Vercel runs `npm run vercel-build`, which applies pending Prisma migrations then compiles TypeScript. Set `DATABASE_URL` in the Vercel project environment (Production and Preview as needed).

