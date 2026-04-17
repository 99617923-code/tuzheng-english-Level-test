/**
 * 途正英语 - API接口封装
 * 对接后端自适应分级测评引擎 v2
 * 后端地址: https://super.tuzheng.cn
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
    // Token timer: no expires_in provided
    return
  }

  // 在过期前3分钟刷新（最少提前30秒）
  const refreshBeforeSec = Math.min(180, Math.floor(expiresIn * 0.3))
  const refreshDelaySec = Math.max(30, expiresIn - refreshBeforeSec)

  // Token timer scheduled

  _tokenRefreshTimer = setTimeout(async () => {

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

// ============ 测评接口（自适应引擎 v2 + AI跳级 v1.3.0） ============

/**
 * 获取测评模式列表（v1.3.0 新增）
 * 无需 Authorization，只需 X-App-Key
 * 返回可用的测评模式（standard / ai_smart）及其描述
 * 可在前端做本地缓存
 * 
 * Response: {
 *   modes: [
 *     { mode, name, description, tips: string[], isDefault: boolean }
 *   ]
 * }
 */
function getEvaluateModes() {
  return request('/api/v1/test/evaluate-modes', { noAuth: true }).then(res => {
    if (res.code !== 200 && res.code !== 0) throw new Error(res.msg || '获取测评模式失败')
    return res.data
  }).catch(err => {
    console.warn('[API] getEvaluateModes failed:', err)
    // 降级返回默认模式列表
    return {
      modes: [
        {
          mode: 'standard',
          name: '逐级测评模式',
          description: '从基础级别开始，逐级测评，直到找到您的真实水平。',
          tips: ['适合所有水平的用户', '测评结果更稳定准确'],
          isDefault: true
        },
        {
          mode: 'ai_smart',
          name: 'AI智能跳级模式',
          description: 'AI根据回答质量智能判断水平，高水平用户可快速跳级。',
          tips: ['请按最高水平回答', '回答可以丰富些'],
          isDefault: false
        }
      ]
    }
  })
}

/**
 * 创建测评会话（自适应引擎 v2 + AI跳级 v1.3.0）
 * 后端自动从PRE1开始，返回第一道题
 * 
 * @param {object} [options] - 可选参数
 * @param {boolean} [options.forceNew=false] - 是否强制创建新会话（终止旧会话）
 * @param {string} [options.evaluateMode='standard'] - 测评模式：standard（逐级）或 ai_smart（AI跳级）
 * 
 * Response: {
 *   sessionId, currentSubLevel, currentMajorLevel,
 *   questionIndex, totalAnswered, resumed,
 *   evaluateMode,  // 当前会话使用的模式
 *   question: { questionId, audioUrl, questionText, subLevel }
 * }
 */
function startTest(options = {}) {
  const data = {}
  if (options.forceNew) {
    data.forceNew = true
  }
  // v1.3.0: 传递测评模式
  if (options.evaluateMode) {
    data.evaluateMode = options.evaluateMode
    data.evaluate_mode = options.evaluateMode
  }
  console.log('[API] startTest sending data:', JSON.stringify(data))
  return request('/api/v1/test/start', {
    method: 'POST',
    data
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '创建测评失败')
    const data = res.data
    // 兼容下划线命名（后端可能用session_id而不是sessionId）
    if (!data.sessionId && data.session_id) data.sessionId = data.session_id
    if (!data.totalAnswered && data.total_answered !== undefined) data.totalAnswered = data.total_answered
    if (!data.currentSubLevel && data.current_sub_level) data.currentSubLevel = data.current_sub_level
    if (data.currentMajorLevel === undefined && data.current_major_level !== undefined) data.currentMajorLevel = data.current_major_level
    if (!data.questionIndex && data.question_index) data.questionIndex = data.question_index
    // v1.3.0: 兼容evaluateMode字段
    if (!data.evaluateMode && data.evaluate_mode) data.evaluateMode = data.evaluate_mode
    return data
  })
}

/**
 * 提交回答并获取下一题（自适应引擎 v2 核心接口）
 * 
 * 后端逻辑（新算法 v4）：
 * - 每个小级2-4题动态出题
 * - 连续2题≥60分直接升级（快速通道）
 * - 否则继续出到最多4题，4题平均分<60判定不通过
 * - 升级时返回levelUp=true + levelUpMessage字段
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
 *   levelUp: boolean,           // 是否升级到新小级
 *   levelUpMessage: string,     // 升级提示文案（如"恭喜你，升级到G1！"）
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
 *     report: { pronunciation, grammar, vocabulary, fluency, summary, strengths, weaknesses, recommendation }
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
    // 兼容升级相关字段（后端新算法）
    if (result.levelUp === undefined && result.level_up !== undefined) result.levelUp = result.level_up
    if (!result.levelUpMessage && result.level_up_message) result.levelUpMessage = result.level_up_message
    // 兼容等级名称和描述字段
    if (!result.majorLevelName && result.major_level_name) result.majorLevelName = result.major_level_name
    if (!result.majorLevelLabel && result.major_level_label) result.majorLevelLabel = result.major_level_label
    // v1.3.0: 兼容AI跳级字段
    if (result.aiSmartJump === undefined && result.ai_smart_jump) result.aiSmartJump = result.ai_smart_jump
    if (result.aiSmartJump && result.aiSmartJump.estimation === undefined && result.aiSmartJump.jump_target) {
      result.aiSmartJump.jumpTarget = result.aiSmartJump.jump_target
    }
    // finished状态时，从finished result中提取字段
    if (result.result) {
      if (!result.result.majorLevelName && result.result.major_level_name) result.result.majorLevelName = result.result.major_level_name
      if (!result.result.majorLevelLabel && result.result.major_level_label) result.result.majorLevelLabel = result.result.major_level_label
    }
    return result
  })
}

/**
 * 获取测评结果详情（自适应引擎 v2）
 * 
 * Response: {
 *   majorLevel, majorLevelName, highestSubLevel, overallScore,
 *   totalQuestions, passedQuestions, totalDuration,
 *   report: { pronunciation, grammar, vocabulary, fluency, summary, strengths, weaknesses, recommendation }
 * }
 */
function getTestResult(sessionId) {
  return request(`/api/v1/test/result/${sessionId}`).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '获取结果失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.majorLevelName && data.major_level_name) data.majorLevelName = data.major_level_name
    if (!data.majorLevelLabel && data.major_level_label) data.majorLevelLabel = data.major_level_label
    if (!data.highestSubLevel && data.highest_sub_level) data.highestSubLevel = data.highest_sub_level
    return data
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
 * 获取外教信息配置（公开接口，无需认证）
 * 用于小程序端展示外教形象
 * 
 * Response: {
 *   name: "Kris",
 *   title: "外教Kris老师",
 *   avatarUrl: "https://...",
 *   introAudioUrl: "https://..."
 * }
 */
function getTeacherConfig() {
  return request('/api/v1/test/teacher-config', { noAuth: true }).then(res => {
    if (res.code !== 200 && res.code !== 0) throw new Error(res.msg || '获取外教配置失败')
    const data = res.data || {}
    // 兼容下划线命名
    if (!data.avatarUrl && data.avatar_url) data.avatarUrl = data.avatar_url
    if (!data.introAudioUrl && data.intro_audio_url) data.introAudioUrl = data.intro_audio_url
    return data
  }).catch(err => {
    console.warn('[API] getTeacherConfig failed:', err)
    // 降级返回默认值
    return {
      name: 'Kris',
      title: '外教Kris老师',
      avatarUrl: '',
      introAudioUrl: ''
    }
  })
}

/**
 * 获取测评报告（需认证）
 * evaluate精简后，详细报告通过此接口获取
 * 
 * @param {string} sessionId - 测评会话ID
 * 
 * Response: {
 *   majorLevel, majorLevelName, highestSubLevel, overallScore,
 *   totalQuestions, passedQuestions, totalDuration,
 *   report: { pronunciation, grammar, vocabulary, fluency, summary, strengths, weaknesses, recommendation }
 * }
 */
function getTestReport(sessionId) {
  return request(`/api/v1/test/report/${sessionId}`).then(res => {
    if (res.code !== 200 && res.code !== 0) throw new Error(res.msg || '获取测评报告失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.majorLevelName && data.major_level_name) data.majorLevelName = data.major_level_name
    if (!data.majorLevelLabel && data.major_level_label) data.majorLevelLabel = data.major_level_label
    if (!data.highestSubLevel && data.highest_sub_level) data.highestSubLevel = data.highest_sub_level
    if (!data.overallScore && data.overall_score !== undefined) data.overallScore = data.overall_score
    if (!data.totalQuestions && data.total_questions !== undefined) data.totalQuestions = data.total_questions
    if (!data.passedQuestions && data.passed_questions !== undefined) data.passedQuestions = data.passed_questions
    if (!data.totalDuration && data.total_duration !== undefined) data.totalDuration = data.total_duration
    return data
  })
}

/**
 * 获取首页讲解视频（公开接口，无需认证）
 * @returns {Promise<{videoUrl: string, coverUrl: string} | null>} 有视频返回视频信息，无视频返回null
 */
function getIntroVideo() {
  return request('/api/v1/test/intro-video', { noAuth: true }).then(res => {
    if (res.code === 200 && res.data && res.data.videoUrl) {
      return res.data
    }
    return null
  }).catch(err => {
    console.warn('[API] getIntroVideo failed:', err)
    return null
  })
}

/**
 * 确认分级（用户最终确认自己的等级，确认后不可再测评）
 * @param {string} sessionId - 测评会话ID
 * @param {number} majorLevel - 确认的大级别（0/1/2/3）
 * @param {string} [majorLevelName] - 级别名称
 * 
 * Response: {
 *   confirmed: true,
 *   majorLevel, majorLevelName, confirmedAt
 * }
 */
function confirmLevel(sessionId, majorLevel, majorLevelName) {
  return request('/api/v1/test/confirm-level', {
    method: 'POST',
    data: {
      sessionId,
      session_id: sessionId,
      majorLevel,
      major_level: majorLevel,
      majorLevelName: majorLevelName || '',
      major_level_name: majorLevelName || ''
    }
  }).then(res => {
    // 兼容 code=0 和 code=200 两种成功格式
    if (res.code !== 200 && res.code !== 0) throw new Error(res.msg || '确认分级失败')
    return res.data
  })
}

/**
 * 查询用户分级确认状态
 * 
 * Response (已确认): {
 *   confirmed: true,
 *   level, levelName, levelLabel,
 *   gradeTier, gradeTierLabel,
 *   overallScore, sessionId, confirmedAt
 * }
 * 
 * Response (未确认): {
 *   confirmed: false
 * }
 */
function getUserLevelStatus() {
  return request('/api/v1/test/user-level-status').then(res => {
    // 兼容 code=0 和 code=200 两种成功格式
    if (res.code !== 200 && res.code !== 0) throw new Error(res.msg || '查询分级状态失败')
    // 兼容数据在res.data或直接在res根级别
    const data = res.data || res
    // 兼容下划线命名
    if (data.confirmed === undefined && data.is_confirmed !== undefined) data.confirmed = data.is_confirmed
    if (data.majorLevel === undefined && data.major_level !== undefined) data.majorLevel = data.major_level
    if (data.majorLevel === undefined && data.level !== undefined) data.majorLevel = data.level
    if (!data.majorLevelName && data.major_level_name) data.majorLevelName = data.major_level_name
    if (!data.majorLevelName && data.level_name) data.majorLevelName = data.level_name
    if (!data.majorLevelName && data.levelName) data.majorLevelName = data.levelName
    // 兼容v0.1.7新字段
    if (!data.levelLabel && data.level_label) data.levelLabel = data.level_label
    if (!data.gradeTier && data.grade_tier) data.gradeTier = data.grade_tier
    if (!data.gradeTierLabel && data.grade_tier_label) data.gradeTierLabel = data.grade_tier_label
    if (data.overallScore === undefined && data.overall_score !== undefined) data.overallScore = data.overall_score
    if (!data.confirmedAt && data.confirmed_at) data.confirmedAt = data.confirmed_at
    if (!data.sessionId && data.session_id) data.sessionId = data.session_id
    return data
  })
}

/**
 * 提交自我介绍录音进行水平预估（v4.0 新增）
 * AI智能模式下，start后先录制自我介绍，提交此接口获取预估水平
 * 
 * @param {string} sessionId - 测评会话ID
 * @param {string} audioUrl - 自我介绍录音的OSS地址（由upload-audio上传后获得）
 * 
 * Response: {
 *   estimatedLevel: {
 *     lowerBound, lowerBoundName, upperBound, upperBoundName,
 *     confidence, reasoning
 *   },
 *   startSubLevel, startSubLevelName,
 *   transcript, wordCount,
 *   question: { questionId, audioUrl, questionText, subLevel }
 * }
 */
function selfIntroEstimate(sessionId, audioUrl) {
  return request('/api/v1/test/self-intro-estimate', {
    method: 'POST',
    timeout: 60000,  // 60秒超时：AI分析需要15-30秒（STT转写+LLM多维度分析），默认15s会导致客户端主动断开连接（Nginx 499）
    data: {
      sessionId,
      session_id: sessionId,
      audioUrl,
      audio_url: audioUrl
    }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '自我介绍预估失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.startSubLevel && data.start_sub_level) data.startSubLevel = data.start_sub_level
    if (!data.startSubLevelName && data.start_sub_level_name) data.startSubLevelName = data.start_sub_level_name
    if (!data.wordCount && data.word_count !== undefined) data.wordCount = data.word_count
    if (!data.estimatedLevel && data.estimated_level) data.estimatedLevel = data.estimated_level
    if (data.estimatedLevel) {
      const el = data.estimatedLevel
      if (!el.lowerBound && el.lower_bound) el.lowerBound = el.lower_bound
      if (!el.lowerBoundName && el.lower_bound_name) el.lowerBoundName = el.lower_bound_name
      if (!el.upperBound && el.upper_bound) el.upperBound = el.upper_bound
      if (!el.upperBoundName && el.upper_bound_name) el.upperBoundName = el.upper_bound_name
    }
    // 兼容v4.1新增字段（多维度能力分析）
    if (!data.abilityRadar && data.ability_radar) data.abilityRadar = data.ability_radar
    if (!data.levelRange && data.level_range) data.levelRange = data.level_range
    if (!data.levelRangeNames && data.level_range_names) data.levelRangeNames = data.level_range_names
    if (!data.guidanceText && data.guidance_text) data.guidanceText = data.guidance_text
    if (!data.overallComment && data.overall_comment) data.overallComment = data.overall_comment
    // abilityRadar内部字段兼容
    if (data.abilityRadar && Array.isArray(data.abilityRadar)) {
      data.abilityRadar = data.abilityRadar.map(dim => {
        if (!dim.dimensionName && dim.dimension_name) dim.dimensionName = dim.dimension_name
        return dim
      })
    }
    // 兼容question字段
    if (data.question) {
      const q = data.question
      if (!q.audioUrl && q.audio_url) q.audioUrl = q.audio_url
      if (!q.questionText && q.question_text) q.questionText = q.question_text
      if (!q.questionId && q.question_id) q.questionId = q.question_id
      if (!q.subLevel && q.sub_level) q.subLevel = q.sub_level
    }
    return data
  })
}

/**
 * 跳过自我介绍（v4.0 新增）
 * AI智能模式下，用户选择跳过自我介绍，从PRE1开始做题
 * 
 * @param {string} sessionId - 测评会话ID
 * 
 * Response: {
 *   startSubLevel, startSubLevelName,
 *   question: { questionId, audioUrl, questionText, subLevel }
 * }
 */
function skipIntro(sessionId) {
  return request('/api/v1/test/skip-intro', {
    method: 'POST',
    data: {
      sessionId,
      session_id: sessionId
    }
  }).then(res => {
    if (res.code !== 200) throw new Error(res.msg || '跳过自我介绍失败')
    const data = res.data
    // 兼容下划线命名
    if (!data.startSubLevel && data.start_sub_level) data.startSubLevel = data.start_sub_level
    if (!data.startSubLevelName && data.start_sub_level_name) data.startSubLevelName = data.start_sub_level_name
    // 兼容question字段
    if (data.question) {
      const q = data.question
      if (!q.audioUrl && q.audio_url) q.audioUrl = q.audio_url
      if (!q.questionText && q.question_text) q.questionText = q.question_text
      if (!q.questionId && q.question_id) q.questionId = q.question_id
      if (!q.subLevel && q.sub_level) q.subLevel = q.sub_level
    }
    return data
  })
}

module.exports = {
  sendSmsCode,
  smsLogin,
  wxPhoneLogin,
  getMe,
  logout,
  getEvaluateModes,
  startTest,
  evaluateAnswer,
  getTestResult,
  uploadAudio,
  transcribeAudio,
  terminateTest,
  getTestHistory,
  textToSpeech,
  getIntroVideo,
  confirmLevel,
  getUserLevelStatus,
  getTeacherConfig,
  getTestReport,
  selfIntroEstimate,
  skipIntro
}
