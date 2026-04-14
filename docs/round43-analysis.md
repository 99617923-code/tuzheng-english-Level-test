# 第四十三轮分析笔记

## 需求1：级别显示统一
- app.js levelConfig中的label字段：'学前水平'、'小学水平'、'中学水平'、'雅思水平'
- 需要去掉这些label，统一用"途正口语X级"
- result.wxml 第75行显示 `{{levelLabel}}`（如"高中以上水平"）→ 需要去掉
- result.js 第191行：levelLabel来自后端或config.label
- 解决：去掉levelLabel显示，levelName统一用"途正口语X级"格式

## 需求2：用时计算
- result.js 第253-258行：totalDuration来自后端，>10000认为毫秒，否则秒
- formatDuration在utils/util.js中
- 7'37"表示7分37秒 → 需要确认后端返回的totalDuration值是否正确

## 需求3：测评记录布局
- history.wxml 第49-69行：stats-header中三列等分：总测评 | 已完成 | 最高等级
- 需要改为：级别居中突出，总测评/已完成缩小
- 新布局：上方大字显示"途正口语X级"，下方小字显示"总测评X | 已完成X"

## 需求4：逐题详情
- 后端接口 GET /api/v1/test/result/:sessionId 返回 answerDetails 数组
- 字段：questionText, userAnswer, score, scoreDetail(pronunciation/grammar/vocabulary/fluency), feedback
- 没有录音URL字段（audioUrl/userAudioUrl）→ 可能需要后端补充
- result.js已有questionDetails处理逻辑，但使用的是report接口的questions字段
- 需要也兼容result接口的answerDetails字段
