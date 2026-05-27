# API 路由设计

> 相关文件：`src/app/api/`

## 概述

API 层使用 Next.js App Router 的 Route Handlers，所有 API 路由均在 `/api/` 前缀下。除认证相关端点外，所有 API 均需要有效的 JWT Token（通过中间件统一拦截）。

## API 端点总览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | ~~用户注册~~（已禁用，返回 403） | 否 |
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/auth/logout` | 用户登出 | 是 |
| GET | `/api/auth/me` | 获取当前用户 | 是 |
| POST | `/api/auth/change-password` | 修改密码 | 是 |
| GET | `/api/cards` | 名片列表（分页+搜索） | 是 |
| POST | `/api/cards` | 创建名片 | 是 |
| GET | `/api/cards/[id]` | 获取名片详情 | 是 |
| PUT | `/api/cards/[id]` | 更新名片字段 | 是 |
| DELETE | `/api/cards/[id]` | 删除名片 | 是 |
| POST | `/api/cards/[id]/recognize` | 触发 AI 识别 | 是 |
| POST | `/api/upload` | 上传图片 | 是 |
| DELETE | `/api/upload/[id]` | 删除孤儿图片 | 是 |
| GET | `/api/images/[id]` | 获取图片内容（代理） | 是 |
| GET | `/api/llm-logs` | LLM 日志列表 | 是 |
| GET | `/api/llm-logs/[id]` | LLM 日志详情 | 是 |

## 通用响应格式

### 成功响应

```json
{
  "data": [...],
  "pagination": { "page": 1, "pageSize": 12, "total": 50, "totalPages": 5 }
}
```

或直接返回对象：

```json
{ "id": "...", "fullName": "..." }
```

### 错误响应

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

常见错误码：
- `UNAUTHORIZED` — 未认证（401）
- `NOT_FOUND` — 资源不存在（404）
- `INVALID_CREDENTIALS` — 用户名/密码错误（401）
- `USERNAME_TAKEN` — 用户名已占用（409）
- `NO_IMAGES` — 缺少图片（400）
- `NOT_A_BUSINESS_CARD` — 非名片图片（422）
- `PROCESSING_FAILED` — LLM 处理失败（502）
- `INTERNAL_ERROR` — 服务器内部错误（500）
- `CURRENT_PASSWORD_WRONG` — 当前密码错误（401）
- `SAME_PASSWORD` — 新密码与当前密码相同（400）

## 详细接口文档

### GET /api/cards

获取当前用户的名片列表，支持分页和模糊搜索。

**查询参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| q | string | "" | 搜索关键词 |
| page | number | 1 | 页码 |
| pageSize | number | 12 | 每页数量（最大 50） |

**搜索字段**（不区分大小写 LIKE）：
fullName、nameReading、company、title、email、phone、address、department、notes

**响应：**
```json
{
  "data": [
    {
      "id": "clu...",
      "fullName": "张三",
      "company": "某公司",
      "title": "工程师",
      "recognitionStatus": "SUCCESS",
      "images": [{ "id": "...", "storageUrl": "...", "side": "FRONT" }],
      "createdAt": "2026-05-25T..."
    }
  ],
  "pagination": { "page": 1, "pageSize": 12, "total": 35, "totalPages": 3 }
}
```

### POST /api/cards

创建名片记录并关联已上传的图片。

**请求体：**
```json
{
  "frontImageId": "clu...",  // 至少提供一个
  "backImageId": "clu..."    // 可选
}
```

**逻辑：**
1. 创建 Card 记录（状态 PENDING）
2. 将 CardImage 的 `cardId` 从 null 更新为新 Card ID
3. 返回完整 Card 对象

### PUT /api/cards/[id]

更新名片信息字段。

**允许更新的字段：**
fullName、nameReading、company、title、email、phone、mobilePhone、address、website、department、fax、notes

**安全机制：**
- 使用 `updateMany` + `where: { id, userId }` 双重验证
- 空字符串转换为 null（清除字段值）

### DELETE /api/cards/[id]

删除名片及其所有关联资源。

**删除步骤：**
1. 验证名片归属（`userId` 匹配）
2. 从存储中删除所有图片文件（错误时静默）
3. 数据库级联删除 Card → CardImage + LlmLog

### POST /api/cards/[id]/recognize

触发名片 AI 识别。详见 [LLM 模块文档](../llm/llm.md)。

### POST /api/upload

上传名片图片，含预处理和卡片检测。

**请求格式：** `multipart/form-data`
| 字段 | 类型 | 说明 |
|------|------|------|
| file | File | 图片文件 |
| side | string | "FRONT" 或 "BACK" |

**限制：**
- 最大文件大小：10MB
- 允许类型：JPEG、PNG、HEIC、WebP、HEIF

**处理流程：**
1. 文件类型/大小验证
2. Sharp 预处理（旋转、缩放、转 JPEG）
3. 上传到存储
4. LLM 卡片检测 + 裁剪
5. 替换存储文件为裁剪后版本
6. 返回 CardImage 信息

详见 [存储模块文档](../storage/storage.md)。

### DELETE /api/upload/[id]

删除未关联到 Card 的孤儿图片。

**限制：** 仅允许删除 `cardId === null` 的图片（安全措施：已关联的图片只能通过删除 Card 间接删除）。

### GET /api/images/[id]

图片内容代理。详见 [存储模块文档](../storage/storage.md)。

## 工具函数 (lib/utils.ts)

```typescript
apiResponse(data, status?)     // 构建 JSON 响应
apiError(error)                // 统一错误响应处理
paginate(page, pageSize, total) // 分页信息计算

class ApiError {
  constructor(statusCode, code, message)
}
```

所有 API 路由使用 try/catch + `apiError()` 统一处理异常，确保响应格式一致。
