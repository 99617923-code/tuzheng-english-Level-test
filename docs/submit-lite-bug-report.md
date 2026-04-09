# submit-lite 接口返回数据不完整 — 问题说明与修复建议

**编写**：火鹰科技  
**日期**：2026年4月9日  
**优先级**：高（直接影响用户体验）

---

## 一、问题现象

从第2道题开始，外教录音不再播放，改为AI合成语音（TTS降级）。偶尔某些题目能播放外教录音，但大部分题目都走了TTS降级。

## 二、问题定位

通过在前端关键路径添加调试日志，真机测试后确认：

**startTest 接口**（`/api/v1/test/start`）返回的第1题数据**正常**：

```
question: {
  questionId: "51",
  teacherAudioUrl: "https://tz-education.oss-cn-guangzhou.aliyuncs.com/teacher-audio/51.mp3",
  audioUrl: "https://tz-education.oss-cn-guangzhou.aliyuncs.com/teacher-audio/51.mp3",
  text: "有"
}
```

**submit-lite 接口**（`/api/v1/test/submit-lite`）返回的第2题开始数据**不完整**：

```
question: {
  questionId: "q_004_be0362",
  teacherAudioUrl: undefined,
  teacher_audio_url: undefined,
  audioUrl: undefined,
  audio_url: undefined,
  text: "无"
}
```

**结论**：submit-lite 接口返回的 question 对象只有 questionId，缺少 teacherAudioUrl、audioUrl、questionText（text）等关键字段。

## 三、前端期望的 question 数据结构

根据接口注释和 startTest 的正常返回，submit-lite 在 `status=continue` 时返回的 question 对象应包含以下字段：

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| questionId | string | 是 | 题目唯一标识 |
| teacherAudioUrl | string | 是 | 外教录音URL（OSS地址），优先使用 |
| audioUrl | string | 否 | 基础音频URL（备用，当无外教录音时使用） |
| questionText / text | string | 是 | 题目文本（TTS降级和界面展示需要） |
| subLevel | string | 否 | 题目所属小级（如 "G1"） |

**前端处理优先级**：`teacherAudioUrl > audioUrl > TTS合成`

如果 teacherAudioUrl 和 audioUrl 都为空，前端会降级到微信同声传译插件合成语音，体验差异明显。

## 四、需要后端修复的内容

请检查 submit-lite 接口的返回逻辑，确保在 `status=continue` 时，question 对象中包含完整的字段，特别是：

1. **teacherAudioUrl**：从题库中查询该题目对应的外教录音OSS地址并返回
2. **questionText / text**：返回题目文本内容
3. **audioUrl**：如果有基础音频也一并返回

可以参考 startTest 接口（`/api/v1/test/start`）的 question 返回逻辑，两个接口返回的 question 结构应保持一致。

## 五、验证方式

修复后，在真机调试模式下运行小程序，控制台搜索 `[API Debug]`，应看到每道题都有类似输出：

```
[API Debug] submit-lite原始返回 question: {
  "teacherAudioUrl": "https://tz-education.oss-cn-guangzhou.aliyuncs.com/teacher-audio/xxx.mp3",
  "audioUrl": "https://tz-education.oss-cn-guangzhou.aliyuncs.com/teacher-audio/xxx.mp3",
  "questionId": "xxx",
  "text": "有"
}
[API Debug] submit-lite最终audioUrl: https://...xxx.mp3 (外教录音)
```

如果看到 `(无音频→TTS降级)` 则说明该题目仍未返回音频URL。

## 六、其他已知问题（前端侧，已在修复中）

1. **录音太短误报**：用户实际按住时间足够但仍提示"录音太短"，前端正在调整阈值和时序判断
2. **recorder not start**：录音器状态管理时序竞争，前端正在优化启动策略
