# CardVault

> [简体中文](./README.md) | English

An AI-powered business card management web app. Capture or upload cards for automatic recognition, search across multiple fields, and manage cards in bulk — optimized for both desktop and mobile.

---

## Features

- **Card upload**: Drag-and-drop file upload and camera capture (WebRTC on desktop, native camera on mobile)
- **Front & back**: Upload the card front (required) and back (optional)
- **AI recognition**: Uses an LLM to extract name, company, title, email, phone, address, website, department, fax, and more; supports Japanese furigana (ふりがな) readings
- **Multilingual UI**: Switch between 中文 / English / 日本語
- **Full-text search**: Fuzzy search across name, company, email, phone, and other fields; the search bar stays pinned to the top
- **Bulk delete**: Enter multi-select mode via the bottom-right FAB, then delete selected cards in one tap
- **LLM debug logs**: View / copy the raw LLM request and response on the card detail page (admin only)
- **Responsive design**: Works on phone, tablet, and desktop; switches between single- and multi-column layouts at the 480 px breakpoint

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Database ORM | Prisma + PostgreSQL |
| Auth | JWT (jose) + HttpOnly Cookie + Google OAuth 2.0 |
| i18n | next-intl (zh / en / ja) |
| LLM | Anthropic Claude or Alibaba Bailian (qwen), OpenAI-compatible API |
| File storage | Local disk (dev) / Alibaba Cloud OSS (prod, STS temp credentials) / Vercel Blob (alternative), accessed through an authenticated API proxy |

---

## Quick Start

> For full deployment and configuration, see [DEPLOY.en.md](./DEPLOY.en.md)

### Requirements

- Node.js ≥ 18 (20+ recommended)
- Docker Desktop (to run PostgreSQL locally)

### Steps

```bash
# 1. Clone the repo
git clone <repository-url>
cd namecardfolder

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in JWT_SECRET and your LLM API key

# 4. Start the database
docker compose up -d

# 5. Run migrations & seed the initial account
npm run db:migrate
npm run db:seed   # default account: admin / admin123

# 6. Start the dev server
npm run dev
```

Open `http://localhost:3000` and sign in with `admin / admin123`.

> **Security note**: `admin / admin123` is a default seed account intended for local development only. Change the password (or use `SEED_USERNAME` / `SEED_PASSWORD`) before deploying to production.

---

## Project Structure

```
src/
├── app/
│   ├── [locale]/          # Localized routes (zh / en / ja)
│   │   ├── cards/         # Card list & detail pages
│   │   ├── login/
│   │   └── register/
│   └── api/
│       ├── auth/          # Login / register / logout / current user
│       ├── cards/         # Card CRUD & AI recognition
│       ├── images/        # Image proxy (authenticated private access)
│       ├── upload/        # File upload
│       └── llm-logs/      # LLM log queries
├── components/
│   ├── cards/             # Card list, item, upload, search components
│   ├── layout/            # Header, locale switcher
│   └── ui/
├── lib/
│   ├── llm/               # LLM integration (Claude & Alibaba)
│   ├── storage/           # Storage abstraction (local / Vercel Blob / Alibaba OSS)
│   └── auth.ts / prisma.ts / utils.ts
├── i18n/                  # next-intl configuration
└── middleware.ts          # Route guard & locale detection
messages/                  # Translation files (zh.json / en.json / ja.json)
prisma/                    # Schema & database migrations
```

---

## Environment Variables Overview

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (≥ 32-char random string; required in production) |
| `ADMIN_EMAILS` | Admin emails (comma-separated); signing in with such a Google account grants admin rights |
| `LLM_PROVIDER` | `claude` or `alibaba` |
| `CLAUDE_API_KEY` | Anthropic API key |
| `CLAUDE_MODEL` | e.g. `claude-sonnet-4.6` |
| `ALIBABA_API_KEY` | Alibaba Bailian API key |
| `ALIBABA_MODEL` | e.g. `qwen3.7-max` |
| `STORAGE_PROVIDER` | `local` (dev) / `aliyun-oss` (prod) / `vercel` (alternative) |
| `ALIYUN_OSS_ACCESS_KEY_ID` | Alibaba RAM AccessKey ID (OSS mode) |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | Alibaba RAM AccessKey Secret (OSS mode) |
| `ALIYUN_OSS_ROLE_ARN` | RAM role ARN (for STS AssumeRole) |
| `ALIYUN_OSS_REGION` | OSS region (e.g. `oss-ap-southeast-1`) |
| `ALIYUN_OSS_BUCKET` | OSS bucket name |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (vercel mode only) |

See [DEPLOY.en.md](./DEPLOY.en.md) for details and optional settings.

---

## Common Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (listens on all interfaces) |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run db:migrate` | Run Prisma database migrations |
| `npm run db:seed` | Seed the initial account |
| `npm run db:studio` | Launch Prisma Studio |
| `npm run db:reset` | Reset the database (use with caution) |

---

## License

[MIT](./LICENSE)
