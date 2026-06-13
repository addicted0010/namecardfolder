# CardVault Deployment & Configuration Guide

> [简体中文](./DEPLOY.md) | English

## Table of Contents

- [1. Development Setup (Local Mac)](#1-development-setup-local-mac)
- [2. Production Deployment (Vercel)](#2-production-deployment-vercel)
- [3. Environment Variables](#3-environment-variables)
- [4. FAQ](#4-faq)

---

## 1. Development Setup (Local Mac)

### 1.1 Requirements

- **Node.js** >= 18 (20+ recommended)
- **Docker Desktop** (to run PostgreSQL)
- **Git**

### 1.2 Clone the project

```bash
git clone <repository-url>
cd namecardfolder
```

### 1.3 Install dependencies

```bash
npm install
```

### 1.4 Configure environment variables

Copy the environment template:

```bash
cp .env.example .env.local
```

Edit `.env.local` and configure at least the following:

```bash
# Database connection (defaults work once Docker is up)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/namecard

# JWT secret (replace with a random string, at least 32 chars)
JWT_SECRET=replace-with-your-random-secret

# LLM provider: alibaba or claude
LLM_PROVIDER=claude

# If using Claude, set the API key
CLAUDE_API_KEY=sk-ant-xxxxx

# If using Alibaba Bailian, set the API key instead
# LLM_PROVIDER=alibaba
# ALIBABA_API_KEY=sk-xxxxx
```

> Quick way to generate a random secret: `openssl rand -base64 32`

### 1.5 Start the PostgreSQL database

```bash
docker compose up -d
```

Verify the database is running:

```bash
docker ps
# Confirm the namecard-postgres container is running
```

> The database is mapped from host port `5433` → container `5432` to avoid conflicts with any existing local PostgreSQL.

### 1.6 Run database migrations

```bash
npm run db:migrate
```

This creates all tables based on the Prisma schema.

### 1.7 Seed initial data

```bash
npm run db:seed
```

On success it creates a default admin account:
- Username: `admin`
- Password: `admin123`

> Customize the seed user via the `SEED_USERNAME`, `SEED_PASSWORD`, and `SEED_DISPLAY_NAME` environment variables. **Always change the default password before deploying to production.**

### 1.8 Start the dev server

```bash
npm run dev
```

Open `http://localhost:3000` (Next.js will pick another port automatically if it is taken).

### 1.9 Common development commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (validates type checking) |
| `npm run lint` | ESLint check |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Run the seed script |
| `npm run db:studio` | Launch Prisma Studio (database GUI) |
| `npm run db:reset` | Reset the database (drops all data and re-migrates) |
| `docker compose down` | Stop the PostgreSQL container |
| `docker compose up -d` | Start the PostgreSQL container |

---

## 2. Production Deployment (Vercel)

### 2.1 Push code to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2.2 Create a project on Vercel

1. Sign in to [Vercel](https://vercel.com)
2. Click **"Add New..." → "Project"**
3. Select your GitHub repository
4. Choose the **Next.js** framework preset
5. After deployment, go to **Settings → Functions → Function Region** and select **Singapore (sin1)**
   > Co-locating with the Neon database and Alibaba OSS region significantly reduces API latency

### 2.3 Configure Vercel Postgres (Neon)

1. In the Vercel project dashboard, open the **Storage** tab
2. Click **"Create Database"** and choose **Neon** (recommended — standard PostgreSQL connection string, no code changes)
3. Once created, Vercel automatically injects `POSTGRES_URL` and related variables
4. Copy the Neon connection string, which looks like:
   ```
   postgresql://user:password@host:port/dbname?sslmode=require
   ```

### 2.4 Configure file storage (Alibaba Cloud OSS, recommended)

Follow the [Alibaba Cloud OSS setup steps](#alibaba-cloud-oss-setup-steps) below to create the OSS bucket, RAM user, and role, then configure the related variables in Vercel.

> **Alternative**: To use Vercel Blob instead, create a Blob Store under the **Storage** tab and set `STORAGE_PROVIDER` to `vercel`. Vercel will inject `BLOB_READ_WRITE_TOKEN` automatically.

### 2.5 Configure environment variables

In **Settings → Environment Variables** of the Vercel project, add:

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Vercel Postgres connection string | Database connection |
| `JWT_SECRET` | Random long string (≥ 32 chars) | JWT signing secret (**required** in production; auth fails closed if missing) |
| `ADMIN_EMAILS` | Comma-separated admin emails | Signing in with a matching Google account grants admin rights (may be left empty) |
| `LLM_PROVIDER` | `claude` or `alibaba` | LLM provider |
| `CLAUDE_BASE_URL` | `https://api.anthropic.com` (or a proxy) | Claude API endpoint |
| `CLAUDE_API_KEY` | Your Claude API key | Claude credential |
| `CLAUDE_MODEL` | `claude-sonnet-4.6` | Claude model |
| `ALIBABA_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Bailian API endpoint |
| `ALIBABA_API_KEY` | Your Bailian API key | Bailian credential |
| `ALIBABA_MODEL` | `qwen3.7-plus` | Bailian model |
| `STORAGE_PROVIDER` | `aliyun-oss` | Use Alibaba OSS storage (recommended) |
| `ALIYUN_OSS_ACCESS_KEY_ID` | RAM user AccessKey ID | Alibaba RAM credential |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | RAM user AccessKey Secret | Alibaba RAM credential |
| `ALIYUN_OSS_ROLE_ARN` | `acs:ram::<ID>:role/xxx` | STS role ARN |
| `ALIYUN_OSS_REGION` | `oss-ap-southeast-1` | OSS region |
| `ALIYUN_OSS_BUCKET` | Your bucket name | OSS bucket |
| `ALIYUN_OSS_STS_ENDPOINT` | `https://sts.aliyuncs.com` | STS endpoint (optional) |
| `CRON_SECRET` | Random string | Protects the cron endpoint (strongly recommended) |
| `GOOGLE_CLIENT_ID` | OAuth client ID | Google OAuth (optional) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret (mark as Sensitive) | Google OAuth (optional) |
| `GOOGLE_REDIRECT_URI` | `https://yourdomain.com/api/auth/google/callback` | Google OAuth (optional) |
| `CREDIT_TIME_ZONE` | `Asia/Tokyo` | Daily credit reset time zone (optional, defaults to `Asia/Tokyo`) |
| `NEXT_PUBLIC_APP_URL` | Your production domain (e.g. `https://cardvault.example.com`) | Public app URL |

> **Tip**: Vercel Postgres injects database variables automatically. OSS, LLM, and Google OAuth variables must be added manually.

### 2.6 Run database migrations

Run the migration against the remote database from your local machine (point `DATABASE_URL` at the Neon production database):

```bash
# Option 1: set the connection string inline (copied from the Vercel/Neon console)
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npx prisma migrate deploy
```

```bash
# Option 2: pull production env vars, then source them (Sensitive vars must be filled in manually)
npx vercel env pull .env.production --environment=production
# Edit .env.production and fill in DATABASE_URL (Sensitive vars are not pulled automatically)
source .env.production && npx prisma migrate deploy
```

> **Note**: Both options run locally; Prisma connects to the remote Neon database via `DATABASE_URL` and applies migrations.

### 2.7 Create the initial user

After migrating, create an admin account:

```bash
DATABASE_URL="postgresql://..." SEED_USERNAME=admin SEED_PASSWORD=your-password npm run db:seed
```

### 2.8 Deploy

1. Back in the Vercel dashboard, click **"Deploy"**
2. Wait for the build to finish
3. Visit the assigned domain and sign in with the admin account you created

> Subsequent pushes to GitHub trigger automatic redeployment on Vercel.

---

## 3. Environment Variables

### Database

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5433/namecard` |

### Auth

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret, at least 32 chars (required in production; auth fails closed if missing) | random string |
| `ADMIN_EMAILS` | Admin email list (comma-separated, case-insensitive). On Google sign-in, a verified email matching the list is automatically granted admin rights (e.g. viewing LLM logs); the seed account's email is also taken from the first entry | `you@gmail.com,teammate@gmail.com` |

> **Admin designation**: No email is hardcoded in the code or migrations. Admins are determined entirely by the `ADMIN_EMAILS` environment variable. Leave it empty for no email-based admins (the seed account remains an admin).

### LLM

| Variable | Description | Allowed values |
|----------|-------------|----------------|
| `LLM_PROVIDER` | Choose the LLM provider | `claude` / `alibaba` |
| `CLAUDE_BASE_URL` | Claude API endpoint (proxy-configurable) | `https://api.anthropic.com` |
| `CLAUDE_API_KEY` | Claude API key | `sk-ant-...` |
| `CLAUDE_MODEL` | Claude model name | `claude-sonnet-4.6` |
| `ALIBABA_BASE_URL` | Alibaba Bailian API endpoint (region-configurable) | see below |
| `ALIBABA_API_KEY` | Alibaba Bailian API key | `sk-...` |
| `ALIBABA_MODEL` | Bailian model name | `qwen3.7-plus` |

> **About thinking mode**: Card recognition is an OCR extraction task that does not need deep reasoning. All Bailian requests explicitly set `enable_thinking: false` — enabling thinking would significantly slow responses, so keep it off.

**Alibaba Bailian API endpoints:**

Replace `{WorkspaceId}` with your real Workspace ID in all region-specific URLs.

| Region | Endpoint (new) |
|--------|----------|
| Singapore | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` |
| US (Virginia) | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` |
| China (Beijing) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| China (Hong Kong) | `https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1` |
| Germany (Frankfurt) | `https://{WorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1` |

> **Important**: The old Singapore URL `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` is **being deprecated**. Migrate to the new URL shown above.

> **Important**: The international regions (Singapore, Virginia) and China mainland (Beijing) use **separate API Keys**. Obtain each key from the corresponding regional console.

> `ALIBABA_BASE_URL` and `CLAUDE_BASE_URL` are customizable, useful for configuring proxy servers or other regional endpoints.

### File Storage

| Variable | Description | Allowed values |
|----------|-------------|----------------|
| `STORAGE_PROVIDER` | Storage backend | `local` (dev) / `vercel` (Vercel Blob) / `aliyun-oss` (Alibaba OSS) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (vercel mode only) | injected by Vercel |
| `ALIYUN_OSS_ACCESS_KEY_ID` | Alibaba RAM user AccessKey ID | `LTAI5t...` |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | Alibaba RAM user AccessKey Secret | `xxxxx` |
| `ALIYUN_OSS_ROLE_ARN` | RAM role ARN (for STS AssumeRole) | `acs:ram::123456:role/oss-access` |
| `ALIYUN_OSS_REGION` | OSS bucket region | `oss-ap-southeast-1` |
| `ALIYUN_OSS_BUCKET` | OSS bucket name | `cardvault-images` |
| `ALIYUN_OSS_STS_ENDPOINT` | STS service endpoint (optional) | `https://sts.aliyuncs.com` |

> **Storage modes**:
> - `local`: development; images are stored in the local `public/uploads/` directory.
> - `vercel`: uses the Vercel Blob Store in private mode, accessed through a backend API proxy.
> - `aliyun-oss`: uses Alibaba OSS with STS temporary credentials. The image proxy API returns a 302 redirect to a signed OSS URL so the client downloads directly from OSS for better speed.

#### Alibaba Cloud OSS Setup Steps

##### 1. Create an OSS bucket

1. Sign in to the [Alibaba Cloud OSS Console](https://oss.console.aliyun.com/)
2. Create a bucket:
   - **Bucket name**: your choice (e.g. `cardvault-images`)
   - **Region**: pick one close to your users (e.g. `ap-southeast-1` Singapore)
   - **Storage class**: Standard
   - **ACL**: **Private**
   - **Server-side encryption**: OSS-managed encryption recommended
3. Record the bucket name and region (for `ALIYUN_OSS_BUCKET` and `ALIYUN_OSS_REGION`)

##### 2. Create a RAM user

1. Sign in to the [RAM Console](https://ram.console.aliyun.com/)
2. Create a user:
   - **Logon name**: `cardvault-sts` (for API calls only)
   - **Access mode**: enable **OpenAPI access**
3. Save the **AccessKey ID** and **AccessKey Secret**
4. Grant this user the `AliyunSTSAssumeRoleAccess` permission (allows calling STS AssumeRole)

##### 3. Create a RAM role

1. In the RAM Console → Roles → Create Role
2. Select the **Alibaba Cloud Account** type
3. Role name: `cardvault-oss-access`
4. In the trust policy, choose **Current Alibaba Cloud account** as the trusted account
5. After creating, attach a permission policy to the role:
   - RAM Console → **Policies** → **Create Policy**
   - Policy name: `cardvault-oss-readwrite`
   - Switch to **Script** mode and paste the JSON below:

**Custom policy** (least privilege):

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject"
      ],
      "Resource": [
        "acs:oss:*:*:cardvault-images/cards/*"
      ]
    }
  ]
}
```

> Replace `cardvault-images` with your bucket name.

6. After creating the policy, go back to the role → click `cardvault-oss-access` → **Permissions** tab → **Grant Permission** → search for `cardvault-oss-readwrite` → confirm
7. Copy the role ARN (at the top of the role detail page, format: `acs:ram::<account-id>:role/cardvault-oss-access`)

##### 4. Configure environment variables

Add the following in **Settings → Environment Variables** on Vercel:

| Variable | Value |
|----------|-------|
| `STORAGE_PROVIDER` | `aliyun-oss` |
| `ALIYUN_OSS_ACCESS_KEY_ID` | RAM user AccessKey ID |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | RAM user AccessKey Secret |
| `ALIYUN_OSS_ROLE_ARN` | RAM role ARN |
| `ALIYUN_OSS_REGION` | `oss-ap-southeast-1` (use your actual region) |
| `ALIYUN_OSS_BUCKET` | Your bucket name |
| `ALIYUN_OSS_STS_ENDPOINT` | `https://sts.aliyuncs.com` (international; use `https://sts.cn-hangzhou.aliyuncs.com` in China) |

##### 5. Migrate existing data (from Vercel Blob to OSS)

If you already have data in Vercel Blob, run the migration script:

```bash
# Preview first (no actual changes)
DATABASE_URL="..." BLOB_READ_WRITE_TOKEN="..." \
ALIYUN_OSS_ACCESS_KEY_ID="..." ALIYUN_OSS_ACCESS_KEY_SECRET="..." \
ALIYUN_OSS_ROLE_ARN="..." ALIYUN_OSS_REGION="..." ALIYUN_OSS_BUCKET="..." \
npx tsx scripts/migrate-blob-to-oss.ts --dry-run

# Run the migration once confirmed
DATABASE_URL="..." BLOB_READ_WRITE_TOKEN="..." \
ALIYUN_OSS_ACCESS_KEY_ID="..." ALIYUN_OSS_ACCESS_KEY_SECRET="..." \
ALIYUN_OSS_ROLE_ARN="..." ALIYUN_OSS_REGION="..." ALIYUN_OSS_BUCKET="..." \
npx tsx scripts/migrate-blob-to-oss.ts
```

> The script supports `--batch=N` to control concurrency (default 10). Already-migrated images are skipped automatically, so it is safe to re-run.

### App

| Variable | Description | Example |
|----------|-------------|---------|
| `CREDIT_TIME_ZONE` | Time zone for daily credit resets. Regular users get 100 credits per day; a front-only card costs 1 credit and a front/back card costs 2 credits. Admin accounts are unlimited | `Asia/Tokyo` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` / `https://yourdomain.com` |

---

## 4. FAQ

### Q: Port 5433 is already in use

If local port 5433 is taken, change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "5434:5432"   # change to another available port
```

And update `DATABASE_URL` in `.env.local` accordingly.

### Q: Prisma migration fails with "Can't reach database server"

1. Confirm the Docker container is running: `docker ps | grep namecard-postgres`
2. If not, run: `docker compose up -d`
3. Wait a few seconds and retry (PostgreSQL needs time to start)

### Q: Build fails with a Prisma Client error

Regenerate the Prisma Client:

```bash
npx prisma generate
```

### Q: How do I switch the LLM provider?

Edit `.env.local` (dev) or the Vercel environment variables (prod):

```bash
# Switch to Alibaba Bailian
LLM_PROVIDER=alibaba
ALIBABA_API_KEY=your-key

# Switch to Claude
LLM_PROVIDER=claude
CLAUDE_API_KEY=your-key
```

Restart the dev server or redeploy for changes to take effect.

### Q: How do I use a custom API proxy?

Set `BASE_URL` to your proxy in the environment variables:

```bash
# Use a self-hosted proxy
CLAUDE_BASE_URL=https://your-proxy.example.com
ALIBABA_BASE_URL=https://your-proxy.example.com/alibaba
```

### Q: How do I reset a forgotten password?

Reset via Prisma Studio or the command line:

```bash
npm run db:studio
```

In Prisma Studio, find the User table and edit the `passwordHash` field for the user. Alternatively, re-run the seed script to recreate the user (delete the old user first).
