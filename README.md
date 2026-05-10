# Storytelly

App for managing internal worlds, characters, locations, and stories that will later drive AI-generated music videos.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (dark theme, magenta accent)
- Drizzle ORM + Postgres 16
- S3-compatible storage (MinIO locally → AWS S3 in prod)
- TanStack Query, react-hook-form, zod

## Getting started

1. **Bring up Postgres + MinIO** (requires Docker):

   ```bash
   docker compose up -d
   ```

   - Postgres: `localhost:5432` (user/pass/db: `storytelly`)
   - MinIO API: `localhost:9000`, console: `localhost:9001` (user `storytelly`, pass `storytelly-secret`)
   - The `storytelly` bucket is created automatically by the `minio-init` job.

2. **Copy env**:

   ```bash
   cp .env.example .env
   ```

3. **Install dependencies and run migrations**:

   ```bash
   pnpm install
   pnpm db:push        # apply schema
   ```

4. **Start the dev server**:

   ```bash
   pnpm dev
   ```

   Open <http://localhost:3000>.

## Useful scripts

- `pnpm db:generate` — generate a new migration from `src/db/schema.ts`
- `pnpm db:push` — apply schema directly to the DB (dev only)
- `pnpm db:migrate` — apply committed migrations (prod path)
- `pnpm db:studio` — Drizzle Studio
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint`

## Switching to AWS S3 later

The app talks to S3 via the AWS SDK; MinIO is only there to mimic S3 locally. To move to AWS, change these env vars and redeploy:

```env
S3_ENDPOINT=                     # leave empty for AWS
S3_FORCE_PATH_STYLE=false
S3_REGION=eu-central-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
```

No code changes required.
