# 竖版课件模板排版引擎设计文档

**日期：** 2026-03-26
**状态：** 已批准，待实施
**背景仓库：** `THU-MAIC/OpenMAIC` fork，thin fork 原则

---

## 问题陈述

当前竖版 slide 生成的核心缺陷：模型直接输出所有元素的 `{left, top, width, height}`，即使有详细的 archetype prompt（A1-A6），模型仍会"自由发挥"坐标，导致：

- 文本超出容器（溢出/重叠）
- 下半区大面积空白
- 版式像"自由堆叠的 PPT 元素"而非移动端知识页
- 图片随意占位，破坏纵向节奏
- Repair loop（AI 返修）成功率不稳定

**根本原因：** 生成链路让 AI 同时决定内容和几何布局，而 AI 擅长前者、不擅长后者。

---

## 目标

- AI 只决定：archetype、内容文字、图片角色
- 程序决定：所有坐标、间距、块高（含文本 fitting）
- 横版课程：完全不受影响
- LaTeX / Chart：竖版降级为文字，不生成特殊元素

---

## 架构概览

```
竖版 slide 生成流程（新）：

OutlineScene (isPortrait=true)
    ↓
generatePortraitSlide()          ← 新函数
    │
    ├─ [Step 1] AI Call（一次）
    │    system: portrait-manifest-prompt
    │    user:   title / description / keyPoints / imageList
    │    output: PortraitContentManifest
    │
    ├─ [Step 2] renderPortraitTemplate()（纯 TypeScript）
    │    archetype → 固定坐标骨架
    │    estimateTextHeight() → 动态调整块高度
    │    堆叠 + 防溢出 + 下半区填满
    │    output: GeneratedSlideData { elements, background }
    │
    └─ [Step 3] lintPortraitLayout()（增强版）
         新规则：hero-too-small / lower-half-empty / archetype-incomplete
         极少情况下触发 repairPortraitLayout()（最多 1 次）

横版 slide 生成流程：完全不变（scene-generator.ts 原有路径）
```

---

## 新文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `lib/generation/portrait-content-schema.ts` | 新建 | Manifest 类型定义 |
| `lib/generation/portrait-manifest-prompt.ts` | 新建 | AI 提取 manifest 的 system/user prompt 构建函数 |
| `lib/generation/portrait-template-engine.ts` | 新建 | Manifest → Elements 渲染引擎 + 文本 fitting |

### 修改文件

| 文件 | 变更范围 |
|------|---------|
| `lib/generation/portrait-layout-linter.ts` | 新增 3 条质检规则 |
| `lib/generation/scene-generator.ts` | 在 `generateSlideContent()` 加 portrait 分支（~10 行） |

---

## 详细设计

### 1. PortraitContentManifest（`portrait-content-schema.ts`）

```typescript
export type PortraitArchetype = 'lead' | 'concept' | 'compare' | 'steps' | 'tip' | 'summary';
export type ImageRole = 'hero' | 'supporting' | 'skip';

export interface PortraitHeroBlock {
  label?: string;       // 小标签/徽章，≤ 6 字
  body: string;         // 主要内容，≤ 80 字
  bgColor?: string;     // 可选，默认由 archetype 决定
}

export interface PortraitCard {
  label?: string;
  body: string;         // ≤ 60 字
}

export interface PortraitContentManifest {
  archetype: PortraitArchetype;
  accentColor: string;            // 主题色（影响标题栏和 hero 块）
  title: string;                  // ≤ 12 中文字 / ≤ 16 英文字
  titleSub?: string;              // 可选副标题
  heroBlock: PortraitHeroBlock;
  supportingCards: PortraitCard[]; // 0-3 张
  imageId?: string;               // "img_1" / "gen_img_1" / 留空
  imageRole: ImageRole;
  footerCallout?: string;         // 可选底部摘要，≤ 30 字
}
```

### 2. AI Prompt 设计（`portrait-manifest-prompt.ts`）

**System prompt 核心内容：**

- 说明 6 种 archetype 的选择标准：

  | Archetype | 选择条件 |
  |-----------|---------|
  | `lead` | 导学/开场/章节起始 |
  | `concept` | 定义新术语、解释核心概念 |
  | `compare` | 对比两个选项/方案/情况 |
  | `steps` | 序列步骤、流程（≤3步/页） |
  | `tip` | 警示、重要提醒、关键注意事项 |
  | `summary` | 场景/章节总结、要点回顾 |

- LaTeX/Chart 降级规则：含公式/图表时，将核心信息转为文字放入 heroBlock 或 supportingCards
- 图片角色规则：只有 `lead`（hero image）和 `steps`（supporting）时才考虑使用图片；`compare`/`summary` 默认 `skip`
- accentColor 推荐池：`#1e40af` / `#065f46` / `#7c3aed` / `#b45309` / `#dc2626`
- 输出格式：纯 JSON，无 markdown fence

**User prompt：** 注入 title / description / keyPoints / imageList（来自 outline）

### 3. 模板渲染引擎（`portrait-template-engine.ts`）

#### 区域划分（以 canvasWidth=1000, canvasHeight=1333 为例）

```
top=0
├── Title Bar Shape: left=0, top=50, width=canvasWidth, h=148
├── Title Text:      left=60, top=50, width=canvasWidth-120, h=148
top=220（内容区起始）
├── Hero Block:      left=60, width=canvasWidth-120, h=fitting后
├── Card 1:          top=hero.bottom+20
├── Card 2:          top=card1.bottom+16
├── Card 3:          top=card2.bottom+16
├── Image Slot:      由 archetype 决定位置
top=canvasHeight-200（可选）
└── Footer Callout:  left=60, width=canvasWidth-120, h=150
```

#### Archetype 差异

| Archetype | Hero 背景色 | Hero 最小高 | 支撑卡片 | 图片槽位 |
|-----------|------------|------------|---------|---------|
| `lead` | accentColor | 160px | 0-1 | hero 下方，居中 |
| `concept` | `#e8f4fd` | 200px | 2-3 | 无（默认 skip）|
| `compare` | `#dbeafe`/`#dcfce7` 交替 | 各 180px | 固定 2 | 无 |
| `steps` | 无底色，序号徽章 | 各 150px | 2-3 | card 下方 |
| `tip` | `#fff3cd` | 180px | 1-2 | 可选 |
| `summary` | `#f0fdf4` | 160px | 2-3 | 无 |

#### 文本 Fitting 算法

```typescript
function estimateTextHeight(
  html: string,
  fontSize: number,
  containerWidth: number,
  lineHeightRatio = 1.45,
  paddingV = 20,
  paddingH = 20,
): number {
  const text = stripHtml(html);
  const usableWidth = containerWidth - paddingH * 2;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  const avgCharWidth = text.length === 0 ? fontSize
    : (chineseChars * fontSize + otherChars * fontSize * 0.6) / text.length;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));
  const lines = Math.ceil(text.length / charsPerLine);
  return lines * fontSize * lineHeightRatio + paddingV * 2;
}
```

#### 堆叠 + 防溢出 + 填满策略

1. 计算每块 `neededHeight = max(archetypeMinHeight, estimateTextHeight(...))`
2. 从 hero 依次往下累加，gap=16px
3. 若最后一块 bottom > `canvasHeight - 80`：
   - 先减 gap 至 8px
   - 仍超出 → 裁掉最后一张 supportingCard
4. 若最后一块 bottom < `canvasHeight * 0.72`：
   - 均匀拉伸各块高度，直到最低块达到 `canvasHeight * 0.85`

### 4. 新增 Linter 规则（`portrait-layout-linter.ts`）

| 规则 ID | 触发条件 | 修复建议 |
|---------|---------|---------|
| `hero-too-small` | hero 块高度 < `canvasHeight × 0.12` | 扩大 hero 高度至最小值 |
| `lower-half-empty` | 画布下半区内容面积 < 15% | 拉伸现有块或添加 footer |
| `archetype-incomplete` | 无标题栏 ShapeElement 且总元素 < 4 | 整体重排 |

### 5. scene-generator.ts 改动

```typescript
// generateSlideContent() 中，替换现有 isPortrait 判断：

if (isPortrait) {
  return generatePortraitSlide(
    outline, aiCall,
    assignedImages, imageMapping, generatedMediaMapping,
    canvasWidth, canvasHeight,
  );
}
// 横版路径：完全不变
```

`generatePortraitSlide()` 实现步骤：
1. `buildPortraitManifestPrompt(outline, assignedImages)` → system/user
2. `aiCall(system, user)` → `parseJsonResponse<PortraitContentManifest>()`
3. Manifest 校验（archetype 是否有效，必填字段是否存在）
4. `renderPortraitTemplate(manifest, canvasWidth, canvasHeight)` → elements
5. `fixElementDefaults(elements)` + `resolveImageIds(elements, imageMapping, generatedMediaMapping)`
6. `lintPortraitLayout(elements, ...)` → 必要时 `repairPortraitLayout()`（max 1 次）
7. 返回 `GeneratedSlideContent`

---

## 横版保护

所有新代码位于 `if (isPortrait)` 分支内。横版课程走 else 路径，与当前实现完全相同：

- `buildSlideOrientationRules()` 横版分支不变
- `lintPortraitLayout()` / `repairPortraitLayout()` 横版不触发（已有保护）
- 现有 prompt 模板 `slide-content/system.md` 横版部分不修改

---

## 验证计划

### 主题一：护理类（医学说明型）
- 建议课程：疼痛管理 / 静脉穿刺操作流程
- 验证重点：`concept` 定义页清晰，`steps` 流程页不出框，`tip` 警示突出

### 主题二：心理类（概念讲解型）
- 建议课程：认知行为疗法 / 应激反应机制
- 验证重点：`concept`/`compare` 卡片结构稳定，下半区无大留白

### 对比维度

| 维度 | 旧竖版 | 新竖版目标 |
|------|--------|-----------|
| 文本超框/重叠 | 偶发 | 消除 |
| 下半区空白 | 常见 | 消除 |
| 版式稳定性 | 漂移 | 模板固定 |
| 图片合理性 | 装饰性占位 | 结构性或 skip |
| 横版回归 | — | 无变化 |

---

## 边界与约束

- 不修改底层画布坐标系统
- 不改动课堂播放引擎或导出链路
- 竖版 LaTeX/Chart 降级为文字（不支持特殊元素）
- 竖版 repair 最多 1 次（模板渲染后应极少触发）
- 所有新增文件使用 `portrait-` 前缀，便于识别和 upstream 合并

---

## AGENT.md 更新要点

完成实施后需在 AGENT.md 的竖版优化节补充：
- Phase 7 描述：manifest + 模板引擎替代自由排版
- 新文件列表
- 横版隔离保证
