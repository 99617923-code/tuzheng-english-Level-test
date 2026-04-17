# 途正英语测评 — 后端接口问题汇总

**整理时间：** 2026年4月17日

**背景：** 近期多位真实用户在使用小程序测评过程中，出现了"下一题无语音/无题目内容"、"页面卡死"、"结果显示0题"等异常情况。经前端日志分析，这些问题的根源均指向后端evaluate和startTest接口的返回数据异常。前端已做了兜底防御处理，但根本解决需要后端排查。

---

## 问题一：evaluate返回 `status=finished` 但 `question` 为 NULL，且题数不足

**现象描述：**

用户做了不到6题，evaluate接口就返回了 `status=finished`。前端有最少6题的保护机制（`MIN_QUESTIONS_BEFORE_FINISH=6`），此时会调用 `startTest({forceNew:true})` 强制创建新会话继续测评。但新会话的 `startTest` 返回的 `question` 也是 `null`，导致前端进入listening状态却没有题目数据，页面卡死。

**前端日志证据：**

```
[Evaluate] Response status: finished question: NULL questionId: N/A audioUrl: N/A
[API] startTest sending data: {"forceNew":true,"evaluateMode":"ai_smart"}
[Audio] No currentQuestion! phase: listening
[Submit] currentQuestion is null or missing questionId, resetting to safe state
[Recovery] Resetting to safe state: 题目数据异常
```

**最终结果：** 用户看到"状态异常"弹窗，查看结果显示0题、0分。

**需要后端排查：**

1. 为什么用户只做了几题，evaluate就返回了 `finished`？是否存在用户回答内容为空/无效时过早终止测评的逻辑？
2. `startTest({forceNew:true})` 创建新会话后，为什么返回的 `question` 为 `null`？新会话应该至少能返回第一题。

---

## 问题二：evaluate返回 `status=continue` 但 `question` 为 NULL 或缺少关键字段

**现象描述：**

用户正常答题后，evaluate返回 `status=continue`（表示测评继续），但返回的 `question` 对象为 `null`，或者 `question` 中缺少 `questionId`、`audioUrl`、`questionText` 等关键字段。前端无法显示下一题的语音条和题目内容，用户看到的是只有外教头像和"请用英语回答"的空白卡片。

**前端日志证据：**

```
[Evaluate] Response status: continue question: NULL questionId: N/A audioUrl: N/A
[Audio] No currentQuestion! phase: listening
```

**用户感知：** 第3题（或其他题）只显示外教头像，没有语音条，没有外教语音播放。多位用户反馈过此问题。

**需要后端排查：**

1. evaluate返回 `status=continue` 时，`question` 字段在什么情况下会为 `null`？
2. 是否存在出题服务超时或异常时，接口仍返回 `continue` 但不带题目数据的情况？
3. 建议：如果出题失败，应返回明确的错误状态（如 `status=error`），而不是返回 `continue` + 空 `question`。

---

## 问题三：应该结束测评却仍返回 `status=continue`，导致"幽灵题目"

**现象描述：**

根据实际数据分析，大部分"下一题没有语音/录音"的情况，是因为测评本应已经结束出结果了，但后端仍然返回了 `status=continue` 并尝试出下一题。由于测评实际已结束，出题逻辑无法正常工作，返回的 `question` 为空或不完整，导致前端显示了一道"幽灵题目"——有UI框架但无实际内容。

**用户感知：** 答完某题后进入下一题，但下一题没有语音、没有内容，用户被迫跳过或结束测评，最终结果页数据不完整。

**需要后端排查：**

1. evaluate的 `finished` 判定逻辑是否存在边界条件遗漏？什么情况下本应返回 `finished` 却返回了 `continue`？
2. AI智能定级模式（`ai_smart`）下，定级引擎是否存在"已经确定了最终等级但仍尝试出题"的情况？
3. 建议：在evaluate返回 `continue` 之前，先验证下一题的 `question` 数据完整性。如果无法生成有效题目，应直接返回 `finished`。

---

## 前端已做的兜底处理

为了避免上述后端异常导致用户体验崩溃，前端已增加了以下防御措施：

| 场景 | 前端兜底处理 |
|---|---|
| evaluate返回continue但question为null | 弹窗提示"出题异常"，用户可选择"查看结果"或"重试" |
| forceNew后startTest返回question为null | 直接跳转结果页，不再进入listening空状态 |
| submitAnswer时currentQuestion为null | 弹窗提示"状态异常"，用户可选择查看结果或返回首页 |
| 音频播放时currentQuestion为null | 显示"请用英语回答外教的提问"文字兜底 |

**但这些都是兜底措施，无法替代后端的正确返回。** 用户仍然会看到异常弹窗，体验不佳。

---

## 建议的后端改进

1. **evaluate接口返回 `continue` 时，必须保证 `question` 字段非空且包含完整数据**（至少包含 `questionId`、`audioUrl` 或 `questionText`）。如果无法出题，应返回 `finished` 或 `error`。

2. **evaluate接口返回 `finished` 时，确认判定逻辑的准确性**，避免过早终止（用户只做了1-2题就finished）或过晚终止（本应finished却continue）。

3. **startTest接口在 `forceNew=true` 时，必须保证返回有效的第一题**。如果无法创建新会话或出题失败，应返回明确的错误信息。

4. **建议增加接口返回的错误码机制**，区分"正常结束"、"出题失败"、"服务异常"等不同情况，便于前端做差异化处理。
