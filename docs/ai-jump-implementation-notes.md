# AI智能跳级模式实现笔记

## 需要修改的文件和位置

### test.js 修改点：
1. **onLoad** (line 164): 接收 `options.evaluateMode` 参数
2. **data** (line 72-144): 新增 `evaluateMode`, `showJumpAnimation`, `jumpFrom`, `jumpTo`, `jumpReasoning`, `jumpSkippedLevels`, `modeLabel` 字段
3. **initTest** (line 444): 将 `evaluateMode` 传给 `startTest()`，保存到data
4. **submitAnswer** (line 1230-1257): 在evaluate返回后检查 `aiSmartJump.jumped`，如果跳级则显示跳级动画
5. **_autoNextQuestion** (line 1411): 跳级时更新级别显示，跳级动画结束后再播放下一题
6. **_resumeTest** (line 341): 恢复时也要恢复evaluateMode

### test.wxml 修改点：
1. **level-info-bar** (line 26): 添加模式标签显示
2. 新增跳级动画弹窗UI

### test.wxss 修改点：
1. 模式标签样式
2. 跳级动画样式

## aiSmartJump 字段结构
```json
{
  "aiSmartJump": {
    "jumped": true,
    "jumpTarget": "G7",
    "estimation": {
      "estimatedSubLevel": "G10",
      "targetSubLevel": "G7",
      "reasoning": "...",
      "confidence": 85,
      "skippedLevels": 8
    }
  }
}
```

## 模式标签显示逻辑
- 逐级模式: 显示 "逐级测评"
- AI智能跳级模式:
  - 探测阶段（前3-5题）: "AI分析中..."
  - 跳级后: "AI智能跳级 → G7"
  - 正常阶段: "精准定级中"
