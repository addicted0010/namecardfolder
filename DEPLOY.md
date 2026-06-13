# CardVault 部署与配置指南

> 简体中文 | [English](./DEPLOY.en.md)

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
5. 部署后进入 **Settings → Functions → Function Region**，选择 **Singapore (sin1)**
   > 与 Neon 数据库和阿里云 OSS 同区域，可显著降低 API 延迟

### 3. 配置 Vercel Postgres（Neon）

1. 在 Vercel 项目面板中，进入 **Storage** 标签页
2. 点击 **"Create Database"**，选择 **Neon**（推荐，标准 PostgreSQL 连接串，无需改代码）
3. 创建完成后，Vercel 会自动注入 `POSTGRES_URL` 等环境变量
4. 复制 Neon 的连接字符串，格式类似：
   ```
   postgresql://user:password@host:port/dbname?sslmode=require
   ```

### 4. 配置文件存储（阿里云 OSS，推荐）

参照下方 [阿里云 OSS 配置步骤](#阿里云-oss-配置步骤) 完成 OSS Bucket、RAM 用户和角色的创建，然后在 Vercel 环境变量中配置相关参数。

> **备选方案**：如果仍需使用 Vercel Blob，在 **Storage** 标签页中创建 Blob Store，并将 `STORAGE_PROVIDER` 设为 `vercel`。Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN`。

### 5. 配置环境变量

在 Vercel 项目 **Settings → Environment Variables** 中，添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | Vercel Postgres 连接字符串 | 数据库连接 |
| `JWT_SECRET` | 随机生成的长字符串（至少 32 位） | JWT 签名密钥（生产环境**必填**，缺失会导致鉴权直接报错） |
| `ADMIN_EMAILS` | 逗号分隔的管理员邮箱 | 用该邮箱的 Google 账号登录即获得管理员权限（可留空） |
| `LLM_PROVIDER` | `claude` 或 `alibaba` | LLM 服务商选择 |
| `CLAUDE_BASE_URL` | `https://api.anthropic.com`（或代理地址） | Claude API 地址 |
| `CLAUDE_API_KEY` | 你的 Claude API Key | Claude 密钥 |
| `CLAUDE_MODEL` | `claude-sonnet-4.6` | Claude 模型 |
| `ALIBABA_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | 百炼 API 地址 |
| `ALIBABA_API_KEY` | 你的百炼 API Key | 百炼密钥 |
| `ALIBABA_MODEL` | `qwen3.7-plus`（或 `qwen3.6-plus`） | 百炼模型 |
| `STORAGE_PROVIDER` | `aliyun-oss` | 使用阿里云 OSS 存储（推荐） |
| `ALIYUN_OSS_ACCESS_KEY_ID` | RAM 用户 AccessKey ID | 阿里云 RAM 凭证 |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | RAM 用户 AccessKey Secret | 阿里云 RAM 凭证 |
| `ALIYUN_OSS_ROLE_ARN` | `acs:ram::<ID>:role/xxx` | STS 角色 ARN |
| `ALIYUN_OSS_REGION` | `oss-ap-southeast-1` | OSS 区域 |
| `ALIYUN_OSS_BUCKET` | 你的 Bucket 名称 | OSS Bucket |
| `ALIYUN_OSS_STS_ENDPOINT` | `https://sts.aliyuncs.com` | STS 端点（可选） |
| `NEXT_PUBLIC_APP_URL` | 你的生产域名（如 `https://cardvault.example.com`） | 应用公开地址 |

> **提示**：Vercel Postgres 创建后会自动注入数据库相关变量。阿里云 OSS 和 LLM 相关的变量需手动添加。

### 6. 运行数据库迁移

在本地执行远程数据库迁移（让 `DATABASE_URL` 指向 Neon 生产数据库）：

```bash
# 方式 1：直接在命令前设置连接串（从 Vercel/Neon 控制台复制）
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" npx prisma migrate deploy
```

```bash
# 方式 2：先拉取生产环境变量，再从文件中读取（注意：Sensitive 变量需手动填充）
npx vercel env pull .env.production --environment=production
# 编辑 .env.production，手动填入 DATABASE_URL（Sensitive 变量不会自动拉取）
source .env.production && npx prisma migrate deploy
```

> **说明**：两种方式都是在本地机器上执行命令，Prisma 通过 `DATABASE_URL` 连接到远程 Neon 数据库并执行迁移。

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
| `JWT_SECRET` | JWT 签名密钥，至少 32 位（生产环境必填，未设置时鉴权会 fail-closed 报错） | 随机字符串 |
| `ADMIN_EMAILS` | 管理员邮箱列表（逗号分隔，大小写不敏感）。Google 登录时若已验证邮箱命中该列表，自动授予管理员权限（如查看 LLM 日志）；种子账户的邮箱也取自此列表的第一项 | `you@gmail.com,teammate@gmail.com` |

> **管理员指定说明**：项目不再在代码/迁移中硬编码任何邮箱。管理员完全由 `ADMIN_EMAILS` 环境变量决定。留空则没有基于邮箱的管理员（种子账户仍为管理员）。

### LLM 服务

| 变量 | 说明 | 可选值 |
|------|------|--------|
| `LLM_PROVIDER` | 选择 LLM 服务商 | `claude` / `alibaba` |
| `CLAUDE_BASE_URL` | Claude API 地址（可配置代理） | `https://api.anthropic.com` |
| `CLAUDE_API_KEY` | Claude API 密钥 | `sk-ant-...` |
| `CLAUDE_MODEL` | Claude 模型名称 | `claude-sonnet-4.6` |
| `ALIBABA_BASE_URL` | 阿里云百炼 API 地址（可按区域配置） | 见下方说明 |
| `ALIBABA_API_KEY` | 阿里云百炼 API 密钥 | `sk-...` |
| `ALIBABA_MODEL` | 百炼模型名称 | `qwen3.7-plus` / `qwen3.6-plus` |

> **qwen3.6-plus 说明**：使用 `qwen3.6-plus` 时，接口会启用 thinking 模式（`enable_thinking: true`，`thinking_budget: 8000`），输出质量更高但响应稍慢。

**阿里云百炼 API 地址参考**：

| 区域 | 地址 |
|------|------|
| 新加坡（国际站） | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| 中国大陆 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

> `ALIBABA_BASE_URL` 和 `CLAUDE_BASE_URL` 支持自定义，可用于配置代理服务器或其他区域端点。

### 文件存储

| 变量 | 说明 | 可选值 |
|------|------|--------|
| `STORAGE_PROVIDER` | 文件存储方式 | `local`（开发）/ `vercel`（Vercel Blob）/ `aliyun-oss`（阿里云 OSS） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob Token（仅 vercel 模式） | Vercel 自动注入 |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 阿里云 RAM 用户 AccessKey ID | `LTAI5t...` |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 阿里云 RAM 用户 AccessKey Secret | `xxxxx` |
| `ALIYUN_OSS_ROLE_ARN` | RAM 角色 ARN（用于 STS AssumeRole） | `acs:ram::123456:role/oss-access` |
| `ALIYUN_OSS_REGION` | OSS Bucket 所在区域 | `oss-ap-southeast-1` |
| `ALIYUN_OSS_BUCKET` | OSS Bucket 名称 | `cardvault-images` |
| `ALIYUN_OSS_STS_ENDPOINT` | STS 服务端点（可选） | `https://sts.aliyuncs.com` |

> **存储模式说明**：
> - `local`：开发环境，图片存储在本地 `public/uploads/` 目录。
> - `vercel`：使用 Vercel Blob Store 私有模式，通过后端 API 代理访问。
> - `aliyun-oss`：使用阿里云 OSS，通过 STS 临时令牌访问。图片代理 API 会返回 302 重定向到 OSS 签名 URL，客户端直接从 OSS 下载，速度更快。

#### 阿里云 OSS 配置步骤

##### 1. 创建 OSS Bucket

1. 登录 [阿里云 OSS 控制台](https://oss.console.aliyun.com/)
2. 创建 Bucket：
   - **Bucket 名称**：自定义（如 `cardvault-images`）
   - **地域**：选择靠近用户的区域（如 `ap-southeast-1` 新加坡）
   - **存储类型**：标准存储
   - **读写权限**：**私有**（Private）
   - **服务端加密**：推荐开启 OSS 完全托管加密
3. 记录 Bucket 名称和区域（用于环境变量 `ALIYUN_OSS_BUCKET` 和 `ALIYUN_OSS_REGION`）

##### 2. 创建 RAM 用户

1. 登录 [RAM 控制台](https://ram.console.aliyun.com/)
2. 创建用户：
   - **登录名称**：`cardvault-sts`（仅用于 API 调用）
   - **访问方式**：勾选 **OpenAPI 调用访问**
3. 创建完成后，保存 **AccessKey ID** 和 **AccessKey Secret**
4. 为该用户添加权限：`AliyunSTSAssumeRoleAccess`（允许调用 STS AssumeRole）

##### 3. 创建 RAM 角色

1. 在 RAM 控制台 → 角色管理 → 创建角色
2. 选择 **阿里云账号** 类型
3. 角色名称：`cardvault-oss-access`
4. 信任策略中的受信云账号选择 **当前云账号**
5. 创建完成后，为角色添加权限策略：
   - 进入 RAM 控制台 → **权限策略** → **创建权限策略**
   - 策略名称：`cardvault-oss-readwrite`
   - 选择 **脚本编辑** 模式，粘贴以下 JSON：

**自定义策略**（最小权限原则）：

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

> 将 `cardvault-images` 替换为你的 Bucket 名称。

6. 策略创建完成后，回到 **角色** → 点击角色名 `cardvault-oss-access` → **权限管理** 标签页 → **新增授权** → 搜索 `cardvault-oss-readwrite` → 确认授权
7. 复制角色 ARN（在角色详情页顶部，格式：`acs:ram::<账号ID>:role/cardvault-oss-access`）

##### 4. 配置环境变量

在 Vercel 项目 **Settings → Environment Variables** 中添加：

| 变量名 | 值 |
|--------|-----|
| `STORAGE_PROVIDER` | `aliyun-oss` |
| `ALIYUN_OSS_ACCESS_KEY_ID` | RAM 用户的 AccessKey ID |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | RAM 用户的 AccessKey Secret |
| `ALIYUN_OSS_ROLE_ARN` | RAM 角色的 ARN |
| `ALIYUN_OSS_REGION` | `oss-ap-southeast-1`（按实际区域填写） |
| `ALIYUN_OSS_BUCKET` | 你的 Bucket 名称 |
| `ALIYUN_OSS_STS_ENDPOINT` | `https://sts.aliyuncs.com`（国际站，国内用 `https://sts.cn-hangzhou.aliyuncs.com`） |

##### 5. 迁移现有数据（从 Vercel Blob 迁移到 OSS）

如果已有数据存储在 Vercel Blob 中，运行迁移脚本：

```bash
# 先预览（不做实际修改）
DATABASE_URL="..." BLOB_READ_WRITE_TOKEN="..." \
ALIYUN_OSS_ACCESS_KEY_ID="..." ALIYUN_OSS_ACCESS_KEY_SECRET="..." \
ALIYUN_OSS_ROLE_ARN="..." ALIYUN_OSS_REGION="..." ALIYUN_OSS_BUCKET="..." \
npx tsx scripts/migrate-blob-to-oss.ts --dry-run

# 确认无误后执行迁移
DATABASE_URL="..." BLOB_READ_WRITE_TOKEN="..." \
ALIYUN_OSS_ACCESS_KEY_ID="..." ALIYUN_OSS_ACCESS_KEY_SECRET="..." \
ALIYUN_OSS_ROLE_ARN="..." ALIYUN_OSS_REGION="..." ALIYUN_OSS_BUCKET="..." \
npx tsx scripts/migrate-blob-to-oss.ts
```

> 迁移脚本支持 `--batch=N` 参数控制并发数（默认 10）。已迁移的图片会自动跳过，可安全重复运行。

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
