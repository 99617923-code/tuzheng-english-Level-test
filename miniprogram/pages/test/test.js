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
const { startTest, evaluateAnswer, uploadAudio, terminateTest, transcribeAudio, textToSpeech, getTeacherConfig } = require('../../utils/api')
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

// 大级名称（兼容后端定义，后端补充majorLevelName字段后可优先使用后端数据）
const MAJOR_LEVEL_NAMES = {
  0: '途正口语0级',
  1: '途正口语1级',
  2: '途正口语2级',
  3: '途正口语3级'
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
    teacherName: '',
    teacherTitle: '',
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
    majorLevelDisplay: '途正口语0级',
    questionCountDisplay: '第 1 题',

    // 计时（每道题3分钟倒计时）
    timerDisplay: '03:00',
    questionSecondsLeft: 180,  // 每题180秒倒计时

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
    recordCountdown: 0,       // 最后10秒倒计时
    recordWaveBars: [],       // 录音遮罩波形条
    realtimeText: '',
    userTranscription: '',

    // 评价反馈
    evaluationFeedback: '',
    evaluationScore: 0,
    evaluationPassed: false,
    scoreColor: '#3B82F6',

    // 升级提示
    levelUpFrom: '',
    levelUpTo: '',
    levelUpMessage: '',
    showLevelUp: false,

    // 下一步按钮文字
    nextButtonText: '下一题',

    // 音频失败时显示题目文字（兆底）
    showQuestionText: false,
    questionTextDisplay: '',

    // 音量提醒
    showVolumeReminder: false,

    // AI智能跳级模式（v1.3.0）
    evaluateMode: 'standard',    // standard | ai_smart
    modeLabel: '',               // 模式标签显示文字
    showJumpAnimation: false,    // 是否显示跳级动画
    jumpFrom: '',                // 跳级前级别
    jumpTo: '',                  // 跳级后级别
    jumpReasoning: '',           // AI分析理由
    jumpSkippedLevels: 0,        // 跳过的级别数
    hasJumped: false,             // 本次测评是否已经跳过级

    // 简短回答提示（前5题）
    showBriefHint: false
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
  _recordSafetyTimer: null,  // 录音安全定时器（touchend丢失兑底保护）
  _initRetryCount: 0,
  _audioPlayTimeout: null,   // 音频播放超时定时器
  _frontendQuestionCount: 0, // 前端自己维护的答题计数（不依赖后端）
  _pendingLevelUp: false,    // 后端返回的升级标志（缓存到handleNext使用）
  _pendingLevelUpMessage: '', // 后端返回的升级提示文案

  onLoad(options) {
    const navLayout = app.getNavLayout()
    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    // 接收模式参数（从首页模式选择弹窗传入）
    const evaluateMode = (options && options.evaluateMode) || 'standard'
    const modeLabel = evaluateMode === 'ai_smart' ? 'AI分析中...' : ''

    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      teacherName: app.globalData.teacherName || '外教',
      teacherTitle: app.globalData.teacherTitle || '外教老师',
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      audioWaves,
      evaluateMode,
      modeLabel
    })

    this._recorderManager = wx.getRecorderManager()
    this._isNavigating = false
    this._isSubmitting = false
    this._isStartingRecord = false
    this._showingModal = false
    this._isPageUnloaded = false  // 页面卸载标志，防止离开后录音回调仍弹窗
    this._initRetryCount = 0
    this._frontendQuestionCount = 0
    this._touchStartTime = 0        // 按住开始时间戳
    this._touchActive = false       // 手指是否正在按住
    this._pendingStop = false       // 录音启动前手指已松开标志
    this._requestGeneration = 0     // 请求代数，用于忽略旧请求的回调
    this._setupRecorderEvents()

    // 方案一：强制忽略iOS静音开关，确保外教语音正常播放
    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      mixWithOther: false,
      success: () => {
        console.log('[Audio] setInnerAudioOption success: obeyMuteSwitch=false')
      },
      fail: (err) => {
        console.warn('[Audio] setInnerAudioOption failed:', err)
      }
    })

    // 方案二：进入测评页时显示音量提醒
    this._showVolumeReminder()

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
    if (this._volumeReminderTimer) {
      clearTimeout(this._volumeReminderTimer)
      this._volumeReminderTimer = null
    }
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
    this._clearAudioTimeout()
    this._destroyAudioContext()
    // 清除录音安全定时器
    if (this._recordSafetyTimer) {
      clearTimeout(this._recordSafetyTimer)
      this._recordSafetyTimer = null
    }
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

  /** 启动每道题3分钟倒计时 */
  startTimer() {
    this.stopTimer()
    this.setData({
      questionSecondsLeft: 180,
      timerDisplay: '03:00'
    })
    this._timer = setInterval(() => {
      const left = this.data.questionSecondsLeft - 1
      if (left <= 0) {
        // 时间到，自动跳题
        this.stopTimer()
        this.setData({ questionSecondsLeft: 0, timerDisplay: '00:00' })
        this._handleTimeUp()
        return
      }
      const mins = Math.floor(left / 60)
      const secs = left % 60
      this.setData({
        questionSecondsLeft: left,
        timerDisplay: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      })
    }, 1000)
  },

  /** 停止计时器 */
  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  /** 时间到自动跳题 */
  _handleTimeUp() {
    // 如果正在录音，先停止录音并提交
    if (this.data.isRecording) {
      try { this._recorderManager.stop() } catch (e) {}
      return  // 录音停止后会自动触发onStop回调提交
    }
    // 如果在听题或答题状态，直接跳过
    if (this.data.phase === 'listening' || this.data.phase === 'answering') {
      wx.showToast({ title: '本题答题时间到', icon: 'none', duration: 2000 })
      this.handleSkip()
    }
  },

  // ============ 测评中断恢复 ============

  _saveTestSession() {
    try {
      const { sessionId, currentSubLevel, currentMajorLevel, questionIndex,
              totalAnswered, currentQuestion } = this.data
      if (!sessionId) return

      const sessionData = {
        sessionId, currentSubLevel, currentMajorLevel, questionIndex,
        totalAnswered, currentQuestion,
        frontendQuestionCount: this._frontendQuestionCount,
        savedAt: Date.now()
      }
      wx.setStorageSync('tz_test_session', sessionData)
    } catch (e) {
      console.warn('[Test] Save session failed:', e)
    }
  },

  _clearTestSession() {
    try {
      wx.removeStorageSync('tz_test_session')
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
    // 彻底清理旧音频，防止重叠播放
    this._destroyAudioContext()
    this._clearAudioTimeout()
    this._requestGeneration = (this._requestGeneration || 0) + 1

    this.setData({
      phase: 'loading',
      aiStatusText: '正在恢复测评...',
      audioPlaying: false,
      aiSpeaking: false
    })

    const saved = this._getSavedSession()
    if (!saved) {
      this.initTest()
      return
    }

    try {
      // v1.3.0: 恢复时也传递evaluateMode
      const resumeParams = {}
      if (this.data.evaluateMode) resumeParams.evaluateMode = this.data.evaluateMode
      const data = await startTest(resumeParams)
      const question = data.question
      // 兼容下划线命名
      if (question) {
        if (!question.audioUrl && question.audio_url) question.audioUrl = question.audio_url
        if (!question.questionText && question.question_text) question.questionText = question.question_text
        if (!question.questionId && question.question_id) question.questionId = question.question_id
        if (!question.subLevel && question.sub_level) question.subLevel = question.sub_level
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
        questionSecondsLeft: 180,
        timerDisplay: '03:00',
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
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
      this._destroyAudioContext()  // 播放前先销毁旧音频
      this._playQuestionAudio()

    } catch (err) {
      console.error('[Test] Resume failed:', err)
      if (this._showingModal) return
      this._showingModal = true
      wx.showModal({
        title: '恢复失败',
        content: '无法恢复上次的测评，是否开始新测评？',
        confirmText: '重新开始',
        confirmColor: '#22c55e',
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
    // 彻底清理旧音频和旧请求，防止重叠播放
    this._destroyAudioContext()
    this._clearAudioTimeout()
    this.stopTimer()
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
    // 标记旧请求应被忽略
    this._requestGeneration = (this._requestGeneration || 0) + 1

    this.setData({
      phase: 'loading',
      aiStatusText: '正在准备测评...',
      isRecording: false,
      recordCountdown: 0,
      recordWaveBars: [],
      audioPlaying: false,
      aiSpeaking: false
    })

    // 新测评：前端计数强制归零
    this._frontendQuestionCount = 0

    try {
      // forceNew=true 时强制创建新会话（后端会终止旧会话）
      // v1.3.0: 传递evaluateMode参数（standard/ai_smart）
      const startParams = {}
      if (forceNew) startParams.forceNew = true
      if (this.data.evaluateMode) startParams.evaluateMode = this.data.evaluateMode
      const data = await startTest(startParams)

      // 打印后端返回的完整数据，方便调试

      const question = data.question
      if (question) {
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
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
        questionCountDisplay: '第 1 题',  // 强制显示第1题
        progressPercent: 0,
        phase: 'guide',
        showGuide: true,
        guideStep: 1,
        aiStatusText: `你好！我是${app.globalData.teacherTitle || '外教老师'}`,
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

      // 处理403：已确认分级，不允许再测评
      if (err.message && (err.message.includes('403') || err.message.includes('已确认') || err.message.includes('禁止') || err.message.includes('forbidden'))) {
        if (this._showingModal) return
        this._showingModal = true
        wx.showModal({
          title: '无法开始测评',
          content: '你已确认分级，无法再次测评。如有疑问请联系老师。',
          showCancel: false,
          confirmText: '返回首页',
          confirmColor: '#3B82F6',
          success: () => {
            this._showingModal = false
            wx.reLaunch({ url: '/pages/home/home' })
          },
          fail: () => {
            this._showingModal = false
          }
        })
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
        confirmColor: '#22c55e',
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
      this._clearAudioTimeout()
      this.setData({ audioPlaying: true, aiSpeaking: true, aiStatusText: `${this.data.teacherName || '外教'}正在提问...` })
      // 开始播放后设置超时保护
      this._setAudioTimeout()
    })

    ctx.onEnded(() => {
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
      this.setData({ phase: 'listening', aiStatusText: `${this.data.teacherName || '外教'}正在提问...` })

      const ctx = this._createAudioContext()
      ctx.src = audioUrl
      ctx.play()

      // 设置初始超时（等待onPlay触发后会重新设置）
      this._setAudioTimeout()
    } else {
      // 没有audioUrl → 尝试TTS降级
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

    this.setData({ phase: 'listening', aiStatusText: '正在生成语音...' })

    // 第一级：用微信同声传译插件的TTS（前端直接合成）
    if (plugin && plugin.textToSpeech) {
      const self = this
      plugin.textToSpeech({
        lang: 'en_US',
        tts: true,
        content: currentQuestion.questionText.substring(0, 50), // 插件限制50字符
        success: function(res) {
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

  // ============ 录音（微信风格纯长按模式） ============

  _setupRecorderEvents() {
    this._recorderManager.onStart(() => {
      this._isStartingRecord = false  // 录音已成功启动，解除防抖锁
      if (this._isPageUnloaded) {
        this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
        try { this._recorderManager.stop() } catch (e) {}
        return
      }

      // 检查是否手指已松开（pendingStop）
      if (this._pendingStop || !this._touchActive) {
        this._pendingStop = false
        // 手指已经松开，直接停止录音
        this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
        try { this._recorderManager.stop() } catch (e) {}
        showToast('说话时间太短，请按住说话')
        return
      }

      // isRecording已在touchstart时立即设置，这里只启动计时器

      // 录音计时器：每秒更新，最后10秒倒计时，60秒自动提交
      this._recordTimer = setInterval(() => {
        const secs = this.data.recordSeconds + 1
        const countdown = secs >= 50 ? (60 - secs) : 0
        // 随机更新波形条高度（模拟录音动画）
        const waveBars = Array.from({ length: 24 }, () => Math.floor(Math.random() * 80) + 20)
        this.setData({
          recordSeconds: secs,
          recordTimeDisplay: `${secs}"`,
          recordCountdown: countdown,
          recordWaveBars: waveBars
        })
        if (secs >= 60) {
          // 1分钟到，自动提交
          this.stopRecording()
        }
      }, 1000)

      this._startVoiceRecognition()
    })

    this._recorderManager.onStop((res) => {
      this._isStartingRecord = false  // 确保录音停止后解除防抖锁
      // 清除安全定时器
      if (this._recordSafetyTimer) {
        clearTimeout(this._recordSafetyTimer)
        this._recordSafetyTimer = null
      }
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
      // 页面已卸载时不再操作UI
      if (this._isPageUnloaded) {
        return
      }
      this._recordFilePath = res.tempFilePath
      this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })

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
        return
      }
      this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
      showError('录音失败，请重试')
    })
  },

  /** 阻止录音遮罩层的滚动穿透 */
  preventTouchMove() {},

  /** 按住开始录音（微信风格：纯长按模式） */
  onRecordTouchStart(e) {
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
    // 已在录音中，不重复启动
    if (this.data.isRecording) return

    // 记录按下时间戳，用于松开时判断是否太短
    this._touchStartTime = Date.now()
    this._touchActive = true  // 标记手指正在按住
    this._pendingStop = false // 重置延迟停止标志

    // 立即显示录音遮罩（不等onStart回调，消除视觉延迟）
    const waveBars = Array.from({ length: 24 }, () => Math.floor(Math.random() * 80) + 20)
    this.setData({
      isRecording: true,
      recordSeconds: 0,
      recordTimeDisplay: '0"',
      recordCountdown: 0,
      recordWaveBars: waveBars
    })

    // 安全定时器：如果65秒后touchend仍未触发，强制停止录音（兑底保护）
    if (this._recordSafetyTimer) clearTimeout(this._recordSafetyTimer)
    this._recordSafetyTimer = setTimeout(() => {
      console.warn('[Recording] Safety timer fired! Force stopping recording after 65s')
      if (this.data.isRecording) {
        this._touchActive = false
        this.stopRecording()
      }
    }, 65000)

    this.startRecording()
  },

  /** 松开结束录音（微信风格：纯长按模式） */
  onRecordTouchEnd(e) {
    console.log('[Recording] touchend/touchcancel triggered, isRecording:', this.data.isRecording, '_touchActive:', this._touchActive)
    this._touchActive = false  // 手指已松开

    // 清除安全定时器（已正常触发touchend）
    if (this._recordSafetyTimer) {
      clearTimeout(this._recordSafetyTimer)
      this._recordSafetyTimer = null
    }

    // 如果录音还没启动成功（onStart还没触发），延迟停止
    if (this._isStartingRecord) {
      // 录音正在启动中，等待onStart后再停止
      this._pendingStop = true
      console.log('[Recording] Set pendingStop=true (recorder still starting)')
      return
    }

    if (!this.data.isRecording) {
      console.log('[Recording] touchend but not recording, ignore')
      return
    }

    // 检查按住时长，太短则取消
    const holdDuration = Date.now() - (this._touchStartTime || 0)
    if (holdDuration < 500) {
      // 按住不到500ms，视为误触，取消录音
      console.log('[Recording] Hold too short:', holdDuration, 'ms, cancelling')
      this._recorderManager.stop()
      // 不提交，只提示
      this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
      showToast('说话时间太短，请按住说话')
      this._recordFilePath = ''
      return
    }

    console.log('[Recording] Stopping recording after', holdDuration, 'ms hold')
    this.stopRecording()
  },

  /** 录音遮罩层点击事件（兑底保护：点击遮罩层任何位置也停止录音） */
  onOverlayTap(e) {
    console.log('[Recording] Overlay tapped, forcing stop recording')
    if (this.data.isRecording) {
      this._touchActive = false
      this.stopRecording()
    }
  },

  /** 开始录音 */
  startRecording() {
    if (this._isStartingRecord) return  // 防抖锁

    this._isStartingRecord = true  // 加锁

    // 先检查录音权限
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          this._isStartingRecord = false  // 解锁
          this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
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
      this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })
      showError('录音启动失败，请重试')
    }
  },

  /** 停止录音 */
  stopRecording() {
    if (!this.data.isRecording) return
    // 清除安全定时器
    if (this._recordSafetyTimer) {
      clearTimeout(this._recordSafetyTimer)
      this._recordSafetyTimer = null
    }
    this._recorderManager.stop()
    // 清除录音遮罩状态
    this.setData({ recordCountdown: 0, recordWaveBars: [] })
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
      this._resetToSafeState('题目数据异常，请点击"跳过此题"或等待下一题')
      return
    }

    // === 前5题简短回答提示（录音<5秒时提示用户丰富回答） ===
    if (!this._briefAnswerHintCount) this._briefAnswerHintCount = 0
    if (!this._skipBriefHint) {
      const questionNum = this.data.totalAnswered + 1
      if (questionNum <= 5 && recordSeconds < 5 && this._briefAnswerHintCount < 2) {
        // 显示提示弹窗，让用户选择重新回答或继续提交
        this.setData({ showBriefHint: true })
        this._briefAnswerHintCount++
        return  // 等待用户选择
      }
    }
    this._skipBriefHint = false  // 重置跳过标志

    if (this._isSubmitting) {
      console.warn('[Submit] Already submitting, skip')
      return
    }
    this._isSubmitting = true
    // 记录当前请求代数，用于忽略旧请求的回调
    const myGeneration = this._requestGeneration || 0

    // 提交时停止倒计时
    this.stopTimer()

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
      } catch (e) {
        console.warn('[Upload] Failed:', e.message)
        // 上传失败不阻断流程，继续提交evaluate
      }

      // 第二步：跳过单独的Whisper转写调用，直接把audioUrl传给evaluate
      // 速度优化：让后端在evaluate内部并行处理转写+评分，节省3-5秒
      let finalTranscription = userTranscription || ''
      if (!finalTranscription && audioUrl) {
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


      // evaluate网络失败自动重试（最多3次）
      // 避免网络中断导致跳过评分，造成前后端题目状态不同步
      const MAX_EVALUATE_RETRIES = 3
      let evalRes = null
      let lastError = null
      for (let attempt = 1; attempt <= MAX_EVALUATE_RETRIES; attempt++) {
        try {
          evalRes = await evaluateAnswer(evalParams)
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
      }

      // 第四步：处理评估结果（v0.1.7精简版：去掉逐题反馈，答完直接下一题）

      // 检查请求代数：如果用户已退出重进，旧请求的回调应被忽略
      if (myGeneration !== (this._requestGeneration || 0)) {
        console.warn('[Submit] Request generation mismatch, ignoring stale response')
        return
      }

      // 更新答题计数（前端自己维护 + 后端返回的取较大值）
      this._frontendQuestionCount += 1
      const backendTotal = evalRes.totalAnswered || evalRes.total_answered || this._frontendQuestionCount
      const newTotalAnswered = Math.max(this._frontendQuestionCount, backendTotal)

      const isFinished = evalRes.status === 'finished'
      const shouldForceContinue = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH

      // 缓存后端返回的升级信息（handleNext中使用）
      this._pendingLevelUp = evalRes.levelUp || false
      this._pendingLevelUpMessage = evalRes.levelUpMessage || ''

      // 更新计数显示
      this.setData({
        totalAnswered: newTotalAnswered,
        questionCountDisplay: `第 ${newTotalAnswered} 题`
      })

      // v1.3.0: 检查AI智能跳级
      const aiJump = evalRes.aiSmartJump || evalRes.ai_smart_jump
      if (aiJump && aiJump.jumped) {
        const estimation = aiJump.estimation || {}
        const jumpTarget = aiJump.jumpTarget || aiJump.jump_target || ''
        console.log('[AI跳级] 触发跳级！从', this.data.currentSubLevel, '→', jumpTarget)
        
        // 显示跳级动画
        this.setData({
          showJumpAnimation: true,
          jumpFrom: this.data.currentSubLevel,
          jumpTo: jumpTarget,
          jumpReasoning: estimation.reasoning || 'AI检测到你的水平较高，已智能跳级',
          jumpSkippedLevels: estimation.skippedLevels || estimation.skipped_levels || 0,
          hasJumped: true,
          modeLabel: `AI智能跳级 → ${jumpTarget}`,
          phase: 'jumping'  // 新增跳级动画阶段
        })

        // 跳级动画显示4秒后自动继续
        this._lastEvalResponse = evalRes
        await delay(4000)
        this.setData({ showJumpAnimation: false })

        if (isFinished && !shouldForceContinue) {
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
        this._autoNextQuestion(evalRes, newTotalAnswered, shouldForceContinue)
        return
      }

      // 非AI跳级模式下，更新模式标签
      if (this.data.evaluateMode === 'ai_smart' && !this.data.hasJumped) {
        // 探测阶段：前几题AI还在分析
        this.setData({ modeLabel: 'AI分析中...' })
      } else if (this.data.evaluateMode === 'ai_smart' && this.data.hasJumped) {
        // 跳级后：精准定级阶段
        this.setData({ modeLabel: '精准定级中' })
      }

      // 精简版：不再显示逐题反馈，直接进入下一题或结果页
      this._lastEvalResponse = evalRes

      if (isFinished && !shouldForceContinue) {
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

      // 继续下一题（包括强制继续的情况）
      this._autoNextQuestion(evalRes, newTotalAnswered, shouldForceContinue)

    } catch (err) {
      console.error('[Evaluate] Error:', err)
      showError(err.message || '评估失败')
      this.setData({ phase: 'answering', aiStatusText: '请重新回答' })
    } finally {
      this._isSubmitting = false
    }
  },

  // ============ 下一题 / 查看结果 ============

  /**
   * handleNext - 精简版兼容保留
   * 在精简版中，答完后不再进入feedback阶段，而是直接由_autoNextQuestion处理。
   * 此方法保留作为备用入口（如wxml中仍有引用）。
   */
  async handleNext() {
    const evalRes = this._lastEvalResponse
    if (!evalRes) return

    const totalAnswered = this.data.totalAnswered
    const isFinished = evalRes.status === 'finished'
    const shouldForceContinue = isFinished && totalAnswered < MIN_QUESTIONS_BEFORE_FINISH

    if (isFinished && !shouldForceContinue) {
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

    // 委托给_autoNextQuestion处理
    await this._autoNextQuestion(evalRes, totalAnswered, shouldForceContinue)
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
          // 跳过时停止倒计时
          this.stopTimer()
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

            // 跳过也算答了一题
            this._frontendQuestionCount += 1
            const backendTotal = evalRes.totalAnswered || this._frontendQuestionCount
            const newTotalAnswered = Math.max(this._frontendQuestionCount, backendTotal)

            const isFinished = evalRes.status === 'finished'
            const shouldForceContinue = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH

            // 更新计数
            this.setData({
              totalAnswered: newTotalAnswered,
              questionCountDisplay: `第 ${newTotalAnswered} 题`
            })

            // 精简版：跳过后也直接进入下一题或结果页
            if (isFinished && !shouldForceContinue) {
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

            // 继续下一题
            this._autoNextQuestion(evalRes, newTotalAnswered, shouldForceContinue)

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
   * 精简版：答完后自动进入下一题（不再显示反馈）
   * 抽取公共逻辑，供submitAnswer和handleSkip复用
   */
  async _autoNextQuestion(evalRes, totalAnswered, shouldForceContinue) {
    if (shouldForceContinue) {
      // 后端说finished但不够最少题数 → 强制创建new session继续
      this.setData({ phase: 'loading', aiStatusText: '继续测评中...' })

      try {
        // v1.3.0: 强制继续时也传递evaluateMode
        const forceParams = { forceNew: true }
        if (this.data.evaluateMode) forceParams.evaluateMode = this.data.evaluateMode
        const data = await startTest(forceParams)
        const question = data.question
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
          majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
          questionCountDisplay: `第 ${totalAnswered + 1} 题`,
          progressPercent: Math.min((totalAnswered / 34) * 100, 95),
          phase: 'listening',
          aiStatusText: '请听题目',
          userTranscription: '',
          realtimeText: '',
          audioWaves,
          showQuestionText: false,
          questionTextDisplay: ''
        })

        this._previousSubLevel = subLevel
        this._lastEvalResponse = null
        this._recordFilePath = ''
        this._saveTestSession()

        this.startTimer()
        await delay(500)
        this._destroyAudioContext()  // 播放新题前先销毁旧音频
        this._playQuestionAudio()
        return
      } catch (err) {
        console.error('[Test] Force continue failed:', err)
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
    if (nextQuestion) {
      if (!nextQuestion.audioUrl && nextQuestion.audio_url) nextQuestion.audioUrl = nextQuestion.audio_url
      if (!nextQuestion.questionText && nextQuestion.question_text) nextQuestion.questionText = nextQuestion.question_text
      if (!nextQuestion.questionId && nextQuestion.question_id) nextQuestion.questionId = nextQuestion.question_id
      if (!nextQuestion.subLevel && nextQuestion.sub_level) nextQuestion.subLevel = nextQuestion.sub_level
    }

    // 安全处理：question为null
    if (!nextQuestion || !nextQuestion.questionId) {
      console.error('[AutoNext] Backend returned continue but question is null/invalid!')
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
            if (this._isNavigating) return
            this._isNavigating = true
            this.cleanup()
            wx.redirectTo({
              url: `/pages/result/result?sessionId=${this.data.sessionId}`,
              fail: () => { this._isNavigating = false }
            })
          } else {
            this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
          }
        },
        fail: () => {
          this._showingModal = false
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

    // 缓存的升级信息清除
    this._pendingLevelUp = false
    this._pendingLevelUpMessage = ''

    const progress = Math.min((totalAnswered / 34) * 100, 95)
    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      currentQuestion: nextQuestion,
      currentSubLevel: newSubLevel,
      currentMajorLevel: newMajorLevel,
      subLevelDisplay: newSubLevel,
      majorLevelDisplay: MAJOR_LEVEL_NAMES[newMajorLevel] || '途正口语0级',
      questionCountDisplay: `第 ${totalAnswered + 1} 题`,
      progressPercent: progress,
      phase: 'listening',
      aiStatusText: '请听题目',
      userTranscription: '',
      realtimeText: '',
      audioWaves,
      showQuestionText: false,
      questionTextDisplay: ''
    })

    this._previousSubLevel = newSubLevel
    this._lastEvalResponse = null
    this._recordFilePath = ''

    this._saveTestSession()

    // 重启每题倒计时
    this.startTimer()

    // 自动播放下一题语音
    await delay(500)
    this._destroyAudioContext()  // 播放新题前先销毁旧音频
    this._playQuestionAudio()
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

  // ============ 外教引导气泡 ============

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
  },

  /**
   * 音量提醒：进入测评页时显示提醒框，引导用户关闭静音并调高音量
   * 显示3秒后自动消失，不影响测评流程
   */
  _showVolumeReminder() {
    this.setData({ showVolumeReminder: true })
    // 3秒后自动隐藏
    this._volumeReminderTimer = setTimeout(() => {
      this.setData({ showVolumeReminder: false })
    }, 4000)
  },

  /** 用户手动关闭音量提醒 */
  dismissVolumeReminder() {
    if (this._volumeReminderTimer) {
      clearTimeout(this._volumeReminderTimer)
      this._volumeReminderTimer = null
    }
    this.setData({ showVolumeReminder: false })
  },

  /** 简短回答提示：用户选择“重新回答” */
  handleBriefHintRetry() {
    this.setData({ showBriefHint: false, phase: 'answering' })
    // 重置录音状态，让用户重新录音
    this._recordFilePath = ''
    this.setData({ recordSeconds: 0, recordTimeDisplay: '0"', userTranscription: '' })
  },

  /** 简短回答提示：用户选择“继续提交” */
  handleBriefHintSubmit() {
    this.setData({ showBriefHint: false })
    this._skipBriefHint = true
    this.submitAnswer()
  }
})
