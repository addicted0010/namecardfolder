---
trigger: always_on
alwaysApply: true
---
# 代码改动后必须同步更新文档

每次对项目代码进行改动后，都必须同步检查并更新项目中所有相关的文档，使其能反映最新的逻辑。

## 需要检查的文档

- Documents/design.md（总体架构设计）
- Documents/ 下各子模块文档（auth/、storage/、llm/、api/、frontend/、database/）
- README.md（项目说明）
- DEPLOY.md（部署文档）

## 执行要求

- 更新范围根据代码改动涉及的模块确定，确保文档与代码始终保持一致
- 文档更新必须作为代码改动任务的一部分，在代码修改完成后立即执行，不需要用户额外提醒
- 如果改动仅涉及样式调整或不影响架构/API/功能逻辑的微小变更，可跳过文档更新
