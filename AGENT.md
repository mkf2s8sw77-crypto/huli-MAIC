# AGENT.md

本文档是本仓库的项目级执行规则入口。  
它只保留最核心、最常被违反、最需要先看到的规则。

如果你要深入理解项目背景、fork 策略和长期维护边界，请继续阅读：

- `FORK_UPSTREAM_PRINCIPLES.md`
- `PROJECT_HANDOVER.md`

---

## 1. 项目定位

本项目不是独立从零开发的新项目，而是基于上游 `THU-MAIC/OpenMAIC` 持续二开的长期 fork。

默认认知必须是：

- 这是一个要长期维护的 fork
- 后续仍会持续吸收 upstream 更新
- 任何改动都应考虑未来与 upstream 的可合并性

---

## 2. 开发默认原则

### 2.1 配置优先于硬编码

所有环境差异优先通过配置解决，不要写死在代码里。

包括但不限于：

- `basePath`
- 域名
- 端口
- provider
- API Key
- 开关项
- 面向外部用户是否展示某些入口

如果换环境需要改源码，通常说明设计不够合理。

### 2.2 服务端配置优先于前端配置

正式环境、预发布环境、对外服务环境，模型与媒体服务的真实密钥必须以服务端配置为主。

默认要求：

- 不把生产 key 只存浏览器
- 不依赖前端 localStorage 作为真实配置源
- 前端设置页可以展示、只读、补充，但不应成为生产主入口

### 2.3 保持 thin fork

默认优先级：

1. 新增文件
2. 新增模块
3. 新增适配层
4. 最后才改上游核心文件

能新增解决，就不要侵入性修改。  
能外围扩展解决，就不要重写上游主流程。

---

## 3. 明确红线

### 3.1 不要提交密钥

禁止提交：

- `.env.local`
- 任意真实 API key
- 本地临时密钥文件
- 含密钥的测试样例

新增密钥类配置时：

- 只更新 `.env.example`
- 不提交真实值

### 3.2 不要写死子路径

禁止在业务代码里写死：

- `/maic`
- `/demo`
- 任意环境专用路径

所有路径必须兼容：

- 根路径部署
- 子路径部署

### 3.3 不要做无业务价值的大改动

默认禁止：

- 大规模重命名
- 无必要的文件搬迁
- 批量格式化上游核心文件
- 只为“看起来更整齐”而做的重构

因为这些都会显著增加与 upstream 合并冲突。

### 3.4 不要弱化开源合规入口

如果对外提供服务，源码、许可证、开源说明入口不能被随意删除或弱化。  
品牌化不等于去掉上游归属与许可证义务。

### 3.5 不要混淆 `dev` 与 `sys` 的维护边界

默认边界必须是：

- `dev.huli.sh.cn`：当前机器上的预发布共享入口
- `sys.huli.sh.cn`：生产环境，不属于当前机器的默认推断范围

未确认责任边界前，不要在这台机器上擅自修改：

- `sys.huli.sh.cn`
- `19000`
- 任何生产入口反代假设

---

## 4. 高风险区域

以下区域默认属于高冲突区，修改前要先确认是否真的必须动：

- provider / settings / i18n
- generation pipeline
- audio / media provider 抽象层
- store 层
- 导出层
- 课堂主画布与布局层

这些区域一旦改动，后续同步 upstream 很容易冲突。

---

## 5. 当前项目必须长期保持的约束

### 5.1 `basePath` 必须配置化

相关路径兼容性是长期要求，不是一次性部署技巧。

### 5.2 媒体能力是服务端统一编排

LLM、Image、TTS、ASR、PDF、Web Search 都属于应用编排的多 provider 能力。  
扩 provider 时必须补全：

- 类型
- 常量
- 服务端配置映射
- 实现
- settings store
- i18n
- UI

### 5.3 比例是课程级能力

`16:9 / 4:3 / 3:4 / 9:16` 这类比例不是导出按钮的小选项，而是课程级配置。
修改比例能力时必须同时考虑：

- 生成
- 课堂显示
- 缩略图
- 导出

竖版（3:4 / 9:16）下，slide 内容生成已通过 `canvas_orientation` + `orientation_design_rules` 变量向 prompt 注入方向感知规则（禁止三栏、强制纵向堆叠、要求内容覆盖 80% 画布高度）。相关实现在：
- `lib/generation/scene-generator.ts` → `buildSlideOrientationRules()`
- `lib/generation/prompts/templates/slide-content/system.md` → Orientation-Aware Design Rules 节

竖版版式质量专项优化（Phase 6）已完成：
- 在 `buildSlideOrientationRules()` 中增加三个新节：
  1. **Portrait Page Archetypes**：6 种页面原型（封面/概念/对比/步骤/提示/总结），要求模型选一个原型后按其结构生成
  2. **Portrait Visual Hierarchy**：强制要求标题栏使用彩色 ShapeElement 作为视觉锚点、身体文字左对齐、一个主导卡片、禁止"全居中堆叠"反模式
  3. **Portrait Media Strategy**：明确三种媒体结构角色（主视觉/步骤配图/概念图），以及何时应省略图片
- 横版分支完全未改动

竖版专用字号体系（手机可读性，Phase 4）已在 `buildSlideOrientationRules()` 中实现：
- 原理：画布宽 1000px，手机约 390px，缩放比 ~0.35×，18-20px 字体渲染为 ~7px（不可读）
- 竖版字号规则：主标题 64-72px、分区标题 48-56px、正文 44-52px、标签 36-40px、图注 32-36px
- 竖版密度规则：正文块 ≤ 3 行、整页 ≤ 5 条要点、标题 ≤ 12 中文字
- 横版课程：字号规则不变，仅竖版分支生效
- Height Lookup Table 已扩展至 72px（`system.md` 中）

竖版版式质检 + 可读性质检 + 视觉层级质检 + 自动返修（Phase 3 + Phase 5 + Phase 6）已在 `generateSlideContent` 末端实现，仅对 isPortrait 激活：
- 实现：`lib/generation/portrait-layout-linter.ts` → `lintPortraitLayout()` + `repairPortraitLayout()`
- 版式检测规则：`low-coverage`（底部 < 60% 高度）、`upper-heavy`（上半区面积 > 78%）、`three-column`（同行 3+ 窄元素）
- 可读性检测规则（Phase 5）：
  - `small-font-size`：正文区（top > 150px）字号 < 44px；任意位置字号 < 32px（绝对最低）
  - `dense-text-block`：文本块含 3+ 个 `<p>` 且高度 < 段落数 × 55px，推测溢出/拥挤
- 视觉层级检测规则（Phase 6）：
  - `flat-hierarchy`：正文区（top ≥ 200px）≥ 3 个文本块居中对齐 + 无彩色标题栏 ShapeElement — "居中堆叠"反模式
- 返修链路：
  - 版式违规：只调整 left/top/width/height
  - 可读性违规：额外允许修改 content HTML 中的 font-size px 值
  - 层级违规（flat-hierarchy）：额外允许修改 content HTML 中的 text-align（center→left）
  - 最多 MAX_REPAIR_ATTEMPTS=2 次，超限兜底
- 横版课程完全不进入此链路

竖版模板排版引擎（Phase 7）已完成，取代"AI 自由排版坐标"路径：
- 新文件：
  - `lib/generation/portrait-content-schema.ts` → PortraitContentManifest 类型 + 校验
  - `lib/generation/portrait-manifest-prompt.ts` → AI 提取 manifest 的 prompt 构建函数
  - `lib/generation/portrait-template-engine.ts` → manifest → elements 渲染引擎 + 文本 fitting
- 修改文件：
  - `lib/generation/portrait-layout-linter.ts` → 新增 hero-too-small / lower-half-empty / archetype-incomplete 3 条规则
  - `lib/generation/scene-generator.ts` → 新增 generatePortraitSlide() + portrait 分流（Phase 7 分支在旧 aiCall 之前，节省 AI 调用）
- AI 决定：archetype 选型、标题文字、hero/card 内容、图片角色
- 程序决定：所有坐标、块高度（文本 fitting）、堆叠节奏
- 失败降级：manifest 解析失败时自动回退旧路径，不影响生成流程
- 横版完全不受影响（分流在 isPortrait 分支内）

竖版大纲生成（scene outline 阶段）已通过 `outline_orientation_rules` 变量实现拆页差异化，相关实现：
- `lib/generation/outline-generator.ts` → `buildOutlineOrientationRules()`（已导出）
- `lib/generation/prompts/templates/requirements-to-outlines/system.md` → Orientation-Aware Outline Design 节
- `app/api/generate/scene-outlines-stream/route.ts` → buildPrompt 调用注入 outline_orientation_rules
- 竖版规则：1-2 keyPoints/scene、每分钟 1.5-2.5 场景、禁止并列总览、比较内容拆成逐页展开
- 横版规则：3-5 keyPoints/scene、每分钟 1-2 场景、保持原有紧凑度

竖版内容 manifest 已通过 `lib/generation/portrait-content-schema.ts` 标准化定义：
- `PortraitArchetype`：6 种页面原型（lead/concept/compare/steps/tip/summary）
- `PortraitContentManifest`：顶层结构，包含标题、主卡片、最多 3 张支撑卡片、图片角色、主题色
- `isValidManifest()`：宽松校验函数，只检查必要字段，允许 AI 产出不完美的结果
- 这是 AI 理解内容、程序排版的中间表示层（MIR）

移动端专注阅读模式已在 `components/stage-shell/mobile-shell.tsx` 实现：
- 触发条件：仅 playback 模式（hasRoundtable=true）下显示切换按钮
- 进入后：Header 折叠（CSS transition，DOM 保留）+ Roundtable 不渲染 + Canvas 占满全高
- 可用面积：390×844 手机竖屏 playback 模式下从 572px 升至 844px（+47.6%）
- 实现范围：100% 在 MobileShell 内部，无跨文件副作用，DesktopShell 不受影响
- 注意：专注模式下 Roundtable 不渲染（含播放控制和讨论输入），但 CanvasArea 自有 toolbar 仍可播放/导航/聊天

### 5.4 头像必须有 fallback

agent 头像不是完全可信输入。  
任何角色/agent 头像链路都必须保留：

- 归一化
- fallback
- basePath 兼容

### 5.5 `dev` 预发布走共享 gateway

当前这台机器上的预发布环境，不是“一个项目一个独立 host 文件”，而是：

- 一个共享 host：`dev.huli.sh.cn`
- 一个本机共享 gateway 文件：`/opt/homebrew/etc/nginx/servers/dev-huli-gateway.conf`
- 多个项目通过不同 path 挂载

默认发布认知必须是：

- `app-deploy` 负责把服务接入本机共享 gateway
- 公网可达依赖现成 ingress 层
- 不要为了新增一个 path 服务，再造一套单项目 gateway 结构
- `dev-huli-gateway-tunnel` 的 PM2 工作目录已迁到 `/Users/huli-dev/.infra/dev-huli-gateway`；旧的 `Documents/_infra` 不再是这条 tunnel 的依赖路径
- MAIC 当前对子路径的规范化是 `/maic/ -> /maic`；共享 gateway 上 `location = /maic` 必须直接代理 upstream，不能再强制跳回 `/maic/`

### 5.6 当前没有中心化账号体系

当前用户身份是浏览器本地 profile，不是服务端账号系统：

- 用户资料仅包含 `avatar / nickname / bio`，保存在 `localStorage`
- 课程、聊天、媒体等数据保存在浏览器 `IndexedDB`
- 当前不存在注册 / 登录 / 组织 / 权限分级 / 多用户隔离表结构

如果后续要接入真实账号体系，必须先明确本地数据迁移与兼容策略，不能默认把当前本地 profile 当成可鉴权账号。

---

## 6. 与 upstream 同步前的默认要求

执行 upstream merge 前：

- 工作区必须干净
- 先提交当前改动
- 不要在一堆未提交修改上直接 merge upstream

如果发生冲突：

- 优先保留上游 bugfix / 安全修复 / 兼容性修复
- 同时尽量保留本项目已有业务化能力
- 不要为了图快删掉本项目已经接入的重要能力

---

## 7. 推荐阅读顺序

接手开发时建议按这个顺序阅读：

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
