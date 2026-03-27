/**
 * 途正英语 - API接口封装
 * 对接后端自适应分级测评引擎 v2
 * 后端地址: https://tzapp-admin.figo.cn
 */
const { request, uploadFile, setTokens, clearTokens } = require('./request')

// ============ 认证接口 ============

/** 发送短信验证码 */
function sendSmsCode(phone, purpose = 'login') {
  return request('/api/v1/auth/send-sms-code', {
    method: 'POST',
    data: { phone, purpose }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '发送失败')
    return res.data
  })
}

/** 短信验证码登录（未注册自动创建账号） */
function smsLogin(phone, code) {
  return request('/api/v1/auth/sms-login', {
    method: 'POST',
    data: { phone, code }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '登录失败')
    setTokens(res.data.biz_token, res.data.refresh_token)
    if (res.data.user_info) {
      wx.setStorageSync('tz_user_info', res.data.user_info)
    }
    return res.data
  })
}

/** 微信手机号快捷登录 */
function wxPhoneLogin(phoneCode, loginCode) {
  return request('/api/v1/auth/wx-phone-login', {
    method: 'POST',
    data: { phoneCode, loginCode }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '登录失败')
    setTokens(res.data.biz_token, res.data.refresh_token)
    if (res.data.user_info) {
      wx.setStorageSync('tz_user_info', res.data.user_info)
    }
    return res.data
  })
}

/** 获取当前用户信息 */
function getMe() {
  return request('/api/v1/auth/me').then(res => {
    if (res.code !== 200) throw new Error(res.msg || '获取用户信息失败')
    if (res.data.user_info) {
      wx.setStorageSync('tz_user_info', res.data.user_info)
    }
    return res.data
  })
}

/** 退出登录 */
function logout() {
  return request('/api/v1/auth/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => {
      clearTokens()
    })
}

// ============ 测评接口（自适应引擎 v2） ============

/**
 * 创建测评会话（自适应引擎 v2）
 * 后端自动从PRE1开始，返回第一道题
 * 
 * Response: {
 *   sessionId, currentSubLevel, currentMajorLevel,
 *   questionIndex, totalAnswered,
 *   question: { questionId, audioUrl, questionText, subLevel }
 * }
 */
function startTest() {
  return request('/api/v1/test/start', {
    method: 'POST'
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '创建测评失败')
    return res.data
  })
}

/**
 * 提交回答并获取下一题（自适应引擎 v2 核心接口）
 * 
 * 后端逻辑：
 * - 每个小级2道题，2道全通过→升级到下一小级
 * - 1通过1不通过→定为当前小级所属大级，结束
 * - 0通过→定为前一个大级（最低0），结束
 * 
 * @param {object} params
 * @param {string} params.sessionId - 测评会话ID（必填）
 * @param {string|number} params.questionId - 题目ID（必填）
 * @param {string} [params.audioUrl] - 录音OSS地址
 * @param {string} [params.recognizedText] - 前端语音识别文本
 * @param {number} [params.duration] - 回答用时（毫秒）
 * 
 * Response (status=continue): {
 *   evaluation: { passed, score, scoreDetail, feedback },
 *   status: "continue",
 *   currentSubLevel, currentMajorLevel, questionIndex, totalAnswered,
 *   question: { questionId, audioUrl, questionText, subLevel }
 * }
 * 
 * Response (status=finished): {
 *   evaluation: { passed, score, scoreDetail, feedback },
 *   status: "finished",
 *   question: null,
 *   result: {
 *     majorLevel, majorLevelName, highestSubLevel, overallScore,
 *     totalQuestions, passedQuestions, totalDuration,
 *     report: { pronunciation, grammar, vocabulary, fluency, summary, strengths, weaknesses, recommendation },
 *     groupQrcode: { groupName, qrcodeUrl }
 *   }
 * }
 */
function evaluateAnswer(params) {
  const data = {
    sessionId: params.sessionId,
    questionId: params.questionId
  }

  // 可选字段 - 只传有值的
  if (params.audioUrl) {
    data.audioUrl = params.audioUrl
  }
  if (params.recognizedText) {
    data.recognizedText = params.recognizedText
  }
  if (params.duration !== undefined && params.duration !== null) {
    data.duration = params.duration
  }

  return request('/api/v1/test/evaluate', {
    method: 'POST',
    data
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '评估失败')
    return res.data
  })
}

/**
 * 获取测评结果详情（自适应引擎 v2）
 * 
 * Response: {
 *   majorLevel, majorLevelName, highestSubLevel, overallScore,
 *   totalQuestions, passedQuestions, totalDuration,
 *   report: { pronunciation, grammar, vocabulary, fluency, summary, strengths, weaknesses, recommendation },
 *   groupQrcode: { groupName, qrcodeUrl }
 * }
 */
function getTestResult(sessionId) {
  return request(`/api/v1/test/result/${sessionId}`).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '获取结果失败')
    return res.data
  })
}

/** 上传测评录音 */
function uploadAudio(filePath, sessionId, questionId) {
  return uploadFile('/api/v1/test/upload-audio', filePath, 'file', {
    sessionId,
    questionId
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '上传失败')
    return res.data
  })
}

/** 语音转文字（Whisper，后端集成） */
function transcribeAudio(audioUrl, language = 'en') {
  return request('/api/v1/test/transcribe', {
    method: 'POST',
    data: { audioUrl, language }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '转写失败')
    return res.data
  })
}

/** 终止测评会话 */
function terminateTest(sessionId, reason) {
  return request('/api/v1/test/terminate', {
    method: 'POST',
    data: { sessionId, reason }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '终止失败')
    return res.data
  })
}

/** 查询测评历史 */
function getTestHistory(page = 1, pageSize = 20) {
  return request(`/api/v1/test/history?page=${page}&pageSize=${pageSize}`).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '获取历史失败')
    return res.data
  })
}

/** 文本转语音 */
function textToSpeech(text, voice = 'en-US-female', speed = 0.85) {
  return request('/api/v1/test/tts', {
    method: 'POST',
    data: { text, voice, speed }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || 'TTS失败')
    return res.data
  })
}

/**
 * 获取群二维码
 * @param {number} level - 等级数字（0=零级, 1=一级, 2=二级, 3=三级）
 */
function getQrcodeByLevel(level) {
  return request(`/api/v1/qrcode/level/${level}`).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '获取二维码失败')
    return res.data
  })
}

module.exports = {
  sendSmsCode,
  smsLogin,
  wxPhoneLogin,
  getMe,
  logout,
  startTest,
  evaluateAnswer,
  getTestResult,
  uploadAudio,
  transcribeAudio,
  terminateTest,
  getTestHistory,
  textToSpeech,
  getQrcodeByLevel
}
