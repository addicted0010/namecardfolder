# CardVault

> 简体中文 | [English](./README.en.md)

基于 AI 的名片管理 Web 应用，支持拍照/上传名片自动识别、多维度检索、批量管理，适配桌面与移动端。

---

## 功能特性

- **名片上传**：支持文件拖拽上传与摄像头拍照（桌面调用 WebRTC、手机调用系统相机）
- **正反面识别**：可上传名片正面（必填）和反面（可选）
- **AI 自动识别**：调用 LLM 提取姓名、公司、职位、邮箱、电话、地址、网站、部门、传真等字段；支持日语名片假名（ふりがな）识别
- **多语言 UI**：中文 / English / 日本語 三语切换
- **全文检索**：按姓名、公司、邮箱、电话等字段模糊搜索，搜索栏吸顶常驻
- **批量删除**：右下角 FAB 进入多选模式，勾选后一键删除
- **LLM 调试日志**：名片详情页可查看 / 复制 LLM 请求与响应原文
- **响应式设计**：兼容手机、平板、桌面，断点 480 px 切换单列 / 双列布局

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript |
| 样式 | Tailwind CSS 4 |
| 数据库 ORM | Prisma + PostgreSQL |
| 认证 | JWT（jose）+ HttpOnly Cookie |
| 国际化 | next-intl（zh / en / ja） |
| LLM | Anthropic Claude 或阿里云百炼（qwen），OpenAI 兼容接口 |
| 文件存储 | 本地磁盘（开发）/ 阿里云 OSS（生产，STS 临时令牌）/ Vercel Blob（备选），通过 API 代理鉴权访问 |

---

## 快速开始

> 完整部署与配置说明请参考 [DEPLOY.md](./DEPLOY.md)

### 环境要求

- Node.js ≥ 18（推荐 20+）
- Docker Desktop（本地运行 PostgreSQL）

### 启动步骤

```bash
# 1. 克隆项目
git clone <仓库地址>
cd namecardfolder

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填写 JWT_SECRET 和 LLM API Key

# 4. 启动数据库
docker compose up -d

# 5. 数据库迁移 & 初始化种子账户
npm run db:migrate
npm run db:seed   # 默认账户：admin / admin123

# 6. 启动开发服务器
npm run dev
```

访问 `http://localhost:3000`，使用 `admin / admin123` 登录。

---

## 项目结构

```
src/
├── app/
│   ├── [locale]/          # 多语言路由（zh / en / ja）
│   │   ├── cards/         # 名片列表页 & 详情页
│   │   ├── login/
│   │   └── register/
│   └── api/
│       ├── auth/          # 登录 / 注册 / 登出 / 当前用户
│       ├── cards/         # 名片 CRUD & AI 识别
│       ├── images/        # 图片代理（私有 Blob 鉴权访问）
│       ├── upload/        # 文件上传
│       └── llm-logs/      # LLM 日志查询
├── components/
│   ├── cards/             # 名片列表、卡片、上传、搜索组件
│   ├── layout/            # Header、语言切换
│   └── ui/
├── lib/
│   ├── llm/               # LLM 调用封装（Claude & 阿里云）
│   ├── storage/           # 存储抽象（本地 / Vercel Blob / 阿里云 OSS）
│   └── auth.ts / prisma.ts / utils.ts
├── i18n/                  # next-intl 配置
└── middleware.ts          # 路由守卫 & 语言检测
messages/                  # 翻译文件（zh.json / en.json / ja.json）
prisma/                    # Schema & 数据库迁移
```

---

## 环境变量概览

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `JWT_SECRET` | JWT 签名密钥（≥ 32 位随机字符串，生产环境必填） |
| `ADMIN_EMAILS` | 管理员邮箱（逗号分隔），用该邮箱 Google 登录即获管理员权限 |
| `LLM_PROVIDER` | `claude` 或 `alibaba` |
| `CLAUDE_API_KEY` | Anthropic API Key |
| `CLAUDE_MODEL` | 如 `claude-sonnet-4.6` |
| `ALIBABA_API_KEY` | 阿里云百炼 API Key |
| `ALIBABA_MODEL` | 如 `qwen3.7-max` |
| `STORAGE_PROVIDER` | `local`（开发）/ `aliyun-oss`（生产）/ `vercel`（备选） |
| `ALIYUN_OSS_ACCESS_KEY_ID` | 阿里云 RAM AccessKey ID（OSS 模式） |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | 阿里云 RAM AccessKey Secret（OSS 模式） |
| `ALIYUN_OSS_ROLE_ARN` | RAM 角色 ARN（STS AssumeRole 用） |
| `ALIYUN_OSS_REGION` | OSS 区域（如 `oss-ap-southeast-1`） |
| `ALIYUN_OSS_BUCKET` | OSS Bucket 名称 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob Token（仅 vercel 模式） |

详细说明及可选配置参见 [DEPLOY.md](./DEPLOY.md)。

---

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（监听所有网卡） |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run db:migrate` | 运行 Prisma 数据库迁移 |
| `npm run db:seed` | 初始化种子账户 |
| `npm run db:studio` | 启动 Prisma Studio 可视化工具 |
| `npm run db:reset` | 重置数据库（慎用） |

---

## License

[MIT](./LICENSE)
