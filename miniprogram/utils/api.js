/**
 * 途正英语 - API接口封装
 * 对接后端自适应分级测评引擎 v2
 * 后端地址: https://tzapp-admin.figo.cn
 */
const { request, uploadFile, setTokens, clearTokens, ensureTokenValid } = require('./request')

// ============ Token 定时刷新 ============
let _tokenRefreshTimer = null

/**
 * 启动Token定时刷新器
 * 登录成功后调用，读取expires_in字段，在过期前2-3分钟自动刷新
 * @param {number} expiresIn - Token有效期（秒）
 */
function startTokenRefreshTimer(expiresIn) {
  // 清除旧定时器
  if (_tokenRefreshTimer) {
    clearTimeout(_tokenRefreshTimer)
    _tokenRefreshTimer = null
  }

  if (!expiresIn || expiresIn <= 0) {
    console.log('[TokenTimer] No expires_in provided, skipping timer setup')
    return
  }

  // 在过期前3分钟刷新（最少提前30秒）
  const refreshBeforeSec = Math.min(180, Math.floor(expiresIn * 0.3))
  const refreshDelaySec = Math.max(30, expiresIn - refreshBeforeSec)

  console.log(`[TokenTimer] Token expires in ${expiresIn}s, will refresh in ${refreshDelaySec}s (${refreshBeforeSec}s before expiry)`)

  _tokenRefreshTimer = setTimeout(async () => {
    console.log('[TokenTimer] Auto-refreshing token...')
    try {
      await ensureTokenValid()
      // 刷新成功后，重新读取新Token的过期时间并启动新定时器
      // 由于我们不知道新Token的确切expires_in，用原来的值重新设置
      startTokenRefreshTimer(expiresIn)
    } catch (e) {
      console.warn('[TokenTimer] Auto-refresh failed:', e.message)
      // 失败后30秒重试
      _tokenRefreshTimer = setTimeout(() => startTokenRefreshTimer(expiresIn), 30000)
    }
  }, refreshDelaySec * 1000)
}

/** 停止Token定时刷新器 */
function stopTokenRefreshTimer() {
  if (_tokenRefreshTimer) {
    clearTimeout(_tokenRefreshTimer)
    _tokenRefreshTimer = null
    console.log('[TokenTimer] Timer stopped')
  }
}

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
    // 启动Token定时刷新器
    if (res.data.expires_in) {
      startTokenRefreshTimer(res.data.expires_in)
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
    // 启动Token定时刷新器
    if (res.data.expires_in) {
      startTokenRefreshTimer(res.data.expires_in)
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
      stopTokenRefreshTimer()
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
    const data = res.data
    // 兼容下划线命名（后端可能用session_id而不是sessionId）
    if (!data.sessionId && data.session_id) data.sessionId = data.session_id
    if (!data.totalAnswered && data.total_answered !== undefined) data.totalAnswered = data.total_answered
    if (!data.currentSubLevel && data.current_sub_level) data.currentSubLevel = data.current_sub_level
    if (data.currentMajorLevel === undefined && data.current_major_level !== undefined) data.currentMajorLevel = data.current_major_level
    if (!data.questionIndex && data.question_index) data.questionIndex = data.question_index
    return data
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
  // 同时发送驼峰和下划线两种格式，确保后端能识别
  const data = {
    sessionId: params.sessionId,
    session_id: params.sessionId,
    questionId: params.questionId,
    question_id: params.questionId
  }

  // 传递questionText给后端，确保LLM评分使用正确的题目上下文
  // 这是防止网络中断导致前后端题目状态不同步的关键
  if (params.questionText) {
    data.questionText = params.questionText
    data.question_text = params.questionText
  }

  // audioUrl：始终传递（后端需要用audioUrl做兜底转写）
  if (params.audioUrl) {
    data.audioUrl = params.audioUrl
    data.audio_url = params.audioUrl
  }
  // recognizedText：始终传递（即使为空也传，让后端知道前端没识别到，需要后端自己转写）
  // 之前的bug：空字符串时不传这个字段，后端以为前端没传 → 直接返回0分
  data.recognizedText = params.recognizedText || ''
  data.recognized_text = params.recognizedText || ''
  if (params.duration !== undefined && params.duration !== null) {
    data.duration = params.duration
  }

  return request('/api/v1/test/evaluate', {
    method: 'POST',
    data
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '评估失败')
    const result = res.data
    // 兼容下划线命名
    if (!result.totalAnswered && result.total_answered !== undefined) result.totalAnswered = result.total_answered
    if (!result.currentSubLevel && result.current_sub_level) result.currentSubLevel = result.current_sub_level
    if (result.currentMajorLevel === undefined && result.current_major_level !== undefined) result.currentMajorLevel = result.current_major_level
    if (!result.questionIndex && result.question_index) result.questionIndex = result.question_index
    if (!result.sessionId && result.session_id) result.sessionId = result.session_id
    return result
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
    session_id: sessionId,
    questionId,
    question_id: questionId
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '上传失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.audioUrl && data.audio_url) data.audioUrl = data.audio_url
    if (!data.audioUrl && data.url) data.audioUrl = data.url
    return data
  })
}

/** 语音转文字（Whisper，后端集成） */
function transcribeAudio(audioUrl, language = 'en') {
  return request('/api/v1/test/transcribe', {
    method: 'POST',
    data: { audioUrl, audio_url: audioUrl, language }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '转写失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.text && data.transcription) data.text = data.transcription
    return data
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
