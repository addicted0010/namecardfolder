# Google OAuth 登录配置指南

本文档详细描述如何为 CardVault 项目配置 Google OAuth 2.0 登录功能。

## 前置条件

- 一个 Google 账号
- 访问 [Google Cloud Console](https://console.cloud.google.com/) 的权限

---

## 第一步：创建 Google Cloud 项目

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击页面顶部的项目选择器（Project Selector）
3. 点击 **"新建项目"（New Project）**
4. 填写项目信息：
   - **项目名称**：`CardVault`（或你喜欢的名称）
   - **组织**：选择你的组织或保持"无组织"
5. 点击 **"创建"（Create）**
6. 等待项目创建完成，确保已切换到新创建的项目

---

## 第二步：配置 OAuth 同意屏幕

1. 在左侧导航栏中，进入 **"API 和服务" > "OAuth 同意屏幕"**
   - 路径：`APIs & Services > OAuth consent screen`
2. 选择用户类型：
   - **外部（External）**：适用于任何 Google 账号用户（推荐）
   - **内部（Internal）**：仅限 Google Workspace 组织内部用户
3. 点击 **"创建"（Create）**
4. 在左侧导航栏点击 **"Branding"**（品牌信息）
5. 填写应用信息：
   - **应用名称**：`CardVault`
   - **用户支持电子邮件**：选择你的邮箱
   - **应用徽标**：可选，可上传项目 Logo
6. 填写 **应用域名**（App Domain）部分：
   - **应用首页链接**：`https://你的域名`（如 `https://cardvault.example.com`）
   - **应用隐私权政策链接**：`https://你的域名/privacy-policy`
   - **应用服务条款链接**：`https://你的域名/terms-of-service`
7. 填写 **开发者联系信息**：
   - 输入你的邮箱地址
8. 点击 **"保存"（Save）**

### 配置 Data Access（数据访问权限）

9. 在左侧导航栏点击 **"Data access"**
10. 点击 **"Add or remove scopes"** 按钮
11. 在右侧弹出的 "Update selected scopes" 面板中，勾选以下三项：
    - `.../auth/userinfo.email` — See your primary Google Account email address
    - `.../auth/userinfo.profile` — See your personal info, including any personal info you've made publicly available
    - `openid` — Associate you with your personal info on Google
12. 点击 **"Save"**

### 添加测试用户（仅在外部模式未发布时需要）

13. 在左侧导航栏点击 **"Audience"**
14. 点击 **"Add users"** 按钮
15. 输入你要用来测试的 Google 邮箱地址
16. 点击 **"Save"**

> **注意**：在应用发布（Published）之前，只有添加为测试用户的 Google 账号才能使用 OAuth 登录。

---

## 第三步：创建 OAuth 2.0 客户端凭据

1. 在左侧导航栏中，进入 **"API 和服务" > "凭据"**
   - 路径：`APIs & Services > Credentials`
2. 点击页面顶部的 **"+ 创建凭据"（+ Create Credentials）**
3. 选择 **"OAuth 客户端 ID"（OAuth client ID）**
4. 配置客户端：
   - **应用类型**：选择 **"Web 应用"（Web application）**
   - **名称**：`CardVault Web Client`（或其他便于识别的名称）
5. 配置 **已获授权的 JavaScript 来源**（Authorized JavaScript origins）：
   - 点击 **"+ 添加 URI"**
   - 添加以下地址：
     ```
     http://localhost:3000
     https://你的生产域名
     ```
6. 配置 **已获授权的重定向 URI**（Authorized redirect URIs）：
   - 点击 **"+ 添加 URI"**
   - 添加以下地址：
     ```
     http://localhost:3000/api/auth/google/callback
     https://你的生产域名/api/auth/google/callback
     ```
7. 点击 **"创建"（Create）**
8. 系统会弹出对话框，显示：
   - **客户端 ID**（Client ID）：形如 `xxxxx.apps.googleusercontent.com`
   - **客户端密钥**（Client Secret）：形如 `GOCSPX-xxxxx`
9. **务必复制并安全保存这两个值**

---

## 第四步：配置项目环境变量

### 本地开发环境

编辑项目根目录下的 `.env.local` 文件，添加：

```bash
# Google OAuth
GOOGLE_CLIENT_ID=你的客户端ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-你的客户端密钥
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### 生产环境（Vercel）

在 Vercel 项目设置中添加环境变量：

1. 进入 Vercel 项目 Dashboard > Settings > Environment Variables
2. 添加以下变量（Scope 选择 Production）：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `GOOGLE_CLIENT_ID` | `xxxxx.apps.googleusercontent.com` | OAuth 客户端 ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxx` | OAuth 客户端密钥（标记为 Sensitive） |
| `GOOGLE_REDIRECT_URI` | `https://你的域名/api/auth/google/callback` | 生产环境回调地址 |

> **重要**：`GOOGLE_CLIENT_SECRET` 应标记为 Sensitive，防止在 Vercel 日志中暴露。

---

## 第五步：发布应用（可选）

如果需要所有 Google 用户都能登录（而不仅限于测试用户），需要发布应用：

1. 在左侧导航栏点击 **"Audience"**
2. 点击 **"Publish App"**
3. 确认发布

> **注意**：如果应用请求的权限仅限于 `openid`、`email`、`profile`（非敏感权限），则无需通过 Google 的审核验证流程，发布后立即生效。

---

## 第六步：验证配置

### 本地测试

1. 确保 `.env.local` 中已配置正确的环境变量
2. 启动开发服务器：`npm run dev`
3. 访问 `http://localhost:3000/zh/login`
4. 点击 "使用 Google 账号登录" 按钮
5. 应该被重定向到 Google 登录页面
6. 选择测试用户账号并授权
7. 应该被重定向回 `http://localhost:3000/zh/cards` 并已登录

### 常见问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| redirect_uri_mismatch | 回调 URI 不匹配 | 确保 Google Console 中的重定向 URI 与 `GOOGLE_REDIRECT_URI` 完全一致 |
| invalid_client | 客户端 ID 或密钥错误 | 检查环境变量是否正确复制 |
| access_denied | 用户不在测试用户列表 | 在 OAuth 同意屏幕中添加测试用户，或发布应用 |
| 登录后无法访问 | Cookie 设置问题 | 确保本地使用 `http://localhost:3000`（非 127.0.0.1） |

---

## OAuth 流程说明

```
用户点击 "Google 登录"
       │
       ▼
GET /api/auth/google
  → 生成 state 参数
  → 存入 Cookie
  → 返回 Google 授权 URL
       │
       ▼
用户跳转到 Google 授权页
  → 选择账号
  → 同意授权
       │
       ▼
Google 回调 GET /api/auth/google/callback?code=xxx&state=xxx
  → 验证 state（CSRF 保护）
  → 用 code 向 Google 换取 access_token
  → 用 access_token 获取用户信息（sub, email, name）
  → 查找或创建本地用户
  → 签发 JWT、设置 Cookie
  → 重定向到 /cards
```

---

## 安全注意事项

1. **Client Secret 保密**：永远不要将 `GOOGLE_CLIENT_SECRET` 暴露在前端代码或 Git 仓库中
2. **State 参数**：使用加密的 JWT 作为 state，有效期 10 分钟，防止 CSRF 攻击
3. **回调地址严格匹配**：Google 会严格校验 redirect_uri，需与 Console 中配置完全一致
4. **HTTPS**：生产环境必须使用 HTTPS
5. **Cookie 安全**：所有认证相关 Cookie 均设置 `httpOnly` 和 `secure`（生产环境）属性
