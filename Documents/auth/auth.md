# 认证模块

> 相关文件：
> - `src/lib/auth.ts` — 认证核心逻辑
> - `src/middleware.ts` — 请求拦截与路由保护
> - `src/contexts/auth-context.tsx` — 前端认证状态管理
> - `src/app/api/auth/` — 认证 API 路由

## 概述

认证模块采用 **JWT + HttpOnly Cookie** 方案，无第三方认证服务依赖。Token 有效期 7 天，存储在浏览器的 HttpOnly Cookie 中，防止 XSS 攻击。

## 架构图

```mermaid
graph TB
    Login[登录请求] --> API[/api/auth/login]
    API --> Verify[bcrypt 密码验证]
    Verify --> Sign[jose 签发 JWT]
    Sign --> Cookie[设置 HttpOnly Cookie]
    Cookie --> Client[返回用户信息]
    
    Request[后续请求] --> MW[Middleware]
    MW --> Extract[提取 Cookie Token]
    Extract --> JWTVerify[jose 验证 JWT]
    JWTVerify -->|有效| Pass[放行]
    JWTVerify -->|无效| Redirect[重定向到登录页]
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
getCurrentUser()         // 查询完整用户信息
```

## 中间件 (middleware.ts)

中间件运行在 Edge Runtime（不依赖 Node.js API），处理两类路由：

### API 路由保护

```
/api/auth/login    → 公开（无需认证）
/api/auth/register → 公开（已禁用，返回 403）
/api/cron/*        → 公开（通过 CRON_SECRET 自行验证）
/api/*             → 需要有效 JWT，否则返回 401 JSON
```

### 页面路由保护

```
/{locale}/login    → 公开
/{locale}/register → 重定向到登录页（注册已禁用）
/{locale}/*        → 需要有效 JWT，否则重定向到登录页
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
| `/api/auth/login` | POST | 登录 |
| `/api/auth/logout` | POST | 登出（清除 Cookie） |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/auth/change-password` | POST | 修改密码 |

### 注册流程（已禁用）

当前注册功能已关闭，API 端点直接返回 `403 REGISTRATION_DISABLED`，注册页面重定向到登录页。用户只能通过管理员手动创建（seed 或直接操作数据库）。

### 登录流程

1. 验证必填字段
2. 按 username 查询用户
3. bcrypt 比对密码
4. 签发 JWT + 设置 Cookie
5. 返回用户信息

### 修改密码流程

1. 验证当前用户已认证（`authenticateOrThrow`）
2. 验证必填字段（currentPassword, newPassword）
3. 新密码长度 ≥ 6
4. bcrypt 比对当前密码是否正确
5. 检查新密码不能与当前密码相同
6. bcrypt 加密新密码并更新数据库
7. 清除 Cookie（强制重新登录）
8. 前端跳转到登录页
