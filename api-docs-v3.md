# 途正英语 API 文档 v1.0.1 - 完整接口详情

## 测评相关接口（8个新增）

### 1. POST /api/v1/test/start - 创建测评会话
**描述**: 创建新的AI英语分级测评会话，返回第一道题目
**认证**: Bearer Token
**请求头**: X-App-Key(必填), Content-Type: application/json, Authorization(必填)
**请求参数**: 无（自动关联当前登录用户）
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "sessionId": "TS20260320143000_A1B2C3",
    "currentQuestion": {
      "questionId": "Q1_a1b2c3d4",
      "type": "listen_and_respond",
      "level": 1,
      "prompt": "Hello! My name is Emma. I'm your English teacher today. Can you tell me your name and where you are from?",
      "audioUrl": "https://storage.example.com/tts/Q1_a1b2c3d4.mp3",
      "maxDuration": 30000,
      "questionNumber": 1,
      "totalQuestions": 6
    },
    "status": "in_progress"
  }
}
```

### 2. POST /api/v1/test/evaluate - 提交回答并获取AI评估
**描述**: 提交用户的口语回答文本，AI评估后返回下一题或最终结果
**认证**: Bearer Token
**请求参数**:
- sessionId: string (必填) - 测评会话ID
- questionId: string (必填) - 当前题目ID
- answerText: string (必填) - 用户回答的文本内容
- audioUrl: string (可选) - 录音文件URL（来自upload-audio）
- duration: number (可选) - 回答时长(ms)
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "evaluation": {
      "questionId": "Q1_a1b2c3d4",
      "score": 2.5,
      "feedback": "Good basic introduction! Your pronunciation is clear.",
      "detectedLevel": 1
    },
    "nextQuestion": {
      "questionId": "Q2_e5f6g7h8",
      "type": "listen_and_respond",
      "level": 2,
      "prompt": "That's great! Now, can you describe what you usually do on a typical weekday? Tell me about your daily routine.",
      "audioUrl": "https://storage.example.com/tts/Q2_e5f6g7h8.mp3",
      "maxDuration": 45000,
      "questionNumber": 2,
      "totalQuestions": 6
    },
    "isComplete": false,
    "status": "in_progress"
  }
}
```
**当isComplete=true时**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "evaluation": { ... },
    "nextQuestion": null,
    "isComplete": true,
    "status": "completed",
    "result": {
      "sessionId": "TS20260320143000_A1B2C3",
      "finalLevel": 2,
      "levelName": "高中水平",
      "levelLabel": "二级",
      "questionCount": 6,
      "totalDuration": 180000,
      "scores": {
        "overall": 2.3,
        "comprehension": 2.5,
        "grammar": 2,
        "vocabulary": 2.2,
        "pronunciation": 2.5,
        "fluency": 2
      }
    }
  }
}
```

### 3. GET /api/v1/test/result/:sessionId - 获取测评结果详情
**描述**: 获取已完成测评的详细结果，包含每题评分和建议
**认证**: Bearer Token
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "sessionId": "TS20260320143000_A1B2C3",
    "userId": "10001",
    "finalLevel": 2,
    "levelName": "高中水平",
    "levelLabel": "二级",
    "questionCount": 6,
    "totalDuration": 180000,
    "scores": {
      "overall": 2.3,
      "comprehension": 2.5,
      "grammar": 2,
      "vocabulary": 2.2,
      "pronunciation": 2.5,
      "fluency": 2
    },
    "questions": [...],
    "recommendation": "...",
    "completedAt": "2026-03-20T15:03:00.000Z"
  }
}
```

### 4. POST /api/v1/test/upload-audio - 上传测评录音
**描述**: 上传用户的口语录音文件到S3存储。支持webm/mp3/wav/m4a/ogg格式，最大16MB。上传后返回音频URL，可用于evaluate和transcribe接口。使用multipart/form-data格式上传。
**认证**: Bearer Token
**Content-Type**: multipart/form-data
**请求参数**:
- file: File (必填) - 音频文件（webm/mp3/wav/m4a/ogg，最大16MB）
- sessionId: string (必填) - 测评会话ID
- questionId: string (必填) - 题目ID
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "audioUrl": "https://storage.example.com/test-recordings/TS20260320143000_A1B2C3/Q1_a1b2c3d4.webm",
    "duration": 0,
    "fileSize": 245760
  }
}
```

### 5. POST /api/v1/test/transcribe - 语音转文字（ASR）
**描述**: 将音频URL转写为文字。使用Whisper API进行英语语音识别。可单独调用，也可在evaluate接口中传入audioUrl自动触发。
**认证**: Bearer Token
**请求参数**:
- audioUrl: string (必填) - 音频文件URL（S3地址）
- language: string (可选) - 语言代码（默认en）
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "text": "My name is Zhang San. I am a student from Guangzhou.",
    "confidence": 0.9,
    "language": "en",
    "duration": 5200
  }
}
```

### 6. POST /api/v1/test/terminate - 终止测评会话
**描述**: 用户主动终止进行中的测评会话。终止后无法继续答题，但可以查看已答题目的评估结果。
**认证**: Bearer Token
**请求参数**:
- sessionId: string (必填) - 测评会话ID
- reason: string (可选) - 终止原因（默认user_quit）
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "terminated": true
  }
}
```

### 7. GET /api/v1/test/history - 查询测评历史
**描述**: 分页查询当前用户的测评历史记录，按创建时间倒序排列。包含每次测评的最终级别、题数、用时等摘要信息。
**认证**: Bearer Token
**请求参数**:
- page: number (可选) - 页码（默认1）
- pageSize: number (可选) - 每页数量（默认10）
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "total": 3,
    "list": [
      {
        "sessionId": "TS20260320143000_A1B2C3",
        "finalLevel": 2,
        "levelName": "高中水平",
        "levelLabel": "二级",
        "questionCount": 6,
        "totalDuration": 180000,
        "completedAt": "2026-03-20T15:03:00.000Z",
        "status": "completed"
      }
    ]
  }
}
```

### 8. POST /api/v1/test/tts - 文本转语音（TTS）
**描述**: 将英文文本转换为语音音频。用于朗读测评题目。如果TTS服务不可用，返回audioUrl为null，前端可降级使用Web Speech API。
**认证**: Bearer Token
**请求参数**:
- text: string (必填) - 要转换的英文文本
- voice: string (可选) - 语音类型（默认en-US-female）
- speed: number (可选) - 语速（0.5-2.0，默认0.85）
**响应示例**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "audioUrl": "https://storage.example.com/tts/output_a1b2c3.mp3",
    "duration": 3200,
    "format": "mp3"
  }
}
```

## 已有接口（认证+用户管理）
- GET /api/v1/auth/captcha - 获取图形验证码
- POST /api/v1/auth/login - 用户登录
- POST /api/v1/auth/register - 用户注册
- POST /api/v1/auth/refresh-token - 刷新令牌
- POST /api/v1/auth/logout - 退出登录
- GET /api/v1/auth/me - 获取当前用户信息
- PUT /api/v1/user/profile - 更新用户资料
