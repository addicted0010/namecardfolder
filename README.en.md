# CardVault

> [简体中文](./README.md) | English

**Treasure Every Connection.** CardVault is an AI-powered business card manager for individuals and small teams. Capture both sides of a card, let AI extract the contact details, and keep the meeting context so every new connection is easy to find later.

<video src="./public/videos/cardvault_demo.mp4" controls muted playsinline width="320"></video>

[Watch the English demo video](./public/videos/cardvault_demo.mp4)

## What You Can Do

- **Capture cards on the spot**: Open the web app on your phone and take photos of the front and back.
- **Extract contact fields automatically**: AI reads names, companies, titles, emails, phone numbers, addresses, websites, departments, fax numbers, and Japanese furigana (ふりがな).
- **Remember where you met**: Set an occasion/source once, then every card scanned at the same event gets the same searchable context.
- **Find people later**: Search by name, company, phone, email, source, or notes.
- **Work across languages and devices**: 中文 / English / 日本語 UI, responsive on mobile and desktop.

## Try It Locally in 3 Minutes

Local setup only requires Node.js, Docker, and one LLM API key. For production deployment, see [DEPLOY.en.md](./DEPLOY.en.md).

```bash
git clone <repository-url>
cd namecardfolder
npm install

cp .env.example .env.local
# Edit .env.local:
# - set JWT_SECRET
# - choose LLM_PROVIDER=claude or alibaba
# - set CLAUDE_API_KEY or ALIBABA_API_KEY

docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` and sign in with the local demo account:

- Username: `admin`
- Password: `admin123`

> The default account is for local testing only. Use `SEED_USERNAME` / `SEED_PASSWORD` and a strong password in production.

## Deploy to Production

The recommended setup is Vercel, managed PostgreSQL (such as Neon), and private object storage (Alibaba Cloud OSS or Vercel Blob).

1. **Prepare the database**: Create PostgreSQL and get `DATABASE_URL`.
2. **Prepare file storage**: Use `STORAGE_PROVIDER=aliyun-oss` in production, or choose Vercel Blob.
3. **Prepare AI recognition**: Choose `LLM_PROVIDER=claude` or `alibaba`. Alibaba Bailian defaults to `qwen3.7-plus`; all requests keep thinking mode off for faster OCR-style extraction.
4. **Configure admins**: Set `ADMIN_EMAILS=your@email.com`. Signing in with that verified Google email grants admin rights.
5. **Set a JWT secret**: Generate one with `openssl rand -base64 48` and set `JWT_SECRET`.
6. **Run migrations and deploy**:

```bash
npx prisma migrate deploy
npm run build
```

For the full Vercel, Neon, OSS, and Google OAuth walkthrough, see [DEPLOY.en.md](./DEPLOY.en.md).

## How to Use

1. Sign in and open the card list.
2. Tap the bottom-right `+`; optionally set the event/source, such as “2026-06-13 Starbucks Oimachi”.
3. Upload or take a photo of the card front; add the back side if available.
4. AI recognizes the card in the background, so you can keep adding more cards without waiting.
5. Open a card to review and edit extracted fields.
6. Search later by name, company, phone, email, source, or notes.

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret for login tokens; required in production |
| `ADMIN_EMAILS` | Comma-separated admin email list |
| `LLM_PROVIDER` | `claude` or `alibaba` |
| `CLAUDE_API_KEY` / `ALIBABA_API_KEY` | AI provider API key |
| `STORAGE_PROVIDER` | `local` / `aliyun-oss` / `vercel` |
| `NEXT_PUBLIC_APP_URL` | Public app URL |

See [DEPLOY.en.md](./DEPLOY.en.md) for all configuration options.

## Tech Stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL
- JWT HttpOnly Cookie + Google OAuth 2.0
- next-intl (zh / en / ja)
- Anthropic Claude / Alibaba Bailian (OpenAI-compatible API)
- Local storage / Alibaba OSS / Vercel Blob

## License

[MIT](./LICENSE)
