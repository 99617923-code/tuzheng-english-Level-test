/**
 * 途正英语AI分级测评 - 测评主页面（自适应引擎 v2）
 * 
 * 核心流程：
 * 1. startTest → 后端返回第一题（从PRE1开始）
 * 2. 自动播放外教真人语音 → 用户点击录音回答
 * 3. evaluate → 后端AI评分 + 自适应升级判断
 * 4. status=continue → 自动播放下一题（可能升级到更高小级）
 * 5. status=finished → 跳转结果页
 * 
 * 前端保底规则：至少答完6题才允许定级结束
 * 如果后端在6题内返回finished，前端会继续请求新题目
 * 
 * 后端新算法（v4）：
 * - 每个小级2-4题动态出题
 * - 连续2题≥60分直接升级（快速通道）
 * - 4题平均分<60判定不通过
 * - 升级时返回levelUp=true + levelUpMessage字段
 * 
 * 关键修复（v3）：
 * - InnerAudioContext每次播放前销毁重建（解决onEnded不触发的bug）
 * - 增加播放超时保护（15秒内无onEnded则强制进入answering）
 * - 新测评题号强制从1开始（不依赖后端totalAnswered）
 * - 录音上传失败时仍然提交evaluate（让后端处理）
 *
 * 稳定性修复（v5 - 第20题后崩溃修复）：
 * - 录音按钮防抖锁（_isStartingRecord）：防止快速连点导致多次启动录音
 * - currentQuestion null安全检查：submitAnswer/handleSkip/handleNext中防止"null is not an object"
 * - 弹窗互斥锁（_showingModal）：防止多个wx.showModal叠加导致UI卡死
 * - 全局异常恢复（_resetToSafeState）：状态混乱时提供用户可操作的恢复选项
 * - 跳过失败恢复（_handleSkipFailure）：跳过题目valuate失败时提供重试/继续录音选项
 * - 后端question:null安全处理：status:continue但question为null时不崩溃，提示用户选择
 */
const app = getApp()
const { startTest, evaluateAnswer, uploadAudio, terminateTest, transcribeAudio, textToSpeech } = require('../../utils/api')
const { formatTime, showToast, showError, delay } = require('../../utils/util')
const { ensureTokenValid } = require('../../utils/request')

// 同声传译插件
let plugin = null
try {
  plugin = requirePlugin('WechatSI')
} catch (e) {
  console.warn('[Test] WechatSI plugin not available')
}

// 小级→大级映射（用于前端显示）
const SUB_LEVEL_MAJOR = {
  'PRE1': 0, 'PRE2': 0,
  'G1': 1, 'G2': 1, 'G3': 1, 'G4': 1, 'G5': 1, 'G6': 1,
  'G7': 2, 'G8': 2, 'G9': 2, 'G10': 2, 'G11': 2, 'G12': 2,
  'IELTS4': 3, 'IELTS5': 3, 'IELTS6': 3, 'IELTS7': 3, 'IELTS8': 3, 'IELTS9': 3
}

// 大级名称
const MAJOR_LEVEL_NAMES = {
  0: '零级 · 预备',
  1: '一级 · 基础',
  2: '二级 · 中级',
  3: '三级 · 高级'
}

// 最少答题数（前端保底，至少答完这么多题才允许结束）
// 后端新算法：每个小级2-4题动态出题，连续2题≥60分直接升级，4题平均分<60判定不通过
// 前端保底从10降到6，避免与后端新算法冲突（后端正常流程通常超过6题）
const MIN_QUESTIONS_BEFORE_FINISH = 6

// 音频播放超时（毫秒）- 超过此时间没有onEnded则强制进入answering
const AUDIO_PLAY_TIMEOUT = 15000

Page({
  data: {
    aiAvatarUrl: '',
    // 导航布局
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,

    // 测评状态
    phase: 'loading', // guide | loading | listening | answering | evaluating | feedback | levelup

    // 首次引导
    showGuide: false,
    guideStep: 0,
    sessionId: '',

    // 当前题目（v2格式）
    currentQuestion: null,     // { questionId, audioUrl, questionText, subLevel }
    currentSubLevel: 'PRE1',
    currentMajorLevel: 0,
    questionIndex: 1,
    totalAnswered: 0,

    // 显示信息
    subLevelDisplay: 'PRE1',
    majorLevelDisplay: '零级 · 预备',
    questionCountDisplay: '第 1 题',

    // 计时
    timerDisplay: '00:00',
    totalSeconds: 0,

    // 进度
    progressPercent: 0,

    // 音频播放
    audioPlaying: false,
    audioWaves: [],
    aiSpeaking: false,
    aiStatusText: '准备中...',

    // 录音
    isRecording: false,
    recordTimeDisplay: '0"',
    recordSeconds: 0,
    realtimeText: '',
    userTranscription: '',

    // 评价反馈
    evaluationFeedback: '',
    evaluationScore: 0,
    evaluationPassed: false,
    scoreColor: '#1B3F91',

    // 升级提示
    levelUpFrom: '',
    levelUpTo: '',
    levelUpMessage: '',
    showLevelUp: false,

    // 下一步按钮文字
    nextButtonText: '下一题',

    // 音频失败时显示题目文字（兆底）
    showQuestionText: false,
    questionTextDisplay: ''
  },

  // 内部状态
  _timer: null,
  _recordTimer: null,
  _audioContext: null,
  _recorderManager: null,
  _recordFilePath: '',
  _lastEvalResponse: null,
  _previousSubLevel: '',
  _isNavigating: false,
  _isSubmitting: false,
  _isStartingRecord: false,  // 录音启动防抖锁（防止快速连点）
  _showingModal: false,      // 弹窗互斥锁（防止多个wx.showModal叠加）
  _initRetryCount: 0,
  _audioPlayTimeout: null,   // 音频播放超时定时器
  _frontendQuestionCount: 0, // 前端自己维护的答题计数（不依赖后端）
  _pendingLevelUp: false,    // 后端返回的升级标志（缓存到handleNext使用）
  _pendingLevelUpMessage: '', // 后端返回的升级提示文案

  onLoad(options) {
    const navLayout = app.getNavLayout()
    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      audioWaves
    })

    this._recorderManager = wx.getRecorderManager()
    this._isNavigating = false
    this._isSubmitting = false
    this._isStartingRecord = false
    this._showingModal = false
    this._isPageUnloaded = false  // 页面卸载标志，防止离开后录音回调仍弹窗
    this._initRetryCount = 0
    this._frontendQuestionCount = 0
    this._setupRecorderEvents()

    // 检查是否是恢复测评
    if (options && options.resume === '1') {
      this._resumeTest()
    } else {
      // forceNew=1 表示“重新测评”，强制创建新会话
      const forceNew = options && options.forceNew === '1'
      this.initTest(forceNew)
    }
  },

  onUnload() {
    this.cleanup()
  },

  /** 清理资源 */
  cleanup() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
    this._clearAudioTimeout()
    this._destroyAudioContext()
    if (this._recorderManager) {
      try { this._recorderManager.stop() } catch (e) {}
    }
    if (plugin && plugin.voiceRecognizer) {
      try { plugin.voiceRecognizer.stop() } catch (e) {}
    }
    // 标记页面已卸载，防止全局录音回调继续弹窗
    this._isPageUnloaded = true
    // 重置所有锁状态
    this._isSubmitting = false
    this._isStartingRecord = false
    this._showingModal = false
  },

  // ============ 计时器 ============

  startTimer() {
    if (this._timer) return
    this._timer = setInterval(() => {
      const secs = this.data.totalSeconds + 1
      this.setData({
        totalSeconds: secs,
        timerDisplay: formatTime(secs)
      })
    }, 1000)
  },

  // ============ 测评中断恢复 ============

  _saveTestSession() {
    try {
      const { sessionId, currentSubLevel, currentMajorLevel, questionIndex,
              totalAnswered, totalSeconds, currentQuestion } = this.data
      if (!sessionId) return

      const sessionData = {
        sessionId, currentSubLevel, currentMajorLevel, questionIndex,
        totalAnswered, totalSeconds, currentQuestion,
        frontendQuestionCount: this._frontendQuestionCount,
        savedAt: Date.now()
      }
      wx.setStorageSync('tz_test_session', sessionData)
      console.log('[Test] Session saved:', sessionId, 'answered:', totalAnswered, 'frontendCount:', this._frontendQuestionCount)
    } catch (e) {
      console.warn('[Test] Save session failed:', e)
    }
  },

  _clearTestSession() {
    try {
      wx.removeStorageSync('tz_test_session')
      console.log('[Test] Session cache cleared')
    } catch (e) {}
  },

  _getSavedSession() {
    try {
      const saved = wx.getStorageSync('tz_test_session')
      if (!saved || !saved.sessionId) return null
      const elapsed = Date.now() - (saved.savedAt || 0)
      if (elapsed > 30 * 60 * 1000) {
        this._clearTestSession()
        return null
      }
      return saved
    } catch (e) {
      return null
    }
  },

  async _resumeTest() {
    this.setData({ phase: 'loading', aiStatusText: '正在恢复测评...' })

    const saved = this._getSavedSession()
    if (!saved) {
      this.initTest()
      return
    }

    try {
      const data = await startTest()
      const question = data.question
      // 兼容下划线命名
      if (question) {
        console.log('[Resume] Question keys:', Object.keys(question).join(', '))
        if (!question.audioUrl && question.audio_url) question.audioUrl = question.audio_url
        if (!question.questionText && question.question_text) question.questionText = question.question_text
        if (!question.questionId && question.question_id) question.questionId = question.question_id
        if (!question.subLevel && question.sub_level) question.subLevel = question.sub_level
        console.log('[Resume] audioUrl:', question.audioUrl)
      }
      const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))
      const isResumed = data.sessionId === saved.sessionId
      const totalAnswered = data.totalAnswered || data.total_answered || 0

      // 恢复前端计数
      this._frontendQuestionCount = isResumed ? (saved.frontendQuestionCount || totalAnswered) : 0

      this.setData({
        sessionId: data.sessionId,
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        questionIndex: data.questionIndex || 1,
        totalAnswered: totalAnswered,
        totalSeconds: isResumed ? (saved.totalSeconds || 0) : 0,
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '零级 · 预备',
        questionCountDisplay: `第 ${this._frontendQuestionCount + 1} 题`,
        progressPercent: Math.min((this._frontendQuestionCount / 34) * 100, 95),
        phase: 'listening',
        aiStatusText: isResumed ? '已恢复，请听题目' : '请听题目',
        showQuestionText: false,
        questionTextDisplay: ''
      })

      this._previousSubLevel = subLevel
      this.startTimer()
      this._saveTestSession()

      if (isResumed) {
        wx.showToast({ title: `已恢复测评（第${this._frontendQuestionCount + 1}题）`, icon: 'none', duration: 2000 })
      }

      // 自动播放语音
      await delay(800)
      this._playQuestionAudio()

    } catch (err) {
      console.error('[Test] Resume failed:', err)
      if (this._showingModal) return
      this._showingModal = true
      wx.showModal({
        title: '恢复失败',
        content: '无法恢复上次的测评，是否开始新测评？',
        confirmText: '重新开始',
        confirmColor: '#83BA12',
        cancelText: '返回',
        success: (res) => {
          this._showingModal = false
          if (res.confirm) {
            this._clearTestSession()
            this.initTest(true)  // 强制创建新会话
          } else {
            this._clearTestSession()
            if (!this._isNavigating) {
              this._isNavigating = true
              wx.navigateBack({ fail: () => {
                wx.reLaunch({ url: '/pages/home/home' })
              }})
            }
          }
        },
        fail: () => {
          this._showingModal = false
        }
      })
    }
  },

  // ============ 初始化测评（v2） ============

  async initTest(forceNew = false) {
    this.setData({ phase: 'loading', aiStatusText: '正在准备测评...' })

    // 新测评：前端计数强制归零
    this._frontendQuestionCount = 0

    try {
      // forceNew=true 时强制创建新会话（后端会终止旧会话）
      const data = await startTest(forceNew ? { forceNew: true } : {})

      // 打印后端返回的完整数据，方便调试
      console.log('[Test] startTest raw response:', JSON.stringify(data).substring(0, 500))

      const question = data.question
      if (question) {
        console.log('[Test] Question object keys:', Object.keys(question).join(', '))
        console.log('[Test] Question audioUrl:', question.audioUrl)
        console.log('[Test] Question audio_url:', question.audio_url)
        console.log('[Test] Question questionText:', question.questionText)
        console.log('[Test] Question question_text:', question.question_text)
        // 兼容下划线命名：后端可能返回 audio_url 而不是 audioUrl
        if (!question.audioUrl && question.audio_url) {
          question.audioUrl = question.audio_url
        }
        if (!question.questionText && question.question_text) {
          question.questionText = question.question_text
        }
        if (!question.questionId && question.question_id) {
          question.questionId = question.question_id
        }
        if (!question.subLevel && question.sub_level) {
          question.subLevel = question.sub_level
        }
        console.log('[Test] Question after normalization - audioUrl:', question.audioUrl, 'questionText:', question.questionText)
      } else {
        console.error('[Test] No question in response!')
      }

      const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))

      this.setData({
        sessionId: data.sessionId,
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        questionIndex: data.questionIndex || 1,
        totalAnswered: 0,  // 新测评强制从0开始
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '零级 · 预备',
        questionCountDisplay: '第 1 题',  // 强制显示第1题
        progressPercent: 0,
        phase: 'guide',
        showGuide: true,
        guideStep: 1,
        aiStatusText: '你好！我是你的AI外教',
        showQuestionText: false,
        questionTextDisplay: ''
      })

      this._previousSubLevel = subLevel
      this._saveTestSession()
    } catch (err) {
      console.error('[Test] Init error:', err)

      if (err.message && (err.message.includes('登录') || err.message.includes('AUTH'))) {
        showError('请先登录后再开始测评')
        setTimeout(() => {
          if (!this._isNavigating) {
            this._isNavigating = true
            wx.navigateBack({ fail: () => {
              wx.reLaunch({ url: '/pages/home/home' })
            }})
          }
        }, 1500)
        return
      }

      this._initRetryCount = (this._initRetryCount || 0) + 1
      if (this._initRetryCount <= 2) {
        showToast(`正在重试...(${this._initRetryCount}/2)`)
        await delay(2000)
        this.initTest()
        return
      }

      if (this._showingModal) return
      this._showingModal = true
      wx.showModal({
        title: '创建测评失败',
        content: err.message || '服务器响应异常，请稍后再试',
        confirmText: '重试',
        cancelText: '返回',
        confirmColor: '#83BA12',
        success: (res) => {
          this._showingModal = false
          if (res.confirm) {
            this._initRetryCount = 0
            this.initTest()
          } else {
            if (!this._isNavigating) {
              this._isNavigating = true
              wx.navigateBack({ fail: () => {
                wx.reLaunch({ url: '/pages/home/home' })
              }})
            }
          }
        },
        fail: () => {
          this._showingModal = false
        }
      })
    }
  },

  // ============ 音频播放（核心修复：每次重建audioContext） ============

  /**
   * 销毁当前audioContext
   * 微信小程序的InnerAudioContext在复用时onEnded经常不触发
   * 所以每次播放新音频前必须销毁旧的并重新创建
   */
  _destroyAudioContext() {
    if (this._audioContext) {
      try {
        this._audioContext.stop()
      } catch (e) {}
      try {
        this._audioContext.destroy()
      } catch (e) {}
      this._audioContext = null
    }
  },

  /**
   * 创建新的audioContext并绑定事件
   * @returns {InnerAudioContext}
   */
  _createAudioContext() {
    this._destroyAudioContext()

    const ctx = wx.createInnerAudioContext()
    ctx.obeyMuteSwitch = false  // 不受静音开关影响

    ctx.onPlay(() => {
      console.log('[Audio] onPlay fired')
      this._clearAudioTimeout()
      this.setData({ audioPlaying: true, aiSpeaking: true, aiStatusText: '外教正在提问...' })
      // 开始播放后设置超时保护
      this._setAudioTimeout()
    })

    ctx.onEnded(() => {
      console.log('[Audio] onEnded fired')
      this._clearAudioTimeout()
      this._onAudioFinished()
    })

    ctx.onError((err) => {
      console.error('[Audio] onError:', err)
      this._clearAudioTimeout()
      // 音频播放出错 → 尝试TTS降级
      this._tryTTSFallback()
    })

    ctx.onStop(() => {
      console.log('[Audio] onStop fired')
      // onStop是手动stop触发的，不自动进入answering
      this.setData({ audioPlaying: false, aiSpeaking: false })
    })

    this._audioContext = ctx
    return ctx
  },

  /**
   * 音频播放完成后的统一处理
   */
  _onAudioFinished() {
    this.setData({
      audioPlaying: false,
      aiSpeaking: false,
      aiStatusText: '请用英语回答',
      phase: 'answering'
    })
  },

  /**
   * 设置音频播放超时保护
   * 如果15秒内没有onEnded/onError触发，强制进入answering阶段
   */
  _setAudioTimeout() {
    this._clearAudioTimeout()
    this._audioPlayTimeout = setTimeout(() => {
      console.warn('[Audio] Play timeout! Force entering answering phase.')
      // 检查当前是否还在listening阶段
      if (this.data.phase === 'listening') {
        this._destroyAudioContext()
        this._onAudioFinished()
      }
    }, AUDIO_PLAY_TIMEOUT)
  },

  /**
   * 清除音频播放超时定时器
   */
  _clearAudioTimeout() {
    if (this._audioPlayTimeout) {
      clearTimeout(this._audioPlayTimeout)
      this._audioPlayTimeout = null
    }
  },

  /**
   * 播放题目音频（核心方法）
   * 每次调用都会重建audioContext，确保事件回调正常
   */
  _playQuestionAudio() {
    const { currentQuestion } = this.data

    if (!currentQuestion) {
      console.error('[Audio] No currentQuestion')
      this._onAudioFinished()
      return
    }

    const audioUrl = currentQuestion.audioUrl
    if (audioUrl) {
      console.log('[Audio] Playing question audio:', audioUrl)
      this.setData({ phase: 'listening', aiStatusText: '外教正在提问...' })

      const ctx = this._createAudioContext()
      ctx.src = audioUrl
      ctx.play()

      // 设置初始超时（等待onPlay触发后会重新设置）
      this._setAudioTimeout()
    } else {
      // 没有audioUrl → 尝试TTS降级
      console.log('[Audio] No audioUrl, trying TTS fallback')
      this._tryTTSFallback()
    }
  },

  /** 手动点击语音条重播 */
  playAudio() {
    const { currentQuestion, audioPlaying } = this.data

    if (audioPlaying) {
      this._clearAudioTimeout()
      if (this._audioContext) {
        try { this._audioContext.stop() } catch (e) {}
      }
      return
    }

    if (!currentQuestion || !currentQuestion.audioUrl) return

    // 重播也要重建audioContext
    const ctx = this._createAudioContext()
    ctx.src = currentQuestion.audioUrl
    ctx.play()
    this._setAudioTimeout()
  },

  /**
   * TTS降级方案（三级降级）：
   * 1. 优先用微信同声传译插件的textToSpeech（前端直接合成，不依赖后端）
   * 2. 插件不可用时尝试后端TTS接口
   * 3. 都失败时显示题目文字让用户看着回答
   */
  _tryTTSFallback() {
    const { currentQuestion } = this.data
    if (!currentQuestion || !currentQuestion.questionText) {
      console.warn('[TTS] No questionText available, skip to answering')
      this._onAudioFinished()
      return
    }

    console.log('[TTS] Generating speech for:', currentQuestion.questionText)
    this.setData({ phase: 'listening', aiStatusText: '正在生成语音...' })

    // 第一级：用微信同声传译插件的TTS（前端直接合成）
    if (plugin && plugin.textToSpeech) {
      console.log('[TTS] Using WechatSI plugin textToSpeech')
      const self = this
      plugin.textToSpeech({
        lang: 'en_US',
        tts: true,
        content: currentQuestion.questionText.substring(0, 50), // 插件限制50字符
        success: function(res) {
          console.log('[TTS] WechatSI success, retcode:', res.retcode, 'filename:', res.filename)
          if (res.filename) {
            // 用InnerAudioContext播放合成的语音
            const updatedQuestion = { ...currentQuestion, audioUrl: res.filename }
            self.setData({ currentQuestion: updatedQuestion })

            const ctx = self._createAudioContext()
            ctx.src = res.filename
            ctx.play()
            self._setAudioTimeout()
          } else {
            console.warn('[TTS] WechatSI returned no filename, trying backend TTS')
            self._tryBackendTTS()
          }
        },
        fail: function(err) {
          console.warn('[TTS] WechatSI failed:', err)
          self._tryBackendTTS()
        }
      })
    } else {
      console.warn('[TTS] WechatSI plugin not available, trying backend TTS')
      this._tryBackendTTS()
    }
  },

  /** 第二级降级：后端TTS接口 */
  async _tryBackendTTS() {
    const { currentQuestion } = this.data
    try {
      const ttsRes = await textToSpeech(currentQuestion.questionText)
      const ttsUrl = ttsRes.audioUrl || ttsRes.audio_url || ttsRes.url || ''

      if (ttsUrl) {
        console.log('[TTS] Backend TTS success:', ttsUrl)
        const updatedQuestion = { ...currentQuestion, audioUrl: ttsUrl }
        this.setData({ currentQuestion: updatedQuestion })

        const ctx = this._createAudioContext()
        ctx.src = ttsUrl
        ctx.play()
        this._setAudioTimeout()
      } else {
        console.warn('[TTS] Backend TTS returned no URL, showing question text')
        this._showQuestionTextFallback()
      }
    } catch (e) {
      console.warn('[TTS] Backend TTS failed:', e)
      this._showQuestionTextFallback()
    }
  },

  /** 第三级降级：显示题目文字让用户看着回答 */
  _showQuestionTextFallback() {
    const { currentQuestion } = this.data
    console.log('[TTS] All TTS failed, showing question text as fallback')
    // 设置一个标记让UI显示题目文字
    this.setData({
      showQuestionText: true,
      questionTextDisplay: currentQuestion.questionText || 'Please answer the question.'
    })
    // 给用户3秒阅读时间后进入回答阶段
    setTimeout(() => {
      this._onAudioFinished()
    }, 3000)
  },

  // ============ 录音（tap切换模式） ============

  _setupRecorderEvents() {
    this._recorderManager.onStart(() => {
      console.log('[Recorder] Started')
      this._isStartingRecord = false  // 录音已成功启动，解除防抖锁
      if (this._isPageUnloaded) {
        console.log('[Recorder] Page unloaded, ignoring onStart callback')
        try { this._recorderManager.stop() } catch (e) {}
        return
      }
      this.setData({ isRecording: true, recordSeconds: 0, recordTimeDisplay: '0"' })

      this._recordTimer = setInterval(() => {
        const secs = this.data.recordSeconds + 1
        this.setData({
          recordSeconds: secs,
          recordTimeDisplay: `${secs}"`
        })
        if (secs >= 60) {
          this.stopRecording()
        }
      }, 1000)

      this._startVoiceRecognition()
    })

    this._recorderManager.onStop((res) => {
      console.log('[Recorder] Stopped, path:', res.tempFilePath)
      this._isStartingRecord = false  // 确保录音停止后解除防抖锁
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
      // 页面已卸载时不再操作UI
      if (this._isPageUnloaded) {
        console.log('[Recorder] Page unloaded, ignoring onStop callback')
        return
      }
      this._recordFilePath = res.tempFilePath
      this.setData({ isRecording: false })

      if (plugin && plugin.voiceRecognizer) {
        try { plugin.voiceRecognizer.stop() } catch (e) {}
      }

      if (this._recordFilePath && this.data.recordSeconds >= 1) {
        // 至少录了1秒才提交
        this.submitAnswer()
      } else if (this._recordFilePath && this.data.recordSeconds < 1) {
        showToast('录音时间太短，请重新录制')
        this._recordFilePath = ''
      }
    })

    this._recorderManager.onError((err) => {
      console.error('[Recorder] Error:', err)
      this._isStartingRecord = false  // 录音失败，解除防抖锁
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
      // 页面已卸载时不再操作UI和弹窗
      if (this._isPageUnloaded) {
        console.log('[Recorder] Page unloaded, ignoring error callback')
        return
      }
      this.setData({ isRecording: false })
      showError('录音失败，请重试')
    })
  },

  /** 点击切换录音（tap模式） */
  toggleRecording() {
    // 防护：非回答阶段不响应
    if (this.data.phase !== 'answering') {
      console.warn('[Recording] Ignored: phase is', this.data.phase)
      return
    }
    // 防护：正在启动录音中，不响应连点
    if (this._isStartingRecord) {
      console.warn('[Recording] Ignored: already starting record')
      return
    }

    if (this.data.isRecording) {
      this.stopRecording()
    } else {
      this.startRecording()
    }
  },

  /** 开始录音 */
  startRecording() {
    if (this.data.isRecording) return
    if (this._isStartingRecord) return  // 防抖锁

    this._isStartingRecord = true  // 加锁

    // 先检查录音权限
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          this._isStartingRecord = false  // 解锁
          wx.showModal({
            title: '需要录音权限',
            content: '请在设置中开启麦克风权限，否则无法进行测评',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting()
              }
            }
          })
          return
        }

        this._doStartRecording()
      },
      fail: () => {
        this._doStartRecording()
      }
    })
  },

  /** 实际启动录音 */
  _doStartRecording() {
    this.setData({ realtimeText: '', userTranscription: '', evaluationFeedback: '' })

    try {
      this._recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 96000,
        format: 'mp3',
        frameSize: 50
      })
      // 注意：_isStartingRecord 在 onStart 回调中解锁
    } catch (e) {
      console.error('[Recorder] Start exception:', e)
      this._isStartingRecord = false  // 异常时解锁
      showError('录音启动失败，请重试')
    }
  },

  /** 停止录音 */
  stopRecording() {
    if (!this.data.isRecording) return
    this._recorderManager.stop()
  },

  /** 启动同声传译语音识别 */
  _startVoiceRecognition() {
    if (!plugin || !plugin.voiceRecognizer) {
      console.warn('[VoiceRecognizer] Plugin not available')
      return
    }

    const manager = plugin.voiceRecognizer

    manager.onRecognize = (res) => {
      if (res.result) {
        this.setData({ realtimeText: res.result })
      }
    }

    manager.onStop = (res) => {
      if (res.result) {
        this.setData({
          realtimeText: '',
          userTranscription: res.result
        })
      }
    }

    manager.onError = (err) => {
      console.warn('[VoiceRecognizer] Error:', err)
    }

    try {
      manager.start({
        lang: 'en_US',
        isAutoDetect: false,
        duration: 60000
      })
    } catch (e) {
      console.warn('[VoiceRecognizer] Start failed:', e)
    }
  },

  // ============ 提交评估（v2 自适应引擎） ============

  async submitAnswer() {
    const { sessionId, currentQuestion, userTranscription, recordSeconds } = this.data

    if (!this._recordFilePath) {
      this.setData({ phase: 'answering' })
      return
    }

    // 安全检查：currentQuestion为null时不提交（防止"null is not an object"报错）
    if (!currentQuestion || !currentQuestion.questionId) {
      console.error('[Submit] currentQuestion is null or missing questionId, resetting to safe state')
      this._resetToSafeState('题目数据异常，请点击“跳过此题”或等待下一题')
      return
    }

    if (this._isSubmitting) {
      console.warn('[Submit] Already submitting, skip')
      return
    }
    this._isSubmitting = true

    // 提前检查Token有效性，快过期时主动刷新（避免上传/评估过程中遇到401）
    await ensureTokenValid()

    this.setData({
      phase: 'evaluating',
      aiStatusText: '正在评估你的回答...'
    })

    try {
      // 第一步：上传录音到OSS
      let audioUrl = ''
      try {
        const uploadRes = await uploadAudio(
          this._recordFilePath,
          sessionId,
          currentQuestion.questionId
        )
        audioUrl = uploadRes.audioUrl || uploadRes.audio_url || uploadRes.url || ''
        console.log('[Upload] Audio uploaded:', audioUrl)
      } catch (e) {
        console.warn('[Upload] Failed:', e.message)
        // 上传失败不阻断流程，继续提交evaluate
      }

      // 第二步：跳过单独的Whisper转写调用，直接把audioUrl传给evaluate
      // 速度优化：让后端在evaluate内部并行处理转写+评分，节省3-5秒
      let finalTranscription = userTranscription || ''
      if (!finalTranscription && audioUrl) {
        console.log('[Speed] Skipping separate transcribe call, backend will handle transcription in evaluate')
      }

      // 第三步：调用v2 evaluate接口（带重试机制）
      // 即使audioUrl和recognizedText都为空，也要提交（让后端判断）
      const evalParams = {
        sessionId,
        questionId: currentQuestion.questionId,
        // 传递questionText给后端，确保LLM评分使用正确的题目上下文
        questionText: currentQuestion.questionText || '',
        recognizedText: finalTranscription || '',
        duration: recordSeconds * 1000
      }
      // 始终传递audioUrl（后端需要用它做转写+评分）
      if (audioUrl) {
        evalParams.audioUrl = audioUrl
      }

      console.log('[Evaluate] Submitting:', JSON.stringify(evalParams).substring(0, 500))

      // evaluate网络失败自动重试（最多3次）
      // 避免网络中断导致跳过评分，造成前后端题目状态不同步
      const MAX_EVALUATE_RETRIES = 3
      let evalRes = null
      let lastError = null
      for (let attempt = 1; attempt <= MAX_EVALUATE_RETRIES; attempt++) {
        try {
          console.log(`[Evaluate] Attempt ${attempt}/${MAX_EVALUATE_RETRIES}`)
          evalRes = await evaluateAnswer(evalParams)
          console.log('[Evaluate] Response:', JSON.stringify(evalRes).substring(0, 500))
          break // 成功则跳出重试循环
        } catch (retryErr) {
          lastError = retryErr
          console.warn(`[Evaluate] Attempt ${attempt} failed:`, retryErr.message)
          if (attempt < MAX_EVALUATE_RETRIES) {
            // 等待1.5秒后重试
            this.setData({ aiStatusText: `网络异常，正在重试(${attempt}/${MAX_EVALUATE_RETRIES})...` })
            await delay(1500)
          }
        }
      }

      // 3次重试都失败 → 不跳下一题，提示用户重新提交
      if (!evalRes) {
        console.error('[Evaluate] All retries failed:', lastError?.message)
        // 使用弹窗互斥锁防止叠加
        if (this._showingModal) {
          this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
          return
        }
        this._showingModal = true
        wx.showModal({
          title: '网络异常',
          content: '评估请求失败，请检查网络后点击“重新提交”',
          confirmText: '重新提交',
          cancelText: '跳过此题',
          success: (res) => {
            this._showingModal = false
            if (res.confirm) {
              // 用户点“重新提交”→ 重新调用submitAnswer
              this._isSubmitting = false
              this.submitAnswer()
            } else {
              // 用户点“跳过此题”→ 回到answering状态，不跳下一题
              this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
            }
          },
          fail: () => {
            this._showingModal = false
            this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
          }
        })
        return // 不继续执行后续逻辑
      }

      // 缓存完整响应
      this._lastEvalResponse = evalRes

      // 兼容下划线命名：evaluate返回的下一题question
      if (evalRes.question) {
        const q = evalRes.question
        if (!q.audioUrl && q.audio_url) q.audioUrl = q.audio_url
        if (!q.questionText && q.question_text) q.questionText = q.question_text
        if (!q.questionId && q.question_id) q.questionId = q.question_id
        if (!q.subLevel && q.sub_level) q.subLevel = q.sub_level
        console.log('[Evaluate] Next question audioUrl:', q.audioUrl)
      }

      // 第四步：处理评估结果
      const evaluation = evalRes.evaluation || {}
      const score = evaluation.score || 0
      const passed = evaluation.passed || false
      const feedback = evaluation.feedback || ''
      const scoreColor = score >= 80 ? '#83BA12' : score >= 60 ? '#2B5BA0' : '#e74c3c'

      // 更新答题计数（前端自己维护 + 后端返回的取较大值）
      this._frontendQuestionCount += 1
      const backendTotal = evalRes.totalAnswered || evalRes.total_answered || this._frontendQuestionCount
      const newTotalAnswered = Math.max(this._frontendQuestionCount, backendTotal)

      const isFinished = evalRes.status === 'finished'
      const shouldForceContinue = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH

      if (shouldForceContinue) {
        console.log(`[Test] Backend says finished at ${newTotalAnswered} questions, but min is ${MIN_QUESTIONS_BEFORE_FINISH}. Forcing continue.`)
      }

      // 如果后端说finished但不够10题，按钮文字仍然是"下一题"
      const buttonText = (isFinished && !shouldForceContinue) ? '查看测评报告' : '下一题'

      // 缓存后端返回的升级信息（handleNext中使用）
      this._pendingLevelUp = evalRes.levelUp || false
      this._pendingLevelUpMessage = evalRes.levelUpMessage || ''
      if (this._pendingLevelUp) {
        console.log('[Evaluate] Level up detected! Message:', this._pendingLevelUpMessage)
      }

      this.setData({
        evaluationFeedback: feedback,
        evaluationScore: score,
        evaluationPassed: passed,
        scoreColor,
        totalAnswered: newTotalAnswered,
        questionCountDisplay: `第 ${newTotalAnswered} 题`,
        phase: 'feedback',
        aiStatusText: passed ? '回答正确！' : '继续加油！',
        nextButtonText: buttonText
      })

    } catch (err) {
      console.error('[Evaluate] Error:', err)
      showError(err.message || '评估失败')
      this.setData({ phase: 'answering', aiStatusText: '请重新回答' })
    } finally {
      this._isSubmitting = false
    }
  },

  // ============ 下一题 / 查看结果 ============

  async handleNext() {
    const evalRes = this._lastEvalResponse
    if (!evalRes) return

    const status = evalRes.status
    const totalAnswered = this.data.totalAnswered

    // 前端保底：后端说finished但不够10题 → 重新请求新测评继续
    const shouldForceContinue = status === 'finished' && totalAnswered < MIN_QUESTIONS_BEFORE_FINISH

    if (status === 'finished' && !shouldForceContinue) {
      // 真正结束 → 清除缓存 + 跳转结果页
      if (this._isNavigating) return
      this._isNavigating = true
      this._clearTestSession()
      this.cleanup()
      wx.redirectTo({
        url: `/pages/result/result?sessionId=${this.data.sessionId}`,
        fail: () => { this._isNavigating = false }
      })
      return
    }

    if (shouldForceContinue) {
      // 后端说finished但不够最少题数 → 强制创建new session继续
      console.log('[Test] Force continue: creating new session to reach minimum questions')
      this.setData({ phase: 'loading', aiStatusText: '继续测评中...' })

      try {
        const data = await startTest({ forceNew: true })
        const question = data.question
        // 兼容下划线命名
        if (question) {
          if (!question.audioUrl && question.audio_url) question.audioUrl = question.audio_url
          if (!question.questionText && question.question_text) question.questionText = question.question_text
          if (!question.questionId && question.question_id) question.questionId = question.question_id
          if (!question.subLevel && question.sub_level) question.subLevel = question.sub_level
        }
        const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || this.data.currentSubLevel
        const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))

        const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

        this.setData({
          sessionId: data.sessionId,
          currentQuestion: question,
          currentSubLevel: subLevel,
          currentMajorLevel: majorLevel,
          questionIndex: data.questionIndex || 1,
          subLevelDisplay: subLevel,
          majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '零级 · 预备',
          questionCountDisplay: `第 ${totalAnswered + 1} 题`,
          progressPercent: Math.min((totalAnswered / 34) * 100, 95),
          phase: 'listening',
          aiStatusText: '请听题目',
          userTranscription: '',
          evaluationFeedback: '',
          evaluationScore: 0,
          evaluationPassed: false,
          realtimeText: '',
          audioWaves,
          nextButtonText: '下一题',
          showQuestionText: false,
          questionTextDisplay: ''
        })

        this._previousSubLevel = subLevel
        this._lastEvalResponse = null
        this._recordFilePath = ''
        this._saveTestSession()

        await delay(500)
        this._playQuestionAudio()
        return
      } catch (err) {
        console.error('[Test] Force continue failed:', err)
        // 无法继续 → 只能结束
        if (this._isNavigating) return
        this._isNavigating = true
        this._clearTestSession()
        this.cleanup()
        wx.redirectTo({
          url: `/pages/result/result?sessionId=${this.data.sessionId}`,
          fail: () => { this._isNavigating = false }
        })
        return
      }
    }

    // status === 'continue' → 加载下一题
    const nextQuestion = evalRes.question
    // 兼容下划线命名
    if (nextQuestion) {
      if (!nextQuestion.audioUrl && nextQuestion.audio_url) nextQuestion.audioUrl = nextQuestion.audio_url
      if (!nextQuestion.questionText && nextQuestion.question_text) nextQuestion.questionText = nextQuestion.question_text
      if (!nextQuestion.questionId && nextQuestion.question_id) nextQuestion.questionId = nextQuestion.question_id
      if (!nextQuestion.subLevel && nextQuestion.sub_level) nextQuestion.subLevel = nextQuestion.sub_level
      console.log('[Next] Question audioUrl:', nextQuestion.audioUrl, 'questionText:', nextQuestion.questionText)
    }
    // ★ 关键修复：后端返回 status:"continue" 但 question:null
    // 这是后端的bug，但前端需要安全处理而不是崩溃
    if (!nextQuestion || !nextQuestion.questionId) {
      console.error('[Next] Backend returned continue but question is null/invalid!', 
        'status:', evalRes.status, 'question:', JSON.stringify(evalRes.question))
      // 不直接跳结果页，而是提示用户并提供选择
      if (this._showingModal) return
      this._showingModal = true
      wx.showModal({
        title: '出题异常',
        content: '服务器未返回下一题，可能是测评已完成。是否查看当前结果？',
        confirmText: '查看结果',
        cancelText: '重试',
        success: (modalRes) => {
          this._showingModal = false
          if (modalRes.confirm) {
            // 跳结果页
            if (this._isNavigating) return
            this._isNavigating = true
            this.cleanup()
            wx.redirectTo({
              url: `/pages/result/result?sessionId=${this.data.sessionId}`,
              fail: () => { this._isNavigating = false }
            })
          } else {
            // 重试：回到录音状态，保留当前题目
            this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
          }
        },
        fail: () => {
          this._showingModal = false
          // 弹窗失败时默认跳结果页
          if (this._isNavigating) return
          this._isNavigating = true
          this.cleanup()
          wx.redirectTo({
            url: `/pages/result/result?sessionId=${this.data.sessionId}`,
            fail: () => { this._isNavigating = false }
          })
        }
      })
      return
    }

    const newSubLevel = evalRes.currentSubLevel || evalRes.current_sub_level || nextQuestion.subLevel || this.data.currentSubLevel
    const newMajorLevel = evalRes.currentMajorLevel !== undefined ? evalRes.currentMajorLevel : (evalRes.current_major_level !== undefined ? evalRes.current_major_level : (SUB_LEVEL_MAJOR[newSubLevel] || 0))
    const questionIndex = evalRes.questionIndex || 1

    // 检测是否升级到新的小级
    // 优先使用后端返回的levelUp字段，其次用前端对比subLevel
    const isLevelUp = this._pendingLevelUp || (newSubLevel !== this._previousSubLevel)
    const levelUpMessage = this._pendingLevelUpMessage || ''

    // 清除缓存的升级信息
    this._pendingLevelUp = false
    this._pendingLevelUpMessage = ''

    if (isLevelUp) {
      // 升级提示文案：优先用后端返回的levelUpMessage，否则用默认格式
      const displayMessage = levelUpMessage || `升级！${this._previousSubLevel} → ${newSubLevel}`
      console.log('[LevelUp] Showing upgrade animation:', displayMessage)
      this.setData({
        showLevelUp: true,
        levelUpFrom: this._previousSubLevel,
        levelUpTo: newSubLevel,
        levelUpMessage: displayMessage,
        phase: 'levelup'
      })
      await delay(2000)  // 升级动画显示2秒（比1.5秒稍长，让用户看清楚）
      this.setData({ showLevelUp: false })
    }

    const progress = Math.min((totalAnswered / 34) * 100, 95)
    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      currentQuestion: nextQuestion,
      currentSubLevel: newSubLevel,
      currentMajorLevel: newMajorLevel,
      questionIndex: questionIndex,
      subLevelDisplay: newSubLevel,
      majorLevelDisplay: MAJOR_LEVEL_NAMES[newMajorLevel] || '零级 · 预备',
      questionCountDisplay: `第 ${totalAnswered + 1} 题`,
      progressPercent: progress,
      phase: 'listening',
      aiStatusText: '请听题目',
      userTranscription: '',
      evaluationFeedback: '',
      evaluationScore: 0,
      evaluationPassed: false,
      realtimeText: '',
      audioWaves,
      nextButtonText: '下一题',
      showQuestionText: false,
      questionTextDisplay: ''
    })

    this._previousSubLevel = newSubLevel
    this._lastEvalResponse = null
    this._recordFilePath = ''

    this._saveTestSession()

    // 自动播放下一题语音
    await delay(500)
    this._playQuestionAudio()
  },

  /** 跳过此题 */
  handleSkip() {
    // 防护：弹窗互斥锁，防止多个弹窗叠加
    if (this._showingModal) {
      console.warn('[Skip] Modal already showing, ignored')
      return
    }

    // 安全检查：currentQuestion为null时不调用evaluate
    if (!this.data.currentQuestion || !this.data.currentQuestion.questionId) {
      console.error('[Skip] currentQuestion is null or missing questionId')
      this._resetToSafeState('题目数据异常，正在尝试恢复...')
      return
    }

    this._showingModal = true
    wx.showModal({
      title: '跳过此题',
      content: '跳过将视为未通过此题，可能影响你的最终定级。确定要跳过吗？',
      success: async (res) => {
        this._showingModal = false
        if (res.confirm) {
          this.setData({
            phase: 'evaluating',
            aiStatusText: '正在处理...'
          })

          try {
            const evalRes = await evaluateAnswer({
              sessionId: this.data.sessionId,
              questionId: this.data.currentQuestion.questionId,
              recognizedText: '',
              duration: 0
            })

            this._lastEvalResponse = evalRes
            const evaluation = evalRes.evaluation || {}

            // 跳过也算答了一题
            this._frontendQuestionCount += 1
            const backendTotal = evalRes.totalAnswered || this._frontendQuestionCount
            const newTotalAnswered = Math.max(this._frontendQuestionCount, backendTotal)

            const isFinished = evalRes.status === 'finished'
            const shouldForceContinue = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH
            const buttonText = (isFinished && !shouldForceContinue) ? '查看测评报告' : '下一题'

            this.setData({
              evaluationFeedback: '已跳过此题',
              evaluationScore: evaluation.score || 0,
              evaluationPassed: false,
              scoreColor: '#8a95a5',
              totalAnswered: newTotalAnswered,
              questionCountDisplay: `第 ${newTotalAnswered} 题`,
              phase: 'feedback',
              aiStatusText: '已跳过',
              nextButtonText: buttonText
            })

          } catch (err) {
            console.error('[Skip] evaluate failed:', err)
            // 跳过失败时不是简单回到answering，而是提供恢复选项
            this._handleSkipFailure(err)
          }
        }
      },
      fail: () => {
        this._showingModal = false
      }
    })
  },

  /** 跳过失败的恢复处理 */
  _handleSkipFailure(err) {
    if (this._showingModal) return
    this._showingModal = true
    wx.showModal({
      title: '跳过失败',
      content: '网络异常，请选择操作',
      confirmText: '重试跳过',
      cancelText: '继续录音',
      success: (modalRes) => {
        this._showingModal = false
        if (modalRes.confirm) {
          // 重试跳过
          this.handleSkip()
        } else {
          // 回到录音状态
          this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
        }
      },
      fail: () => {
        this._showingModal = false
        this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
      }
    })
  },

  /**
   * 全局异常状态恢复
   * 当前端状态混乱（currentQuestion为null、phase卡死等）时，
   * 提供用户可操作的恢复选项，而不是直接崩溃
   */
  _resetToSafeState(message) {
    console.warn('[Recovery] Resetting to safe state:', message)
    
    // 释放录音资源
    this._isSubmitting = false
    this._isStartingRecord = false
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
    if (this.data.isRecording) {
      try { this._recorderManager.stop() } catch (e) {}
    }
    
    // 如果currentQuestion有效，回到answering状态
    if (this.data.currentQuestion && this.data.currentQuestion.questionId) {
      this.setData({
        phase: 'answering',
        isRecording: false,
        aiStatusText: message || '请用英语回答'
      })
      return
    }
    
    // currentQuestion无效，提供选择
    if (this._showingModal) return
    this._showingModal = true
    wx.showModal({
      title: '状态异常',
      content: '测评状态异常，是否查看当前测评结果？',
      confirmText: '查看结果',
      cancelText: '返回首页',
      success: (modalRes) => {
        this._showingModal = false
        if (modalRes.confirm && this.data.sessionId) {
          if (this._isNavigating) return
          this._isNavigating = true
          this.cleanup()
          wx.redirectTo({
            url: `/pages/result/result?sessionId=${this.data.sessionId}`,
            fail: () => { this._isNavigating = false }
          })
        } else {
          if (this._isNavigating) return
          this._isNavigating = true
          this.cleanup()
          wx.navigateBack({ fail: () => {
            wx.reLaunch({ url: '/pages/home/home' })
          }})
        }
      },
      fail: () => {
        this._showingModal = false
        if (this._isNavigating) return
        this._isNavigating = true
        this.cleanup()
        wx.navigateBack({ fail: () => {
          wx.reLaunch({ url: '/pages/home/home' })
        }})
      }
    })
  },

  /** 退出测评 */
  handleQuit() {
    if (this._showingModal) return
    this._showingModal = true
    wx.showModal({
      title: '退出测评',
      content: '退出后可以在首页继续未完成的测评，确定要退出吗？',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: async (res) => {
        this._showingModal = false
        if (res.confirm) {
          if (this._isNavigating) return
          this._isNavigating = true
          this.cleanup()
          wx.navigateBack({ fail: () => {
            wx.reLaunch({ url: '/pages/home/home' })
          }})
        }
      },
      fail: () => {
        this._showingModal = false
      }
    })
  },

  // ============ AI外教引导气泡 ============

  handleGuideNext() {
    const step = this.data.guideStep
    if (step === 1) {
      this.setData({ guideStep: 2, aiStatusText: '测评流程说明' })
    } else if (step === 2) {
      this.setData({ guideStep: 3, aiStatusText: '准备好了吗？' })
    }
  },

  handleGuideStart() {
    this.setData({
      showGuide: false,
      guideStep: 0,
      phase: 'listening',
      aiStatusText: '请听题目'
    })

    this.startTimer()

    // 自动播放外教语音
    setTimeout(() => {
      this._playQuestionAudio()
    }, 500)
  },

  handleGuideSkip() {
    this.handleGuideStart()
  }
})
