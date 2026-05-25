# CardVault 部署与配置指南

## 目录

- [一、开发环境部署（本地 Mac）](#一开发环境部署本地-mac)
- [二、生产环境部署（Vercel）](#二生产环境部署vercel)
- [三、环境变量说明](#三环境变量说明)
- [四、常见问题](#四常见问题)

---

## 一、开发环境部署（本地 Mac）

### 1. 环境要求

- **Node.js** >= 18（推荐 20+）
- **Docker Desktop**（用于运行 PostgreSQL）
- **Git**

### 2. 克隆项目

```bash
git clone <仓库地址>
cd namecardfolder
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

复制环境变量模板文件：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，至少配置以下内容：

```bash
# 数据库连接（默认即可，Docker 启动后自动可用）
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/namecard

# JWT 密钥（请替换为随机字符串，至少 32 位）
JWT_SECRET=替换为你的随机密钥

# LLM 服务商选择：alibaba 或 claude
LLM_PROVIDER=claude

# 如果选择 Claude，填写 API Key
CLAUDE_API_KEY=sk-ant-xxxxx

# 如果选择阿里云百炼，填写 API Key
# LLM_PROVIDER=alibaba
# ALIBABA_API_KEY=sk-xxxxx
```

> 生成随机密钥的快捷方法：`openssl rand -base64 32`

### 5. 启动 PostgreSQL 数据库

```bash
docker compose up -d
```

验证数据库是否启动成功：

```bash
docker ps
# 确认 namecard-postgres 容器状态为 running
```

> 数据库端口映射为宿主机 `5433` → 容器 `5432`，避免与本机已有的 PostgreSQL 冲突。

### 6. 运行数据库迁移

```bash
npm run db:migrate
```

此命令会根据 Prisma Schema 创建所有数据表。

### 7. 初始化种子数据

```bash
npm run db:seed
```

成功后会创建默认管理员账户：
- 用户名：`admin`
- 密码：`admin123`

> 可通过环境变量 `SEED_USERNAME`、`SEED_PASSWORD`、`SEED_DISPLAY_NAME` 自定义种子用户。

### 8. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`（如果端口被占用，Next.js 会自动选择可用端口）。

### 9. 常用开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（验证类型检查） |
| `npm run lint` | ESLint 代码检查 |
| `npm run db:migrate` | 运行数据库迁移 |
| `npm run db:seed` | 运行种子脚本 |
| `npm run db:studio` | 启动 Prisma Studio（数据库可视化） |
| `npm run db:reset` | 重置数据库（删除所有数据并重新迁移） |
| `docker compose down` | 停止 PostgreSQL 容器 |
| `docker compose up -d` | 启动 PostgreSQL 容器 |

---

## 二、生产环境部署（Vercel）

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. 在 Vercel 创建项目

1. 登录 [Vercel](https://vercel.com)
2. 点击 **"Add New..." → "Project"**
3. 选择你的 GitHub 仓库
4. Framework Preset 选择 **Next.js**

### 3. 配置 Vercel Postgres

1. 在 Vercel 项目面板中，进入 **Storage** 标签页
2. 点击 **"Create Database"**，选择 **Postgres**
3. 创建完成后，Vercel 会自动注入 `POSTGRES_URL` 等环境变量
4. 复制 Vercel Postgres 的连接字符串，格式类似：
   ```
   postgresql://user:password@host:port/dbname?sslmode=require
   ```

### 4. 配置 Vercel Blob Storage

1. 在 **Storage** 标签页中，点击 **"Create Database"**，选择 **Blob**
2. 创建完成后，Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN` 环境变量

### 5. 配置环境变量

在 Vercel 项目 **Settings → Environment Variables** 中，添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | Vercel Postgres 连接字符串 | 数据库连接 |
| `JWT_SECRET` | 随机生成的长字符串（至少 32 位） | JWT 签名密钥 |
| `LLM_PROVIDER` | `claude` 或 `alibaba` | LLM 服务商选择 |
| `CLAUDE_BASE_URL` | `https://api.anthropic.com`（或代理地址） | Claude API 地址 |
| `CLAUDE_API_KEY` | 你的 Claude API Key | Claude 密钥 |
| `CLAUDE_MODEL` | `claude-sonnet-4.6` | Claude 模型 |
| `ALIBABA_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 百炼 API 地址 |
| `ALIBABA_API_KEY` | 你的百炼 API Key | 百炼密钥 |
| `ALIBABA_MODEL` | `qwen3.7-max` | 百炼模型 |
| `STORAGE_PROVIDER` | `vercel` | 使用 Vercel Blob 存储 |
| `BLOB_READ_WRITE_TOKEN` | （自动注入） | Vercel Blob Token |
| `NEXT_PUBLIC_APP_URL` | 你的生产域名（如 `https://cardvault.example.com`） | 应用公开地址 |

> **提示**：Vercel Postgres 和 Blob 创建后会自动注入部分变量，只需手动添加 LLM 和 JWT 相关的变量。

### 6. 运行数据库迁移

在本地执行远程数据库迁移（需要设置本地 `DATABASE_URL` 指向 Vercel Postgres）：

```bash
# 临时设置环境变量指向 Vercel Postgres
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

或者使用 Vercel CLI 在云端执行：

```bash
npx vercel env pull .env.production   # 拉取生产环境变量
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d= -f2-) npx prisma migrate deploy
```

### 7. 创建初始用户

迁移完成后，创建管理员账户：

```bash
DATABASE_URL="postgresql://..." SEED_USERNAME=admin SEED_PASSWORD=你的密码 npm run db:seed
```

### 8. 部署

1. 回到 Vercel 面板，点击 **"Deploy"**
2. 等待构建完成
3. 访问分配的域名，使用创建的管理员账户登录

> 后续代码推送到 GitHub 后，Vercel 会自动重新部署。

---

## 三、环境变量说明

### 数据库

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5433/namecard` |

### 认证

| 变量 | 说明 | 示例 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥，至少 32 位 | 随机字符串 |

### LLM 服务

| 变量 | 说明 | 可选值 |
|------|------|--------|
| `LLM_PROVIDER` | 选择 LLM 服务商 | `claude` / `alibaba` |
| `CLAUDE_BASE_URL` | Claude API 地址（可配置代理） | `https://api.anthropic.com` |
| `CLAUDE_API_KEY` | Claude API 密钥 | `sk-ant-...` |
| `CLAUDE_MODEL` | Claude 模型名称 | `claude-sonnet-4.6` |
| `ALIBABA_BASE_URL` | 阿里云百炼 API 地址（可按区域配置） | 见下方说明 |
| `ALIBABA_API_KEY` | 阿里云百炼 API 密钥 | `sk-...` |
| `ALIBABA_MODEL` | 百炼模型名称 | `qwen3.7-max` |

**阿里云百炼 API 地址参考**：

| 区域 | 地址 |
|------|------|
| 新加坡（国际站） | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| 中国大陆 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

> `ALIBABA_BASE_URL` 和 `CLAUDE_BASE_URL` 支持自定义，可用于配置代理服务器或其他区域端点。

### 文件存储

| 变量 | 说明 | 可选值 |
|------|------|--------|
| `STORAGE_PROVIDER` | 文件存储方式 | `local`（开发）/ `vercel`（生产） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob Token（生产环境） | Vercel 自动注入 |

### 应用

| 变量 | 说明 | 示例 |
|------|------|------|
| `NEXT_PUBLIC_APP_URL` | 应用公开访问地址 | `http://localhost:3000` / `https://yourdomain.com` |

---

## 四、常见问题

### Q: 端口 5433 被占用

如果本地 5433 端口已被使用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "5434:5432"   # 改为其他可用端口
```

并同步修改 `.env.local` 中的 `DATABASE_URL`。

### Q: Prisma 迁移报错 "Can't reach database server"

1. 确认 Docker 容器正在运行：`docker ps | grep namecard-postgres`
2. 如果未运行，执行：`docker compose up -d`
3. 等待几秒后重试（PostgreSQL 启动需要时间）

### Q: 构建时报 Prisma Client 错误

重新生成 Prisma Client：

```bash
npx prisma generate
```

### Q: 如何切换 LLM 服务商

修改 `.env.local`（开发环境）或 Vercel 环境变量（生产环境）：

```bash
# 切换到阿里云百炼
LLM_PROVIDER=alibaba
ALIBABA_API_KEY=你的密钥

# 切换到 Claude
LLM_PROVIDER=claude
CLAUDE_API_KEY=你的密钥
```

修改后重启开发服务器或重新部署即可生效。

### Q: 如何使用自定义 API 代理地址

在环境变量中设置 `BASE_URL` 为你的代理地址：

```bash
# 使用自建代理
CLAUDE_BASE_URL=https://your-proxy.example.com
ALIBABA_BASE_URL=https://your-proxy.example.com/alibaba
```

### Q: 忘记密码如何重置

通过 Prisma Studio 或命令行重置：

```bash
npm run db:studio
```

在 Prisma Studio 中找到 User 表，编辑对应用户的 `passwordHash` 字段。或者使用种子脚本重新创建用户（需先删除旧用户）。
