# selfIntroEstimate API 多维度数据结构需求

## 接口地址

`POST /api/v1/test/self-intro-estimate`

## 请求参数（不变）

```json
{
  "sessionId": "xxx",
  "audioUrl": "https://xxx/self-intro.mp3"
}
```

## 响应数据结构（新增 dimensions 字段）

```json
{
  "code": 200,
  "data": {
    "estimatedLevel": {
      "lowerBound": "G10",
      "lowerBoundName": "G10",
      "upperBound": "G12",
      "upperBoundName": "G12",
      "dimensions": [
        { "name": "pronunciation", "label": "发音准确度", "score": 72 },
        { "name": "grammar",       "label": "语法规范性", "score": 65 },
        { "name": "vocabulary",    "label": "词汇丰富度", "score": 58 },
        { "name": "fluency",       "label": "流利度",     "score": 68 },
        { "name": "coherence",     "label": "表达逻辑",   "score": 55 }
      ]
    },
    "startSubLevel": "G10",
    "startSubLevelName": "G10",
    "wordCount": 85,
    "question": {
      "questionId": "q_xxx",
      "audioUrl": "https://xxx/q1.mp3",
      "questionText": "Tell me about your favorite hobby.",
      "subLevel": "G10"
    }
  }
}
```

## dimensions 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 维度英文标识（pronunciation/grammar/vocabulary/fluency/coherence） |
| label | string | 是 | 维度中文名称 |
| score | number | 是 | 维度得分（0-100整数） |

### 五个维度定义

1. **pronunciation（发音准确度）**：评估用户的英语发音清晰度、元音辅音准确性
2. **grammar（语法规范性）**：评估句子结构、时态使用、主谓一致等语法正确性
3. **vocabulary（词汇丰富度）**：评估用词多样性、词汇量水平、是否使用高级词汇
4. **fluency（流利度）**：评估语速、停顿频率、是否有明显卡顿或重复
5. **coherence（表达逻辑）**：评估内容组织性、逻辑连贯性、是否有条理

### 前端兼容逻辑

- 如果后端返回了 `dimensions` 数组（≥5项），前端直接使用后端数据
- 如果后端未返回 `dimensions`，前端会根据 `startSubLevel` 对应的大级别生成合理默认值
- 因此 **dimensions 字段为可选**，后端可以分阶段实现

### 默认值参考（前端降级使用）

| 大级别 | 发音 | 语法 | 词汇 | 流利度 | 逻辑 |
|--------|------|------|------|--------|------|
| 0级（PRE1-PRE2） | 35 | 30 | 25 | 30 | 20 |
| 1级（G1-G6） | 55 | 50 | 45 | 50 | 40 |
| 2级（G7-G12） | 70 | 65 | 60 | 68 | 55 |
| 3级（IELTS4-9） | 85 | 80 | 78 | 82 | 75 |
