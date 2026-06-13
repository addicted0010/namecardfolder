# CardVault

> 简体中文 | [English](./README.en.md)

**珍藏每一次相遇。** CardVault 是一个面向个人与小团队的 AI 名片管理 Web 应用：拍下名片正反面，自动识别联系人信息，并把“在哪里、什么时候收到这张名片”的来源信息一起保存，方便之后搜索和回忆。

<video src="./public/videos/cardvault_demo_zh.mp4" controls muted playsinline width="320"></video>

[观看中文演示视频](./public/videos/cardvault_demo_zh.mp4)

## 你可以用它做什么

- **现场快速录入名片**：手机打开网页，拍摄名片正反面即可上传。
- **自动提取联系人信息**：AI 识别姓名、公司、职位、邮箱、电话、地址、网站、部门、传真等字段，并支持日语名片的假名读音（ふりがな）。
- **记录交换场景**：提前设置本次活动/地点/日期等来源信息，同一场合收到的多张名片会自动带上相同来源，回去后可直接搜索。
- **快速查找和整理**：按姓名、公司、电话、邮箱、来源、备注等模糊搜索；支持批量删除。
- **多语言界面**：中文 / English / 日本語 三语切换，桌面和手机都可使用。

## 3 分钟本地试用

本地试用只需要 Node.js、Docker 和一个 LLM API Key。完整生产部署请看 [DEPLOY.md](./DEPLOY.md)。

```bash
git clone <仓库地址>
cd namecardfolder
npm install

cp .env.example .env.local
# 编辑 .env.local：
# - 设置 JWT_SECRET
# - 选择 LLM_PROVIDER=claude 或 alibaba
# - 填入对应的 CLAUDE_API_KEY 或 ALIBABA_API_KEY

docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

打开 `http://localhost:3000`，使用默认本地账号登录：

- 用户名：`admin`
- 密码：`admin123`

> 这个默认账号只用于本地试用。生产环境请通过 `SEED_USERNAME` / `SEED_PASSWORD` 自定义，并设置强密码。

## 生产部署流程

推荐部署到 Vercel，使用托管 PostgreSQL（如 Neon）和私有对象存储（阿里云 OSS 或 Vercel Blob）。

1. **准备数据库**：创建 PostgreSQL 数据库，拿到 `DATABASE_URL`。
2. **准备文件存储**：生产推荐 `STORAGE_PROVIDER=aliyun-oss`；也可以使用 Vercel Blob。
3. **准备 AI 服务**：选择 `LLM_PROVIDER=claude` 或 `alibaba`，并配置对应 API Key。阿里云百炼默认使用 `qwen3.7-plus`，所有请求都关闭 thinking 模式以保证 OCR 响应速度。
4. **配置管理员**：设置 `ADMIN_EMAILS=你的邮箱`。用这个 Google 邮箱登录时会自动获得管理员权限。
5. **设置安全密钥**：设置 `JWT_SECRET`，建议用 `openssl rand -base64 48` 生成。
6. **运行迁移并部署**：

```bash
npx prisma migrate deploy
npm run build
```

更详细的 Vercel、Neon、OSS、Google OAuth 配置步骤请参考 [DEPLOY.md](./DEPLOY.md)。

## 使用方式

1. 登录后进入名片列表。
2. 点击右下角 `+`，可先设置本次名片来源，例如“2026-06-13 Starbucks Oimachi”。
3. 点击上传，拍摄名片正面；如有背面，再拍摄背面。
4. 上传完成后，AI 会在后台识别；你可以继续添加下一张名片，不需要等待。
5. 识别完成后，打开名片详情，检查并编辑字段。
6. 之后可通过姓名、公司、电话、邮箱、来源等关键词快速搜索。

## 主要环境变量

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `JWT_SECRET` | 登录 token 签名密钥，生产环境必填 |
| `ADMIN_EMAILS` | 管理员邮箱列表，逗号分隔 |
| `LLM_PROVIDER` | `claude` 或 `alibaba` |
| `CLAUDE_API_KEY` / `ALIBABA_API_KEY` | AI 服务 API Key |
| `STORAGE_PROVIDER` | `local` / `aliyun-oss` / `vercel` |
| `NEXT_PUBLIC_APP_URL` | 应用公开访问地址 |

更多变量说明见 [DEPLOY.md](./DEPLOY.md)。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL
- JWT HttpOnly Cookie + Google OAuth 2.0
- next-intl（zh / en / ja）
- Anthropic Claude / 阿里云百炼（OpenAI 兼容接口）
- 本地存储 / 阿里云 OSS / Vercel Blob

## License

[MIT](./LICENSE)
