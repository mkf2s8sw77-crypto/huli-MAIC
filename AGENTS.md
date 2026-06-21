# AGENT.md

本文档是本仓库的项目级执行规则入口。
它只保留最核心、最常被违反、最需要先看到的规则。

深入理解项目背景、fork 策略和长期维护边界，请阅读：
`FORK_UPSTREAM_PRINCIPLES.md`、`PROJECT_HANDOVER.md`、`.env.example`

---

## 1. 项目定位

基于上游 `THU-MAIC/OpenMAIC` 持续二开的长期 fork。

默认认知：

- 要长期维护，后续仍会持续吸收 upstream 更新
- 任何改动都应考虑未来与 upstream 的可合并性

---

## 2. 开发默认原则

### 2.1 配置优先于硬编码

所有环境差异优先通过配置解决（basePath、域名、端口、provider、API Key、开关项）。换环境需要改源码，通常说明设计不合理。

### 2.2 服务端配置优先于前端配置

生产环境模型与媒体服务的真实密钥必须以服务端配置为主。不把生产 key 只存浏览器，不依赖 localStorage 作为真配置源。

### 2.3 保持 thin fork

默认优先级：新增文件 > 新增模块 > 新增适配层 > 改上游核心文件。能新增解决就不要侵入性修改。

---

## 3. 明确红线

### 3.1 不要提交密钥

禁止提交 `.env.local`、真实 API key、本地临时密钥文件、含密钥的测试样例。新增密钥类配置只更新 `.env.example`。

### 3.2 不要写死子路径

禁止在业务代码里写死 `/maic`、`/demo` 等环境专用路径。所有路径必须兼容根路径部署和子路径部署。

### 3.3 不要做无业务价值的大改动

禁止大规模重命名、无必要的文件搬迁、批量格式化上游核心文件、只为"看起来整齐"的重构。这些都会显著增加与 upstream 合并冲突。

### 3.4 不要弱化开源合规入口

源码、许可证、开源说明入口不能随意删除或弱化。品牌化不等于去掉上游归属与许可证义务。

### 3.5 不要混淆 `dev` 与 `sys` 的维护边界

- `dev.huli.sh.cn`：当前机器上的预发布共享入口
- `sys.huli.sh.cn`：生产环境，不属于当前机器的默认推断范围

未确认责任边界前，不要在这台机器上擅自修改 `sys.huli.sh.cn`、`19000`、任何生产入口反代假设。

---

## 4. 高风险区域

以下区域默认属于高冲突区，修改前要先确认是否真的必须动：

- provider / settings / i18n
- generation pipeline
- audio / media provider 抽象层
- store 层
- 导出层
- 课堂主画布与布局层

---

## 5. 当前项目必须长期保持的约束

### 5.1 `basePath` 必须配置化

所有"回首页"入口必须走统一 helper 或 `withBasePath('/')`，不要手写 `/`。

关键文件：

- 服务端：`lib/server/app-url.ts` — origin / baseUrl 推导
- 客户端：`lib/utils/base-path.ts` — `withBasePath` / `stripBasePath`
- 公共资源：`lib/utils/public-asset.ts` — logo / avatar / provider icon URL

启动期环境自检在 `lib/server/env-check.ts`，通过 `instrumentation.ts` 执行。

### 5.2 媒体能力是服务端统一编排

LLM、Image、TTS、ASR、PDF、Web Search 都属于多 provider 能力。扩 provider 时必须补全：类型、常量、服务端配置映射、实现、settings store、i18n、UI。

### 5.3 比例是课程级能力

`16:9 / 4:3 / 3:4 / 9:16` 是课程级配置，修改时必须同时考虑生成、课堂显示、缩略图、导出。

竖版（3:4 / 9:16）slide 内容生成在 `scene-generator.ts` 内通过 `isPortrait` 分流：横版走 AI 自由排版，竖版走 `generatePortraitSlide()`（manifest → 模板引擎），竖版禁图、强制大字号、纵向堆叠。相关实现在 `portrait-content-schema.ts`、`portrait-template-engine.ts`、`portrait-layout-linter.ts`。横版完全不受影响。

移动端专注阅读模式在 `components/stage-shell/mobile-shell.tsx`，仅 playback 模式下可切换。

### 5.4 头像必须有 fallback

agent 头像不是完全可信输入。任何头像链路都必须保留：归一化、fallback、basePath 兼容。

### 5.5 `dev` 预发布走共享 gateway

- 共享 host：`dev.huli.sh.cn`
- 共享 gateway：`/opt/homebrew/etc/nginx/servers/dev-huli-gateway.conf`
- `app-deploy` 负责接入，不要造单项目 gateway
- `dev-huli-gateway-tunnel` 工作目录：`/Users/huli-dev/.infra/dev-huli-gateway`
- MAIC 子路径规范化：`/maic/ -> /maic`
- `/maic` standalone 发布必须在 build 阶段设置 `NEXT_PUBLIC_BASE_PATH=/maic`，并同步 `.next/static` 与 `public` 到 `.next/standalone/`

### 5.6 账号体系与数据持久化

基于 Auth.js + SQLite + Drizzle ORM。业务主链路不再依赖 IndexedDB 作为真源，Dexie 仅保留 TTS 音频缓存、PDF 图片缓存、undo/redo 快照。

安全要点：媒体文件读写有路径遍历防护，上传/下载均需 owner 校验。旧 `/api/classroom` 和 `/api/generate-classroom` 返回 410 Gone。

关键文件：`lib/server/db/schema.ts`、`*-repository.ts`、`lib/server/media-storage.ts`、
`app/api/stages/[id]/*`、`app/api/media/[...path]/`

环境变量：`AUTH_SECRET`（必须）、`DATABASE_URL`（可选，默认 `./data/maic.db`）、
`MEDIA_STORAGE_PATH`（可选，默认 `./data/media`）

### 5.7 当前业务界面与新生成内容只保留简体中文

不要新增外语切换入口。首页、课堂等业务 UI 以及新生成课程内容默认固定为 `zh-CN`。

---

## 6. 与 upstream 同步前的默认要求

执行 upstream merge 前：工作区必须干净，先提交当前改动，不要在一堆未提交修改上直接 merge。

如果发生冲突：优先保留上游 bugfix / 安全修复 / 兼容性修复，同时尽量保留本项目已有业务化能力，不要为了图快删掉重要能力。

---

## 7. 推荐阅读顺序

1. `AGENT.md`
2. `FORK_UPSTREAM_PRINCIPLES.md`
3. `PROJECT_HANDOVER.md`
4. `.env.example`

---

## 8. 一句话版默认行为

如果没有更具体的说明，默认按下面做：

- 这是长期 fork，不是一次性魔改
- 配置优先，不写死
- 服务端配置优先，不把 key 放前端
- 少改核心，多做扩展
- 不提交密钥
- 改动前考虑 upstream 冲突
