# GET /api/v1/test/result/:sessionId - 获取测评结果详情（自适应引擎 v2）

## 完整响应示例

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "sessionId": "TS20260327143000_A1B2C3",
    "status": "completed",
    "majorLevel": 1,
    "majorLevelName": "途正口语1级",
    "majorLevelLabel": "小学水平",
    "highestSubLevel": "G4",
    "highestSubLevelName": "小学4年级",
    "overallScore": 72.5,
    "scores": {
      "pronunciation": 75,
      "grammar": 68,
      "vocabulary": 72,
      "fluency": 70
    },
    "report": {
      "pronunciation": 75,
      "grammar": 68,
      "vocabulary": 72,
      "fluency": 70,
      "summary": "学员英语口语水平评定为途正口语1级（小学水平），最高通过小学4年级。",
      "strengths": ["发音清晰", "基础词汇掌握良好"],
      "weaknesses": ["语法结构需要加强", "句子复杂度不足"],
      "recommendation": "建议参加小学高年级口语训练营，重点加强语法和句型练习。"
    },
    "totalQuestions": 8,
    "passedQuestions": 6,
    "totalDuration": 180000,
    "completedAt": 1711540800000,
    "groupQrcode": {
      "groupName": "途正英语·小学级学习群",
      "qrcodeUrl": "https://oss.example.com/qrcode/elementary-group.png"
    },
    "answerDetails": [
      {
        "subLevel": "PRE1",
        "subLevelName": "学前基础A",
        "questionIndex": 1,
        "questionText": "What is your name?",
        "userAnswer": "My name is Zhang San.",
        "score": 85,
        "passed": true,
        "scoreDetail": {
          "relevance": 90,
          "grammar": 80,
          "vocabulary": 85,
          "fluency": 82
        },
        "feedback": "Good basic introduction!"
      }
    ],
    "finalLevel": 1,
    "levelName": "途正口语1级",
    "levelLabel": "小学水平",
    "suggestion": "建议参加小学高年级口语训练营",
    "questionCount": 8
  }
}
```

## answerDetails 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| subLevel | string | 小级代码（如PRE1） |
| subLevelName | string | 小级名称（如学前基础A） |
| questionIndex | number | 题目序号 |
| questionText | string | 题目文本 |
| userAnswer | string | 用户回答文本 |
| score | number | 该题得分 |
| passed | boolean | 是否通过 |
| scoreDetail | object | 四维度评分（relevance/grammar/vocabulary/fluency） |
| feedback | string | AI反馈/解析 |

## 注意事项

- answerDetails中没有录音URL字段，需要确认后端是否支持返回录音回放地址
- totalDuration 是毫秒级时间戳（180000ms = 3分钟），前端需要转换为分秒格式
- majorLevelLabel 包含"小学水平"等描述，前端需要去掉，统一用majorLevelName
