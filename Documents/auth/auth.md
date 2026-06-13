# 认证模块

> 相关文件：
> - `src/lib/auth.ts` — 认证核心逻辑
> - `src/middleware.ts` — 请求拦截与路由保护
> - `src/contexts/auth-context.tsx` — 前端认证状态管理
> - `src/app/api/auth/` — 认证 API 路由
> - `Documents/google-oauth/google-oauth.md` — Google OAuth 配置指南

## 概述

认证模块采用 **JWT + HttpOnly Cookie** 方案，支持两种登录方式：
1. **用户名 + 密码登录**（传统方式）
2. **Google OAuth 2.0 登录**（第三方授权）

两种登录方式最终都签发相同格式的 JWT Token，前端无需感知差异。Token 有效期 7 天，存储在浏览器的 HttpOnly Cookie 中，防止 XSS 攻击。

## 架构图

```mermaid
graph TB
    Login[密码登录请求] --> API[/api/auth/login]
    API --> Verify[bcrypt 密码验证]
    Verify --> Sign[jose 签发 JWT]
    Sign --> Cookie[设置 HttpOnly Cookie]
    Cookie --> Client[返回用户信息]
    
    Google[Google 登录] --> OAuth[/api/auth/google]
    OAuth --> Redirect[重定向到 Google 授权页]
    Redirect --> Callback[/api/auth/google/callback]
    Callback --> Exchange[code 换取 token]
    Exchange --> UserInfo[获取 Google 用户信息]
    UserInfo --> FindCreate[查找/创建用户]
    FindCreate --> Sign
    
    Request[后续请求] --> MW[Middleware]
    MW --> Extract[提取 Cookie Token]
    Extract --> JWTVerify[jose 验证 JWT]
    JWTVerify -->|有效| Pass[放行]
    JWTVerify -->|无效| RedirectLogin[重定向到登录页]
```

## 核心组件

### 1. 密码处理

```typescript
hashPassword(password)    // bcrypt hash, cost=12
verifyPassword(password, hash)  // bcrypt compare
```

### 2. JWT Token

- **算法**：HS256
- **密钥**：`JWT_SECRET` 环境变量
- **载荷**：`{ sub: userId, iat, exp }`
- **有效期**：7 天

```typescript
signToken(userId)    // 创建 JWT
verifyToken(token)   // 验证 JWT，返回 payload 或 null
```

### 3. Cookie 管理

```typescript
setAuthCookie(token)   // 设置 HttpOnly Cookie
clearAuthCookie()      // 删除 Cookie（登出）
getAuthToken()         // 从请求中读取 Token
```

Cookie 配置：
- `httpOnly: true` — 防止 JS 读取
- `secure: true`（生产环境）— 仅 HTTPS 传输
- `sameSite: "lax"` — 防止 CSRF
- `maxAge: 7天`

### 4. 认证辅助函数

```typescript
authenticate()           // 验证当前请求，返回 { userId } 或 null
authenticateOrThrow()    // 同上，但未认证时抛出异常
getCurrentUser()         // 查询完整用户信息（含 isAdmin 标识）
```

### 5. 权限控制（管理员）

用户表包含 `isAdmin` 布尔字段（默认 `false`）。管理员标识由 `getCurrentUser()` 返回，并通过 `/api/auth/me` 暴露给前端。当前仅用于控制 **LLM 调试日志**的可见性：只有管理员用户在名片详情页才会看到「查看日志」按钮。

**如何指定管理员**（不在仓库中硬编码任何邮箱）：

1. **环境变量 `ADMIN_EMAILS`**（逗号分隔，大小写不敏感）：当用户通过 Google 登录、且其 **已验证邮箱**（`email_verified === true`）命中该列表时，回调逻辑会自动将该用户 `isAdmin` 置为 `true`（`src/app/api/auth/google/callback/route.ts` 中的 `isAdminEmail()` 判定）。该机制只提升、不降级。
2. **种子账户**：`npm run db:seed` 创建的初始账户默认 `isAdmin: true`，其 `email` 取自 `ADMIN_EMAILS` 的第一项——这样用同一邮箱的 Google 账号登录会绑定到该管理员账户（取代了过去在迁移文件中硬编码邮箱的做法）。

> 安全说明：`getJwtSecret()` 不再回退到公开的默认密钥。生产环境若 `JWT_SECRET` 缺失会直接抛错（fail-closed）；密钥短于 32 位仅打印警告。`middleware.ts` 在 Edge 运行时内联了同样的逻辑。

## 中间件 (middleware.ts)

中间件运行在 Edge Runtime（不依赖 Node.js API），处理两类路由：

### API 路由保护

```
/api/auth/login    → 公开（无需认证）
/api/auth/register → 公开（已禁用，返回 403）
/api/auth/google   → 公开（Google OAuth 发起）
/api/auth/google/callback → 公开（Google OAuth 回调）
/api/cron/*        → 公开（通过 CRON_SECRET 自行验证）
/api/*             → 需要有效 JWT，否则返回 401 JSON
```

### 页面路由保护

```
/{locale}/login          → 公开
/{locale}/register       → 重定向到登录页（注册已禁用）
/{locale}/privacy-policy → 公开（隐私政策）
/{locale}/terms-of-service → 公开（服务条款）
/{locale}/*              → 需要有效 JWT，否则重定向到登录页
```

中间件执行顺序：
1. 判断是否为 API 路由 → 按 API 逻辑处理
2. 执行 `next-intl` 中间件（处理 locale 路由）
3. 提取 `pathWithoutLocale`，判断是否为公开页面
4. 非公开页面验证 JWT，无效则重定向到 `/{locale}/login?redirect=原始路径`

### Edge Runtime 适配

中间件使用 `jose` 库（纯 JS 实现）替代 Node.js 的 `jsonwebtoken`，因为 Edge Runtime 不支持 Node.js 原生模块。JWT 验证逻辑在中间件中单独实现（不导入 `lib/auth.ts`，因后者依赖 Prisma）。

## 前端认证上下文 (auth-context.tsx)

```typescript
AuthProvider   // 包裹应用，提供认证状态
useAuth()      // Hook: { user, loading, login, logout }
```

初始化流程：
1. 组件挂载时调用 `GET /api/auth/me`
2. 若返回用户数据 → 设置 `user` 状态
3. 若返回错误 → `user` 保持 null（未登录状态）

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | ~~注册~~（已禁用，返回 403） |
| `/api/auth/login` | POST | 密码登录 |
| `/api/auth/logout` | POST | 登出（清除 Cookie） |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/auth/change-password` | POST | 修改密码 |
| `/api/auth/google` | GET | 发起 Google OAuth 流程 |
| `/api/auth/google/callback` | GET | Google OAuth 回调处理 |

### 注册流程（已禁用）

当前注册功能已关闭，API 端点直接返回 `403 REGISTRATION_DISABLED`，注册页面重定向到登录页。用户只能通过管理员手动创建（seed 或直接操作数据库）。

### 登录流程

1. 验证必填字段
2. 按 username 查询用户
3. 检查 passwordHash 是否存在（纯 Google 用户返回 `GOOGLE_ONLY_ACCOUNT` 错误）
4. bcrypt 比对密码
5. 签发 JWT + 设置 Cookie
6. 返回用户信息

### Google OAuth 登录流程

1. 前端请求 `GET /api/auth/google`
2. 服务端生成 state 参数（JWT 加密，10 分钟有效），存入 Cookie
3. 返回 Google 授权 URL
4. 前端跳转到 Google 授权页面
5. 用户在 Google 页面选择账号并授权
6. Google 回调 `GET /api/auth/google/callback?code=xxx&state=xxx`
7. 服务端验证 state（CSRF 防护）
8. 用 authorization code 向 Google Token 端点换取 access_token
9. 用 access_token 获取用户信息（sub, email, name）
10. 查找或创建用户：
    - 优先按 `googleId` 查找已绑定用户
    - 若无，按 `email` 查找现有用户 → 自动关联 googleId
    - 若都无，创建新用户（username 取邮箱前缀，自动去重）
11. 签发 JWT + 设置 Cookie
12. 重定向到 `/cards` 页面

### 修改密码流程

1. 验证当前用户已认证（`authenticateOrThrow`）
2. 验证必填字段（currentPassword, newPassword）
3. 新密码长度 ≥ 6
4. 若用户有 passwordHash（密码用户）：bcrypt 比对当前密码是否正确，检查新密码不能与当前密码相同
5. 若用户无 passwordHash（纯 Google 用户首次设置密码）：跳过当前密码验证
6. bcrypt 加密新密码并更新数据库
7. 清除 Cookie（强制重新登录）
8. 前端跳转到登录页
