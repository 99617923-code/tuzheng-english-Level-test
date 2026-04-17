# Debug Notes - @theme inline问题

## 关键发现
Tailwind CSS 4文档说明：@theme inline用于引用其他CSS变量的场景。
但问题是：我们的index.css中使用了 `@theme inline { ... }` 来定义自定义颜色变量。

在Tailwind CSS 4中，`@theme inline` 的变量值会被解析为引用（不会生成CSS变量声明），
而 `@theme` 则会生成实际的CSS变量。

但这不影响gray-800等默认颜色，因为它们来自tailwindcss的默认theme.css。

## 实际问题
截图中文字不可见，但HTML结构存在（markdown提取到了文字内容）。
这意味着文字颜色可能是透明的或与背景色相同。

## 可能的真正原因
1. index.css中的 `--color-foreground: var(--foreground)` 和 `:root { --foreground: oklch(0.25 0.02 50) }` 
   这个foreground颜色是深色的，应该可见
2. 但 `text-gray-800` 使用的是 Tailwind默认的 `--color-gray-800`
3. 问题可能是 `@theme inline` 中定义了 `--color-foreground` 等，但没有定义 `--color-gray-*`
4. 而 `@theme inline` 可能会清除默认的color命名空间！

## 验证方案
直接用 style={{ color: '#1f2937' }} 测试，或者在@theme中添加gray颜色


---

# Bug分析笔记 - 第20题后崩溃问题（第十六轮）

## 用户描述
- 前20题正常，第20题时点录音没反应，多点了几下后系统崩溃
- "录音失败，请重试" toast
- "网络异常" 弹窗跳不过去
- "跳过此题" 跳过后仍无法录音
- "null is not an object (evaluati...)" 错误
- "sessionId和questionId不..." 错误

## 前端问题（需修复）
1. **录音连点防抖** - 快速多次点击时，wx.getSetting异步回调前isRecording还没设为true，导致多次启动录音
2. **null对象防护** - currentQuestion为null时访问.questionId报错
3. **跳过失败恢复** - handleSkip中evaluate失败后，phase回到answering但currentQuestion可能已无效

## 后端问题（需反馈）
1. **"sessionId和questionId不..."** - 后端校验错误，需确认触发条件
2. **evaluate长时间测评后超时** - 20题后可能后端处理变慢


---

# Debug Notes: profile-status 返回 HTML（第90轮）

## 现象
控制台 `[API] profile-status raw response:` 输出了完整HTML页面而非JSON

## 根因
request.js 的 success 回调中，当 statusCode < 400 时直接 resolve(responseData)。
但后端返回的可能是 HTML（nginx SPA fallback 或 token 无效时重定向），
wx.request 的 responseData 就是原始HTML字符串，不是JSON对象。

## 解决方案
1. request.js 增加响应类型检查：如果 responseData 是字符串且以 `<` 开头，视为异常
2. getProfileStatus 增加 HTML 响应兜底处理
3. 减少日志输出量（不打印完整HTML）
