# AI智能跳级模式 — 前端对接说明

> **版本**: v1.3.0  
> **更新日期**: 2026-04-13  
> **编写**: 火鹰科技  
> **适用对象**: 小程序前端开发团队

---

## 一、背景概述

v1.3.0 版本在原有"逐级测评"的基础上，新增了 **"AI智能跳级"** 测评模式。用户在开始测评前可以选择两种模式之一，后端会根据所选模式执行不同的出题和评估策略。前端需要做的改动集中在 **模式选择UI** 和 **跳级结果展示** 两个方面，核心答题流程（录音 → 上传 → 提交 → 拿下一题）保持不变。

---

## 二、两种模式对比

| 对比项 | 逐级测评（standard） | AI智能跳级（ai_smart） |
|--------|----------------------|------------------------|
| 模式代码 | `standard` | `ai_smart` |
| 起始级别 | PRE1（最低级） | PRE1（最低级） |
| 出题策略 | 每个小级出2-4题，通过后升到下一级 | 前3-5题为"探测阶段"，AI根据回答质量判断是否跳级 |
| 跳级行为 | 无，严格逐级递进 | 连续高分时AI预估水平，跳过中间级别 |
| 适合人群 | 所有用户，结果更稳定 | 有一定基础的用户，节省时间 |
| 题目数量 | 较多（可能20-40题） | 较少（高水平用户可能10-15题） |
| 默认选中 | 是 | 否 |

---

## 三、前端改动清单

### 3.1 新增：模式选择页面

在用户点击"开始测评"后、正式进入答题前，需要新增一个 **模式选择页面**（或弹窗），让用户选择测评模式。

**数据来源** — 调用新接口获取模式列表：

```
GET /api/v1/test/evaluate-modes
```

> 该接口 **无需 Authorization**，只需要 `X-App-Key` 请求头。返回的数据包含模式名称、描述、使用提示等，可直接用于渲染UI。

**返回数据结构**：

```json
{
  "code": 200,
  "data": {
    "modes": [
      {
        "mode": "standard",
        "name": "逐级测评模式",
        "description": "从基础级别开始，每个小级出2-4题，通过后升级到下一级，直到找到您的真实水平。",
        "tips": [
          "适合所有水平的用户",
          "测评结果更稳定准确",
          "题目数量较多，时间较长"
        ],
        "isDefault": true
      },
      {
        "mode": "ai_smart",
        "name": "AI智能跳级模式",
        "description": "AI将根据您的回答质量智能判断水平，高水平用户可快速跳级，大幅缩短测评时间。",
        "tips": [
          "请按您的最高水平来回答每道题",
          "在切题的前提下，回答可以丰富些",
          "可以展示复杂语法和高级词汇",
          "1分钟内尽量充分表达"
        ],
        "isDefault": false
      }
    ]
  }
}
```

**UI建议**：

- 两个模式卡片并排或上下排列，`isDefault: true` 的默认选中
- 每个卡片展示 `name`、`description`、`tips` 列表
- AI智能跳级模式可以加一个"推荐有基础的同学使用"的标签
- 用户选择后点击"开始测评"按钮

---

### 3.2 修改：开始测评接口传参

原来调用 `POST /api/v1/test/start` 时不需要传模式参数，现在需要新增 `evaluateMode` 字段：

```json
{
  "deviceType": "miniprogram",
  "evaluateMode": "ai_smart"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| evaluateMode | string | 否 | `standard`（默认）或 `ai_smart` |

> 如果不传，默认为 `standard`（逐级模式），**向后兼容**，旧版前端不传也不会报错。

**响应新增字段**：

响应的 `data` 中会多返回一个 `evaluateMode` 字段，前端可以用来确认当前会话使用的模式：

```json
{
  "data": {
    "sessionId": "sess_20260413_abc12",
    "firstQuestion": { ... },
    "evaluateMode": "ai_smart"
  }
}
```

---

### 3.3 修改：评估响应中的跳级信息

答题流程不变：录音 → 上传 → 调用 `POST /api/v1/test/evaluate` → 拿到评分和下一题。

**关键变化**：当AI智能跳级模式触发跳级时，evaluate 响应中会多出一个 `aiSmartJump` 对象。前端需要根据这个字段做特殊展示。

**判断逻辑**：

```javascript
// 伪代码
const res = await submitAnswer(sessionId, questionId, audioUrl, transcription);

if (res.data.aiSmartJump && res.data.aiSmartJump.jumped) {
  // ✅ 触发了AI跳级！展示跳级动画/提示
  showJumpAnimation({
    from: '当前级别',
    to: res.data.aiSmartJump.jumpTarget,        // 跳到哪个级别，如 "G7"
    reasoning: res.data.aiSmartJump.estimation.reasoning,  // AI分析理由
    skipped: res.data.aiSmartJump.estimation.skippedLevels // 跳过了几个级别
  });
}

if (res.data.levelUp && !res.data.aiSmartJump) {
  // 普通升级（逐级模式或跳级后的逐级阶段）
  showLevelUpToast(res.data.levelUpMessage);
}

if (res.data.status === 'finished') {
  // 测评完成，跳转结果页
  navigateToResult(res.data.result);
}
```

**`aiSmartJump` 字段结构**（仅在跳级触发时才有）：

```json
{
  "aiSmartJump": {
    "jumped": true,
    "jumpTarget": "G7",
    "estimation": {
      "estimatedSubLevel": "G10",
      "targetSubLevel": "G7",
      "reasoning": "用户在回答简单问题时展现了丰富的词汇量、复杂的语法结构和流畅的表达，综合分析其水平约在G10级别。",
      "confidence": 85,
      "skippedLevels": 8
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `jumped` | boolean | 是否触发了跳级 |
| `jumpTarget` | string | 跳到哪个小级（如 `G7`） |
| `estimation.estimatedSubLevel` | string | AI预估的真实水平（如 `G10`） |
| `estimation.targetSubLevel` | string | 安全回退后的实际目标级别（预估 - 3级） |
| `estimation.reasoning` | string | AI的分析理由，可展示给用户 |
| `estimation.confidence` | number | 置信度（0-100），数值越高越确定 |
| `estimation.skippedLevels` | number | 跳过了多少个小级 |

---

## 四、前端展示建议

### 4.1 跳级动画/提示

当 `aiSmartJump.jumped === true` 时，建议展示一个醒目的跳级提示，例如：

> **AI检测到您的水平较高！**  
> 已为您跳过 8 个级别，从 PRE2 直接跳到 G7  
> 接下来将从 G7 开始逐级测评，精准定位您的水平

可以配合一个进度条动画，让用户看到级别的跳跃效果。

### 4.2 答题过程中的模式标识

建议在答题页面顶部显示当前模式标签：

- 逐级模式：显示 "逐级测评" 标签
- AI智能跳级模式：
  - 探测阶段（前3-5题）：显示 "AI分析中..."
  - 跳级后：显示 "AI智能跳级 → G7"
  - 正常阶段：显示 "精准定级中"

### 4.3 结果页

结果页不需要改动，`POST /api/v1/test/result/:sessionId` 返回的数据结构不变。两种模式最终都会产出相同格式的测评报告。

---

## 五、完整流程图

### 逐级测评模式（standard）

```
用户选择"逐级测评" 
  → POST /start { evaluateMode: "standard" }
  → 拿到第一题（PRE1）
  → 循环：录音 → 上传 → POST /evaluate → 拿到评分+下一题
     ↳ levelUp=true 时展示"升级提示"
  → status="finished" → 跳转结果页
```

### AI智能跳级模式（ai_smart）

```
用户选择"AI智能跳级"
  → POST /start { evaluateMode: "ai_smart" }
  → 拿到第一题（PRE1）
  → 探测阶段（前3-5题）：
     录音 → 上传 → POST /evaluate → 拿到评分+下一题
     ↳ 如果返回 aiSmartJump.jumped=true → 展示跳级动画
  → 跳级后进入正常逐级测评：
     录音 → 上传 → POST /evaluate → 拿到评分+下一题
     ↳ levelUp=true 时展示"升级提示"
  → status="finished" → 跳转结果页
```

---

## 六、注意事项

1. **向后兼容**：如果前端暂时不做模式选择，不传 `evaluateMode` 参数即可，默认走逐级模式，完全兼容旧逻辑。

2. **`aiSmartJump` 字段不是每次都有**：只有在AI智能跳级模式下、且触发了跳级的那一次 evaluate 响应中才会返回。其他时候该字段不存在，前端需要做判空处理。

3. **跳级只会发生一次**：在一次测评会话中，AI跳级最多触发一次（在探测阶段结束时）。跳级后就转为正常逐级测评，不会再次跳级。

4. **探测阶段题目数量**：AI智能跳级模式的探测阶段最少3题、最多5题。如果5题内都没有触发跳级条件，会自动转为逐级模式继续。

5. **evaluate-modes 接口缓存**：该接口返回的模式列表是固定的，可以在前端做本地缓存，不需要每次都请求。

6. **录音建议**：AI智能跳级模式下，建议在UI上提示用户"尽量充分表达"，因为AI需要足够的语料来判断水平。

---

## 七、接口变更汇总

| 接口 | 变更类型 | 说明 |
|------|----------|------|
| `GET /api/v1/test/evaluate-modes` | **新增** | 获取测评模式列表，无需 Authorization |
| `POST /api/v1/test/start` | **更新** | 请求体新增 `evaluateMode` 参数（可选），响应新增 `evaluateMode` 字段 |
| `POST /api/v1/test/evaluate` | **更新** | 响应可能新增 `aiSmartJump` 对象（仅AI跳级模式触发时） |
| `GET /api/v1/test/result/:sessionId` | 无变更 | 结果格式不变 |
| `POST /api/v1/test/upload-audio` | 无变更 | 录音上传不变 |

---

如有疑问请联系后端团队。
