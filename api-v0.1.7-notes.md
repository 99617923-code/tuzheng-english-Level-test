# 途正教育 API v0.1.7 接口笔记（从截图提取）

## 1. GET /api/v1/test/teacher-config - 获取外教信息配置

**无需登录认证，无需X-App-Key**

请求头：
- Content-Type: application/json

响应示例：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "name": "Kristyan",
    "title": "外教Kristyan老师",
    "avatarUrl": "https://oss.example.com/teacher/avatar.png",
    "introAudioUrl": "https://oss.example.com/teacher/intro.mp3"
  }
}
```

后台管理端可在"AI测评管理→外教信息配置"中修改这些信息。

---

## 2. POST /api/v1/test/evaluate - 提交回答并获取下一题（自适应引擎 v2 核心接口）

**需Bearer Token认证**

核心流程：
1. AI实时评分（relevance 40% + grammar 20% + vocabulary 20% + fluency 20%）
2. 综合得分 >= 60 判定为通过
3. 升级判定：
   - 2题全通过 → 升级到下一小级，返回 status=continue
   - 1通过1不通过 → 结束，定为当前小级所属大级，返回 status=finished
   - 0通过 → 结束，定为前一个大级（最低0），返回 status=finished
4. 到达IELTS6且全通过 → 结束，定为3级

**精简后的响应字段（v0.1.6起）：**
- status: continue | finished
- sessionId: 会话ID
- question: 下一题信息（status=continue时）

注意：评分详情、最终报告等已移至独立的 report 接口（GET /api/v1/test/report/:sessionId）。

请求参数Body：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 必填 | 测评会话ID |
| questionId | string/number | 必填 | 当前题目ID（题库ID或答题记录ID） |
| audioUrl | string | 可选 | 录音文件URL（通过upload-audio接口上传后获得） |
| recognizedText | string | 可选 | 前端语音识别文本（如果没有audioUrl则必填） |
| duration | number | 可选 | 回答用时（毫秒） |

### evaluate continue响应示例：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "status": "continue",
    "sessionId": "TS20260327143000_A1B2C3",
    "question": {
      "questionId": 43,
      "audioUrl": "https://super.tuzheng.cn/teacher-recordings/PRE1_q2.mp3",
      "questionText": "How old are you?",
      "subLevel": "PRE1"
    }
  }
}
```

### evaluate finished响应示例：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "status": "finished",
    "sessionId": "TS20260327143000_A1B2C3",
    "question": null
  }
}
```

---

## 3. POST /api/v1/test/evaluate (测评结束响应示例)

请求参数Body：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 必填 | 测评会话ID |
| questionId | string/number | 必填 | 当前题目ID |
| recognizedText | string | 可选 | 用户回答文本 |
| duration | number | 可选 | 回答用时（毫秒） |

精简后不再返回详细结果，前端需调用 GET /api/v1/test/report/:sessionId 获取完整报告。

---

## 4. GET /api/v1/test/report/:sessionId - 获取测评报告

**需Bearer Token认证**

（具体响应格式待查看，但应包含逐题分析、最终级别、综合评分等）

---

## 5. GET /api/v1/test/user-level-status - 查询用户分级确认状态

**需Bearer Token认证**

返回字段说明：
- confirmed: 是否已确认分级
- level: 确认的等级（0/1/2/3）
- levelName: 等级名称（途正口语0级/1级/2级/3级）
- levelLabel: "途正口语1级"
- gradeTier: 档次（fail/pass/good/excellent）
- gradeTierLabel: 档次中文名
- overallScore: 综合得分
- sessionId: 确认的测评会话ID
- confirmedAt: 确认时间戳
- qrcodeUrl: 对应等级的群二维码URL

已确认分级的用户将无法再次发起测评（start接口会返回403）。

响应示例：
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "confirmed": true,
    "level": 1,
    "levelName": "途正口语1级",
    "levelLabel": "途正口语1级",
    "gradeTier": "good",
    "gradeTierLabel": "优秀",
    "overallScore": 85,
    "sessionId": "sess_20260406_abc123",
    "confirmedAt": 1712400000000,
    "qrcodeUrl": "https://oss.example.com/qrcode/elementary-group.png"
  }
}
```

---

## 6. GET /api/v1/test/questions - 批量获取测评题目

**需Bearer Token认证**

按年级ID批量获取测评题目。支持按需加载+预加载策略，一次可请求多个gradeId的题目。

请求参数Body：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| gradeIds | string | 必填 | 年级ID列表，逗号分隔 |

响应示例：
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "grades": [
      {
        "gradeId": 1,
        "gradeName": "一年级",
        "level": 1,
        "questions": [
          {
            "id": 1,
            "text": "What is your name?",
            "audioUrl": "https://...",
            "keywords": [
              {
                "name": ...
              }
            ]
          }
        ]
      }
    ]
  }
}
```
