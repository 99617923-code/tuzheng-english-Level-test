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
 * - 跳过失败恢复（_handleSkipFailure）：跳过题目(skip-question)失败时提供重试/继续录音选项
 * - 后端question:null安全处理：status:continue但question为null时不崩溃，提示用户选择
 */
const app = getApp()
const { startTest, evaluateAnswer, uploadAudio, terminateTest, transcribeAudio, textToSpeech, getTeacherConfig, selfIntroEstimate, skipIntro, skipQuestion } = require('../../utils/api')
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
  'PRE1': 0, 'PRE2': 0, 'PRE': 0,
  'G1': 0, 'G2': 0, 'G3': 0, 'G4': 0,
  'G5': 1, 'G6': 1, 'G7': 1, 'G8': 1, 'G9': 1,
  'G10': 2, 'G11': 2, 'G12': 2,
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
    phase: 'loading', // guide | loading | listening | answering | confirm | evaluating | feedback | levelup

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

    // AI智能定级模式（v4.0）
    evaluateMode: 'ai_smart',    // v4.0: 默认AI智能定级模式
    modeLabel: '',               // 模式标签显示文字

    // v4.0 自我介绍阶段
    selfIntroGuide: null,        // 自我介绍引导配置（从evaluate-modes获取）
    selfIntroRecording: false,   // 是否正在录制自我介绍
    selfIntroRecordSeconds: 0,   // 自我介绍录音时长（秒）
    selfIntroRecordTimeDisplay: '0"',
    selfIntroCountdown: 120,     // 2分钟倒计时
    selfIntroUploading: false,   // 是否正在上传自我介绍
    estimatedLevel: null,        // AI预估水平结果
    showEstimateResult: false,   // 是否显示预估结果
    estimateResultText: '',      // 预估结果文案
    estimateLevelRange: '',      // 预估级别范围（如 G10-G12）
    estimateLevelDesc: '',       // 预估级别描述
    estimateDimensions: [],      // 多维度能力分析数据
    estimateOverallComment: '',  // 综合能力总评
    estimateGuidanceText: '',    // 引导说明文案

    // 自我介绍分析维度进度
    introAnalysisDims: [],       // 五维度分析进度数据
    introAnalysisOverallPct: 0,  // 总体进度百分比
    introAnalysisStatus: '',     // 当前分析状态文案
    introAnalysisComplete: false, // 分析完成勾选动画状态

    // v4.0 分析进度条
    analysisSteps: [],           // 分析步骤数组
    showAnalysisProgress: false, // 是否显示分析进度
    analysisCurrentStep: -1,     // 当前进行到的步骤索引

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
  _selfIntroRecordFilePath: '', // 自我介绍录音文件路径
  _selfIntroRecordTimer: null,  // 自我介绍录音计时器
  _selfIntroProcessing: false,  // 自我介绍录音正在处理中（上传+预估），防重入
  _analysisProgressTimer: null, // 分析进度动画定时器
  _lastAnalysisSteps: null,     // 上次evaluate返回的实际耗时（用于校准）
  _startQuestion: null,         // start返回的兆底question（自我介绍跳过时用）

  onLoad(options) {
    const navLayout = app.getNavLayout()
    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    // 接收模式参数（从首页模式选择弹窗传入）
    const evaluateMode = (options && options.evaluateMode) || 'ai_smart'  // v4.0: 默认AI智能定级
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
    this._selfIntroRecordFilePath = ''
    this._selfIntroRecordTimer = null
    this._selfIntroProcessing = false
    this._selfIntroTouchStartTime = 0
    this._selfIntroTouchActive = false
    this._selfIntroPendingStop = false
    this._selfIntroSafetyTimer = null
    this._selfIntroStopFallbackTimer = null
    this._waitingForSelfIntroOnStop = false
    this._selfIntroGeneration = 0  // 自我介绍录音代数计数器，用于防止旧onStop回调干扰新录音
    this._analysisProgressTimer = null
    this._lastAnalysisSteps = null
    this._startQuestion = null
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
    // 清除自我介绍录音计时器
    if (this._selfIntroRecordTimer) {
      clearInterval(this._selfIntroRecordTimer)
      this._selfIntroRecordTimer = null
    }
    // 清除自我介绍录音安全定时器
    if (this._selfIntroSafetyTimer) {
      clearTimeout(this._selfIntroSafetyTimer)
      this._selfIntroSafetyTimer = null
    }
    // 清除onStop超时保护定时器
    if (this._selfIntroStopFallbackTimer) {
      clearTimeout(this._selfIntroStopFallbackTimer)
      this._selfIntroStopFallbackTimer = null
    }
    this._waitingForSelfIntroOnStop = false
    // 清除分析进度动画定时器
    if (this._analysisProgressTimer) {
      clearInterval(this._analysisProgressTimer)
      this._analysisProgressTimer = null
    }
    // 清除分析进度超时保护定时器
    if (this._analysisProgressTimeout) {
      clearTimeout(this._analysisProgressTimeout)
      this._analysisProgressTimeout = null
    }
    // 清除自我介绍五维度分析进度定时器
    if (this._introAnalysisTimer) {
      clearInterval(this._introAnalysisTimer)
      this._introAnalysisTimer = null
    }
    // 清除CSS transition方案的setTimeout队列
    if (this._introAnalysisTimeouts) {
      this._introAnalysisTimeouts.forEach(t => clearTimeout(t))
      this._introAnalysisTimeouts = []
    }
    // 标记页面已卸载，防止全局录音回调继续弹窗
    this._isPageUnloaded = true
    // 重置所有锁状态
    this._isSubmitting = false
    this._isStartingRecord = false
    this._showingModal = false
    this._selfIntroProcessing = false
    this._selfIntroMode = false
    this._selfIntroGeneration = 0
    this._confirmReplayMode = false
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
      const aiSmartPhase = data.aiSmartPhase || data.ai_smart_phase || ''

      // v4.0: AI智能模式断点续测时，如果还在intro阶段，进入自我介绍页面
      if (this.data.evaluateMode === 'ai_smart' && (aiSmartPhase === 'intro' || !question)) {
        this._startQuestion = question
        this._startSubLevel = subLevel
        this._startMajorLevel = majorLevel

        const selfIntroGuide = app.globalData.selfIntroGuide || {
          title: '请用英语做一段自我介绍',
          description: '请用英语介绍你的名字、从哪里来、学业情况、职业情况、学英语的动力来源和目标。',
          duration: '30秒~2分钟',
          tips: ['尽量用完整的句子表达', '不需要追求完美，自然表达即可', '内容越丰富，AI判断越准确']
        }

        this.setData({
          sessionId: data.sessionId,
          currentQuestion: question || null,
          currentSubLevel: subLevel,
          currentMajorLevel: majorLevel,
          questionIndex: data.questionIndex || 1,
          totalAnswered: 0,
          subLevelDisplay: subLevel,
          majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
          questionCountDisplay: '第 1 题',
          progressPercent: 0,
          phase: 'selfIntro',
          selfIntroGuide: selfIntroGuide,
          selfIntroRecording: false,
          selfIntroRecordSeconds: 0,
          selfIntroRecordTimeDisplay: '0"',
          selfIntroCountdown: 120,
          selfIntroUploading: false,
          estimatedLevel: null,
          showEstimateResult: false,
          estimateResultText: '',
          modeLabel: 'AI智能定级',
          aiStatusText: '请录制英文自我介绍',
          showQuestionText: false,
          questionTextDisplay: ''
        })

        this._previousSubLevel = subLevel
        this._saveTestSession()
        wx.showToast({ title: '已恢复测评，请录制自我介绍', icon: 'none', duration: 2000 })
        return
      }

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
      console.log('[Test] startTest params:', JSON.stringify(startParams), 'data.evaluateMode:', this.data.evaluateMode)
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
        // v4.0: AI智能模式下start返回question:null是正常的
        if (this.data.evaluateMode !== 'ai_smart') {
          console.error('[Test] No question in response!')
        } else {
          console.log('[Test] AI smart mode: question is null (expected), will get question after self-intro')
        }
      }

      const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))
      const aiSmartPhase = data.aiSmartPhase || data.ai_smart_phase || ''
      const totalAnswered = data.totalAnswered || data.total_answered || 0

      // v4.0: AI智能模式下，强制进入自我介绍阶段
      // 条件：ai_smart模式 + （后端返回intro阶段 或 question为null 或 新测评尚未答题）
      console.log('[Test] AI smart check:', { evaluateMode: this.data.evaluateMode, aiSmartPhase, hasQuestion: !!question, totalAnswered })
      if (this.data.evaluateMode === 'ai_smart' && (aiSmartPhase === 'intro' || !question || totalAnswered === 0)) {
        // 缓存start返回的question作为兜底（跳过自我介绍时可用，v4.0后可能为null）
        this._startQuestion = question
        this._startSubLevel = subLevel
        this._startMajorLevel = majorLevel

        // 从模式配置中获取selfIntroGuide
        const selfIntroGuide = app.globalData.selfIntroGuide || {
          title: '请用英语做一段自我介绍',
          description: '请用英语介绍你的名字、从哪里来、学业情况、职业情况、学英语的动力来源和目标。',
          duration: '30秒~2分钟',
          tips: ['尽量用完整的句子表达', '不需要追求完美，自然表达即可', '内容越丰富，AI判断越准确']
        }

        this.setData({
          sessionId: data.sessionId,
          currentQuestion: question || null,  // v4.0: AI智能模式下question可能为null
          currentSubLevel: subLevel,
          currentMajorLevel: majorLevel,
          questionIndex: data.questionIndex || 1,
          totalAnswered: 0,
          subLevelDisplay: subLevel,
          majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
          questionCountDisplay: '第 1 题',
          progressPercent: 0,
          phase: 'selfIntro',
          selfIntroGuide: selfIntroGuide,
          selfIntroRecording: false,
          selfIntroRecordSeconds: 0,
          selfIntroRecordTimeDisplay: '0"',
          selfIntroCountdown: 120,
          selfIntroUploading: false,
          estimatedLevel: null,
          showEstimateResult: false,
          estimateResultText: '',
          modeLabel: 'AI智能定级',
          aiStatusText: '请录制英文自我介绍',
          showQuestionText: false,
          questionTextDisplay: ''
        })

        this._previousSubLevel = subLevel
        this._saveTestSession()
        return  // 不进入guide流程
      }

      // 标准模式：正常进入guide引导流程
      this.setData({
        sessionId: data.sessionId,
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        questionIndex: data.questionIndex || 1,
        totalAnswered: 0,
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
        questionCountDisplay: '第 1 题',
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
    // 如果是确认阶段的重听模式，播放完后回到confirm而不是answering
    if (this._confirmReplayMode) {
      this._confirmReplayMode = false
      this.setData({
        audioPlaying: false,
        aiSpeaking: false,
        aiStatusText: '录音完成，请确认',
        phase: 'confirm'
      })
      return
    }
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
      console.error('[Audio] No currentQuestion! phase:', this.data.phase)
      // 显示提示文字，让用户知道可以录音回答
      this.setData({
        showQuestionText: true,
        questionTextDisplay: '请用英语回答外教的提问'
      })
      setTimeout(() => {
        this._onAudioFinished()
      }, 2000)
      return
    }

    const audioUrl = currentQuestion.audioUrl
    console.warn('[Audio] _playQuestionAudio questionId:', currentQuestion.questionId, 'audioUrl:', audioUrl ? audioUrl.substring(0, 80) : 'EMPTY', 'questionText:', currentQuestion.questionText ? currentQuestion.questionText.substring(0, 30) : 'EMPTY')
    if (audioUrl) {
      // confirm重听模式下也设为listening（显示播放动画），播放完后由_onAudioFinished回到confirm
      this.setData({ phase: 'listening', aiStatusText: this._confirmReplayMode ? '正在重新播放题目...' : `${this.data.teacherName || '外教'}正在提问...` })

      const ctx = this._createAudioContext()
      ctx.src = audioUrl
      ctx.play()

      // 设置初始超时（等待onPlay触发后会重新设置）
      this._setAudioTimeout()
    } else {
      // 没有audioUrl → 尝试TTS降级
      console.warn('[Audio] No audioUrl, falling back to TTS')
      this._tryTTSFallback()
    }
  },

  /** 手动点击语音条重播 */
  playAudio() {
    const { currentQuestion, audioPlaying, phase } = this.data

    if (audioPlaying) {
      this._clearAudioTimeout()
      if (this._audioContext) {
        try { this._audioContext.stop() } catch (e) {}
      }
      return
    }

    if (!currentQuestion || !currentQuestion.audioUrl) return

    // confirm阶段点击音频条重听，播放完后回到confirm
    if (phase === 'confirm') {
      this._confirmReplayMode = true
      this.setData({ phase: 'listening', aiStatusText: '正在重新播放题目...' })
    }

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
      console.warn('[TTS] No questionText available for question:', currentQuestion ? currentQuestion.questionId : 'null')
      // 即使没有questionText，也要显示提示让用户知道可以录音回答
      this.setData({
        showQuestionText: true,
        questionTextDisplay: '请用英语回答外教的提问'
      })
      // 2秒后进入回答阶段
      setTimeout(() => {
        this._onAudioFinished()
      }, 2000)
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
    const questionText = (currentQuestion && currentQuestion.questionText) || ''
    // 设置一个标记让UI显示题目文字
    this.setData({
      showQuestionText: true,
      questionTextDisplay: questionText || '请用英语回答外教的提问'
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

      // v4.0: 自我介绍模式下的pendingStop检查（与做题录音一致）
      if (this._selfIntroMode) {
        console.log('[SelfIntro] Recorder started successfully')
        // 检查是否手指已松开（pendingStop）
        if (this._selfIntroPendingStop || !this._selfIntroTouchActive) {
          this._selfIntroPendingStop = false
          this._selfIntroMode = false  // 重置模式标志，防止竞态
          console.log('[SelfIntro] Finger already released, stopping immediately')
          if (this._selfIntroRecordTimer) {
            clearInterval(this._selfIntroRecordTimer)
            this._selfIntroRecordTimer = null
          }
          this.setData({ selfIntroRecording: false, recordWaveBars: [] })
          try { this._recorderManager.stop() } catch (e) {}
          showToast('说话时间太短，请按住说话')
        }
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

      // v4.0: 如果是自我介绍录音，走自我介绍流程
      // 【关键修复】用_waitingForSelfIntroOnStop代替_selfIntroMode来识别
      // 因为_selfIntroMode已在stop()之前立即重置，防止卡死
      if (this._selfIntroMode || this._waitingForSelfIntroOnStop) {
        const stoppedGeneration = this._selfIntroGeneration
        this._selfIntroMode = false
        // 清除onStop超时保护定时器
        this._waitingForSelfIntroOnStop = false
        if (this._selfIntroStopFallbackTimer) {
          clearTimeout(this._selfIntroStopFallbackTimer)
          this._selfIntroStopFallbackTimer = null
        }
        console.log('[SelfIntro] onStop fired, generation:', stoppedGeneration, 'current:', this._selfIntroGeneration, 'tempFilePath:', res.tempFilePath ? 'yes' : 'no')
        // generation检查：如果当前代数已经变了（用户开始了新录音），忽略旧回调
        if (stoppedGeneration !== this._selfIntroGeneration) {
          console.warn('[SelfIntro] Stale onStop callback (gen', stoppedGeneration, 'vs current', this._selfIntroGeneration, '), ignoring')
          return
        }
        if (res.tempFilePath) {
          this._handleSelfIntroRecordComplete(res.tempFilePath)
        } else {
          showToast('录音失败，请重试')
          this.setData({
            selfIntroRecording: false,
            selfIntroRecordSeconds: 0,
            selfIntroRecordTimeDisplay: '0"'
          })
        }
        return
      }

      // 正常做题录音流程
      this._recordFilePath = res.tempFilePath
      this.setData({ isRecording: false, recordCountdown: 0, recordWaveBars: [] })

      if (plugin && plugin.voiceRecognizer) {
        try { plugin.voiceRecognizer.stop() } catch (e) {}
      }

      if (this._recordFilePath && this.data.recordSeconds >= 1) {
        // 至少录了1秒 → 进入确认阶段（不再自动提交）
        this._enterConfirmPhase()
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
      // 自我介绍录音模式下的错误处理
      if (this._selfIntroMode || this._waitingForSelfIntroOnStop) {
        this._selfIntroMode = false
        this._waitingForSelfIntroOnStop = false
        this._selfIntroProcessing = false
        if (this._selfIntroStopFallbackTimer) {
          clearTimeout(this._selfIntroStopFallbackTimer)
          this._selfIntroStopFallbackTimer = null
        }
        if (this._selfIntroRecordTimer) {
          clearInterval(this._selfIntroRecordTimer)
          this._selfIntroRecordTimer = null
        }
        if (this._selfIntroSafetyTimer) {
          clearTimeout(this._selfIntroSafetyTimer)
          this._selfIntroSafetyTimer = null
        }
        this.setData({ selfIntroRecording: false, recordWaveBars: [] })
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

    // v4.0: 启动分析进度动画
    this._startAnalysisProgress()

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
        // 【修复】关闭分析进度条，防止进度条卡在90%
        this._stopAnalysisProgress()
        // 使用弹窗互斥锁防止叠加
        if (this._showingModal) {
          this.setData({ phase: 'answering', aiStatusText: '请重新录音回答' })
          return
        }
        this._showingModal = true
        wx.showModal({
          title: '网络异常',
          content: '评估请求失败，请检查网络后点击"重新提交"',
          confirmText: '重新提交',
          cancelText: '跳过此题',
          success: (res) => {
            this._showingModal = false
            if (res.confirm) {
              // 用户点"重新提交"→ 重新调用submitAnswer
              this._isSubmitting = false
              this.submitAnswer()
            } else {
              // 用户点"跳过此题"→ 回到answering状态，不跳下一题
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
      console.warn('[Evaluate] Response status:', evalRes.status, 'question:', evalRes.question ? 'exists' : 'NULL', 'questionId:', evalRes.question ? (evalRes.question.questionId || evalRes.question.question_id) : 'N/A', 'audioUrl:', evalRes.question ? (evalRes.question.audioUrl || evalRes.question.audio_url || 'EMPTY') : 'N/A')

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

      // v4.0: 处理analysisSteps分析进度数据
      const analysisStepsData = evalRes.analysisSteps || evalRes.analysis_steps
      if (analysisStepsData) {
        this._completeAnalysisProgress(analysisStepsData)
      } else {
        // 没有analysisSteps时也要关闭进度条
        this._stopAnalysisProgress()
      }

      // v4.0: AI智能模式下更新模式标签
      if (this.data.evaluateMode === 'ai_smart') {
        this.setData({ modeLabel: 'AI智能定级中' })
      }

      // 精简版：不再显示逐题反馈，直接进入下一题或结果页
      this._lastEvalResponse = evalRes

      if (isFinished && !shouldForceContinue) {
        // 真正结束 → 关闭进度条 + 清除缓存 + 跳转结果页
        this._stopAnalysisProgress()
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
      // 【修复】异常时关闭分析进度条
      this._stopAnalysisProgress()
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

  /** 跳过此题（调用skip-question接口，记0分、触发连续放弃规则、影响升降级、不调AI评分） */
  handleSkip() {
    // 防护：弹窗互斥锁，防止多个弹窗叠加
    if (this._showingModal) {
      console.warn('[Skip] Modal already showing, ignored')
      return
    }

    this._showingModal = true
    wx.showModal({
      title: '跳过此题',
      content: '跳过此题将记为0分，可能影响最终定级。确定要跳过吗？',
      success: async (res) => {
        this._showingModal = false
        if (res.confirm) {
          // 跳过时停止倒计时
          this.stopTimer()
          this.setData({
            phase: 'loading',
            aiStatusText: '正在跳过...'
          })

          try {
            // 调用后端skip-question接口：记0分、触发连续放弃规则、影响升降级判定、不调AI评分
            const currentQuestion = this.data.currentQuestion
            const questionId = currentQuestion ? (currentQuestion.questionId || currentQuestion.question_id) : undefined
            console.log('[Skip] Calling skip-question API, sessionId:', this.data.sessionId, 'questionId:', questionId)
            
            const evalRes = await skipQuestion(this.data.sessionId, questionId)
            console.log('[Skip] skip-question response:', JSON.stringify(evalRes).substring(0, 200))

            // 跳过计入前端题号
            this._frontendQuestionCount += 1
            const newTotalAnswered = this._frontendQuestionCount

            // 返回格式与evaluate完全一致，复用_autoNextQuestion处理逻辑
            const isFinished = evalRes.status === 'finished'
            const shouldForceContinue = (isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH)
            console.log('[Skip] 决策参数: status=', evalRes.status, 'newTotalAnswered=', newTotalAnswered, 'MIN=', MIN_QUESTIONS_BEFORE_FINISH, 'isFinished=', isFinished, 'shouldForceContinue=', shouldForceContinue, 'hasNextQuestion=', !!evalRes.question)
            await this._autoNextQuestion(evalRes, newTotalAnswered, shouldForceContinue)

          } catch (err) {
            console.error('[Skip] skip-question failed:', err)
            // 【修复】跳过失败时关闭分析进度条
            this._stopAnalysisProgress()
            // 跳过失败时提供恢复选项
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
      content: '网络异常，无法跳过此题，请选择操作',
      confirmText: '重试',
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
   * 供submitAnswer和handleSkip复用
   */
  async _autoNextQuestion(evalRes, totalAnswered, shouldForceContinue) {
    // 【修复】进入下一题前统一关闭分析进度条
    this._stopAnalysisProgress()

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

        // 安全检查：forceNew后startTest返回的question为null，直接跳转结果页
        if (!question || !question.questionId) {
          console.error('[Test] Force continue: startTest returned no question, redirecting to result')
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

        const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || this.data.currentSubLevel
        const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))

        const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

        this.setData({
          sessionId: data.sessionId || this.data.sessionId,
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
    console.warn('[AutoNext] evalRes.status:', evalRes.status, 'evalRes.question:', evalRes.question ? 'exists' : 'NULL', 'evalRes keys:', Object.keys(evalRes).join(','))
    const nextQuestion = evalRes.question
    if (nextQuestion) {
      if (!nextQuestion.audioUrl && nextQuestion.audio_url) nextQuestion.audioUrl = nextQuestion.audio_url
      if (!nextQuestion.questionText && nextQuestion.question_text) nextQuestion.questionText = nextQuestion.question_text
      if (!nextQuestion.questionId && nextQuestion.question_id) nextQuestion.questionId = nextQuestion.question_id
      if (!nextQuestion.subLevel && nextQuestion.sub_level) nextQuestion.subLevel = nextQuestion.sub_level
    }

    // 安全处理：question为null
    if (!nextQuestion || !nextQuestion.questionId) {
      console.error('[AutoNext] Backend returned continue but question is null/invalid! evalRes:', JSON.stringify(evalRes).substring(0, 500))
      // 【修复】关闭分析进度条，防止进度条和弹窗叠加
      this._stopAnalysisProgress()
      if (this._showingModal) return
      this._showingModal = true
      wx.showModal({
        title: '出题异常',
        content: '服务器未返回下一题，可能是测评已完成。是否查看当前结果？',
        confirmText: '查看结果',
        cancelText: '重试',
        success: async (modalRes) => {
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
            // 重试：重新调用startTest获取新题目（而不是简单设置phase=answering）
            this.setData({ phase: 'loading', aiStatusText: '正在重新获取题目...' })
            try {
              const retryParams = {}
              if (this.data.evaluateMode) retryParams.evaluateMode = this.data.evaluateMode
              const data = await startTest(retryParams)
              const question = data.question
              if (question) {
                if (!question.audioUrl && question.audio_url) question.audioUrl = question.audio_url
                if (!question.questionText && question.question_text) question.questionText = question.question_text
                if (!question.questionId && question.question_id) question.questionId = question.question_id
                if (!question.subLevel && question.sub_level) question.subLevel = question.sub_level
              }
              if (!question || !question.questionId) {
                console.error('[AutoNext] Retry also returned no question')
                this.setData({ phase: 'answering', aiStatusText: '获取题目失败，请点击跳过此题' })
                return
              }
              const subLevel = data.currentSubLevel || data.current_sub_level || (question && question.subLevel) || this.data.currentSubLevel
              const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (data.current_major_level !== undefined ? data.current_major_level : (SUB_LEVEL_MAJOR[subLevel] || 0))
              const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)
              this.setData({
                sessionId: data.sessionId || this.data.sessionId,
                currentQuestion: question,
                currentSubLevel: subLevel,
                currentMajorLevel: majorLevel,
                majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级',
                phase: 'listening',
                aiStatusText: '请听题目',
                audioWaves,
                showQuestionText: false,
                questionTextDisplay: ''
              })
              this._lastEvalResponse = null
              this._recordFilePath = ''
              this._saveTestSession()
              this.startTimer()
              await delay(500)
              this._destroyAudioContext()
              this._playQuestionAudio()
            } catch (retryErr) {
              console.error('[AutoNext] Retry startTest failed:', retryErr)
              this.setData({ phase: 'answering', aiStatusText: '获取题目失败，请点击跳过此题' })
            }
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
    
    // 【修复】关闭分析进度条
    this._stopAnalysisProgress()
    
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

  /** 结束测评并定级（调用terminate接口） */
  handleTerminate() {
    if (this._showingModal) return
    this._showingModal = true
    
    const totalAnswered = this.data.totalAnswered || 0
    let content = `已答${totalAnswered}道题，结束后AI将根据已答题目自动定级。\n确定要结束测评吗？`
    if (totalAnswered < 3) {
      content = `您才答了${totalAnswered}道题，答题太少可能影响定级准确性。\n确定要结束测评吗？`
    }
    
    wx.showModal({
      title: '结束测评',
      content,
      confirmText: '结束定级',
      confirmColor: '#e74c3c',
      cancelText: '继续做题',
      success: async (res) => {
        this._showingModal = false
        if (res.confirm) {
          await this._doTerminate()
        }
      },
      fail: () => {
        this._showingModal = false
      }
    })
  },

  /** 执行terminate接口调用 */
  async _doTerminate() {
    const sessionId = this.data.sessionId
    if (!sessionId) {
      wx.showToast({ title: '缺少会话ID', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '正在生成报告...', mask: true })
    
    try {
      const result = await terminateTest(sessionId, 'user_request')
      console.log('[Terminate] Success:', result)
      wx.hideLoading()
      
      // 清理并跳转结果页
      if (this._isNavigating) return
      this._isNavigating = true
      this._clearTestSession()
      this.cleanup()
      wx.redirectTo({
        url: `/pages/result/result?sessionId=${sessionId}`,
        fail: () => { this._isNavigating = false }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('[Terminate] Failed:', err)
      wx.showModal({
        title: '结束失败',
        content: err.message || '网络异常，请稍后重试',
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this._doTerminate()
          }
        }
      })
    }
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
  },

  // ============ 录音确认阶段（重听/重做/提交） ============

  /**
   * 进入确认阶段：录音完成后不自动提交，让用户选择重听/重录/提交
   */
  _enterConfirmPhase() {
    console.log('[Confirm] Entering confirm phase, recordSeconds:', this.data.recordSeconds)
    // 停止每题倒计时（确认阶段不计时）
    this.stopTimer()
    this.setData({
      phase: 'confirm',
      aiStatusText: '录音完成，请确认'
    })
  },

  /**
   * 确认阶段 - 重听题目：重新播放当前题目的外教语音
   */
  handleConfirmReplay() {
    console.log('[Confirm] User chose to replay question audio')
    // 重新播放当前题目音频，播放完后回到confirm阶段
    this._confirmReplayMode = true
    this._destroyAudioContext()
    this._playQuestionAudio()
  },

  /**
   * 确认阶段 - 重新录音：丢弃当前录音，自动播放题目音频，播放完后进入answering阶段
   * 优化：减少用户操作步骤，重新录音 → 自动播放题目 → 按住说话
   */
  handleConfirmRerecord() {
    console.log('[Confirm] User chose to re-record, will auto-play question audio first')
    this._recordFilePath = ''
    this._confirmReplayMode = false
    this.setData({
      recordSeconds: 0,
      recordTimeDisplay: '0"',
      userTranscription: '',
      realtimeText: ''
    })
    // 销毁旧音频上下文，然后自动播放题目音频
    // 播放完后 _onAudioFinished 会自动进入 answering 阶段
    this._destroyAudioContext()
    this._playQuestionAudio()
  },

  /**
   * 确认阶段 - 提交答案：调用submitAnswer
   */
  handleConfirmSubmit() {
    console.log('[Confirm] User chose to submit answer')
    this._confirmReplayMode = false
    this.submitAnswer()
  },

  // ============ v4.0 自我介绍阶段 ============

  /**
   * 按住开始录制自我介绍（与做题录音一致的按住说话模式）
   * 移植做题录音的全部保护机制：安全定时器 + 全屏遮罩层touchend + 遮罩层tap + pendingStop
   */
  onSelfIntroTouchStart(e) {
    if (this.data.selfIntroRecording || this.data.selfIntroUploading) return
    if (this._isStartingRecord) return
    if (this._selfIntroProcessing) return

    // 记录按下时间戳
    this._selfIntroTouchStartTime = Date.now()
    this._selfIntroTouchActive = true
    this._selfIntroPendingStop = false
    this._isStartingRecord = true
    console.log('[SelfIntro] TouchStart - begin recording')

    // 立即显示录音状态（不等onStart回调，消除视觉延迟）
    const waveBars = Array.from({ length: 20 }, () => Math.floor(Math.random() * 40) + 10)
    this.setData({
      selfIntroRecording: true,
      selfIntroRecordSeconds: 0,
      selfIntroRecordTimeDisplay: '0"',
      selfIntroCountdown: 120,
      recordWaveBars: waveBars
    })

    // 启动录音器（最长2分钟）
    this._selfIntroRecordFilePath = ''
    this._selfIntroMode = true
    this._selfIntroGeneration = (this._selfIntroGeneration || 0) + 1  // 递增代数，标识本次录音会话
    const currentGeneration = this._selfIntroGeneration
    console.log('[SelfIntro] Starting recording, generation:', currentGeneration)
    try {
      this._recorderManager.start({
        duration: 120000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 32000,
        format: 'mp3'
      })
    } catch (err) {
      console.error('[SelfIntro] Start recorder failed:', err)
      this._isStartingRecord = false
      this._selfIntroMode = false
      this._selfIntroTouchActive = false
      this.setData({ selfIntroRecording: false, recordWaveBars: [] })
      showError('录音启动失败，请重试')
      return
    }

    // 安全定时器：125秒后强制停止（兆底保护，比录音器的120秒稍长）
    if (this._selfIntroSafetyTimer) clearTimeout(this._selfIntroSafetyTimer)
    this._selfIntroSafetyTimer = setTimeout(() => {
      console.warn('[SelfIntro] Safety timer fired! Force stopping after 125s')
      if (this.data.selfIntroRecording) {
        this._selfIntroTouchActive = false
        this._stopSelfIntroRecord()
      }
    }, 125000)

    // 启动计时器
    this._selfIntroRecordTimer = setInterval(() => {
      const secs = this.data.selfIntroRecordSeconds + 1
      const countdown = 120 - secs
      if (secs >= 120) {
        this._stopSelfIntroRecord()
        return
      }
      const updateData = {
        selfIntroRecordSeconds: secs,
        selfIntroRecordTimeDisplay: secs + '"',
        selfIntroCountdown: countdown
      }
      if (secs % 2 === 0) {
        updateData.recordWaveBars = Array.from({ length: 20 }, () => Math.floor(Math.random() * 40) + 10)
      }
      this.setData(updateData)
    }, 1000)

    // 录音启动成功后解除防抖锁
    setTimeout(() => {
      this._isStartingRecord = false
    }, 500)
  },

  /**
   * 松开停止自我介绍录音（与做题录音一致的保护机制）
   */
  onSelfIntroTouchEnd(e) {
    console.log('[SelfIntro] touchend/touchcancel triggered, selfIntroRecording:', this.data.selfIntroRecording, '_selfIntroTouchActive:', this._selfIntroTouchActive)
    this._selfIntroTouchActive = false

    // 清除安全定时器（已正常触发touchend）
    if (this._selfIntroSafetyTimer) {
      clearTimeout(this._selfIntroSafetyTimer)
      this._selfIntroSafetyTimer = null
    }

    // 如果录音还没启动成功（onStart还没触发），延迟停止
    if (this._isStartingRecord) {
      this._selfIntroPendingStop = true
      console.log('[SelfIntro] Set pendingStop=true (recorder still starting)')
      return
    }

    if (!this.data.selfIntroRecording) {
      console.log('[SelfIntro] touchend but not recording, ignore')
      return
    }

    // 检查按住时长，太短则取消
    const holdDuration = Date.now() - (this._selfIntroTouchStartTime || 0)
    if (holdDuration < 800) {
      console.log('[SelfIntro] Hold too short:', holdDuration, 'ms, cancelling')
      this._selfIntroMode = false  // 重置模式标志，防止残留影响下次录音
      try { this._recorderManager.stop() } catch (e) {}
      if (this._selfIntroRecordTimer) {
        clearInterval(this._selfIntroRecordTimer)
        this._selfIntroRecordTimer = null
      }
      this.setData({ selfIntroRecording: false, recordWaveBars: [] })
      showToast('说话时间太短，请按住说话')
      this._selfIntroRecordFilePath = ''
      return
    }

    console.log('[SelfIntro] Stopping recording after', holdDuration, 'ms hold')
    this._stopSelfIntroRecord()
  },

  /**
   * 自我介绍录音遮罩层点击事件（兆底保护：点击遮罩层任意位置也停止录音）
   */
  onSelfIntroOverlayTap(e) {
    console.log('[SelfIntro] Overlay tapped, forcing stop recording')
    if (this.data.selfIntroRecording) {
      this._selfIntroTouchActive = false
      this._stopSelfIntroRecord()
    }
  },

  /**
   * 停止自我介绍录音并提交
   */
  _stopSelfIntroRecord() {
    // 清除计时器
    if (this._selfIntroRecordTimer) {
      clearInterval(this._selfIntroRecordTimer)
      this._selfIntroRecordTimer = null
    }
    // 清除安全定时器
    if (this._selfIntroSafetyTimer) {
      clearTimeout(this._selfIntroSafetyTimer)
      this._selfIntroSafetyTimer = null
    }
    // 清除上一次的onStop超时保护
    if (this._selfIntroStopFallbackTimer) {
      clearTimeout(this._selfIntroStopFallbackTimer)
      this._selfIntroStopFallbackTimer = null
    }

    // 记录当前录音时长和generation（用于超时保护时判断）
    const currentRecordSeconds = this.data.selfIntroRecordSeconds
    const stopGeneration = this._selfIntroGeneration
    console.log('[SelfIntro] _stopSelfIntroRecord called, recorded', currentRecordSeconds, 'seconds, generation:', stopGeneration)

    // 标记等待onStop回调
    this._waitingForSelfIntroOnStop = true

    // 【关键修复】stop()之前立即重置_selfIntroMode
    // 这样即使onStop不触发或延迟，也不会阻塞后续操作
    // onStop回调通过_waitingForSelfIntroOnStop标志来识别这是自我介绍录音
    this._selfIntroMode = false

    // 停止录音（onStop回调中处理文件）
    try {
      this._recorderManager.stop()
    } catch (e) {
      console.warn('[SelfIntro] Stop recorder failed:', e)
      // stop失败时也要完全重置，防止卡死
      this._waitingForSelfIntroOnStop = false
      this._selfIntroProcessing = false
    }
    this.setData({
      selfIntroRecording: false,
      recordWaveBars: []
    })

    // onStop超时保护：1.5秒内onStop回调没有触发，静默重置状态让用户可以重新录音
    // 【关键修复】不弹modal（modal可能导致开发者工具卡死），改为轻量toast提示
    this._selfIntroStopFallbackTimer = setTimeout(() => {
      if (!this._waitingForSelfIntroOnStop) return  // 已经正常触发了
      // generation检查：如果用户已经开始了新录音，不干扰
      if (stopGeneration !== this._selfIntroGeneration) {
        console.warn('[SelfIntro] Stale fallback timer (gen', stopGeneration, 'vs current', this._selfIntroGeneration, '), ignoring')
        return
      }
      console.warn('[SelfIntro] onStop callback not fired within 1.5s, silently resetting')
      this._waitingForSelfIntroOnStop = false
      this._selfIntroMode = false
      this._selfIntroProcessing = false
      // 轻量toast提示，不弹modal，用户可以直接重新录音
      if (!this._isPageUnloaded) {
        showToast('录音处理超时，请重新录制')
      }
    }, 1500)
  },

  /**
   * 自我介绍录音完成后的处理（在_setupRecorderEvents中的onStop回调中调用）
   */
  async _handleSelfIntroRecordComplete(filePath) {
    // 防重入：如果上一次还在处理中，忽略
    if (this._selfIntroProcessing) {
      console.warn('[SelfIntro] Already processing, ignore duplicate call')
      return
    }
    this._selfIntroProcessing = true

    const recordSeconds = this.data.selfIntroRecordSeconds
    
    // 录音太短（<3秒），提示重新录制
    if (recordSeconds < 3) {
      this._selfIntroProcessing = false
      showToast('录音太短，请尽量多说一些')
      this.setData({
        selfIntroRecording: false,
        selfIntroRecordSeconds: 0,
        selfIntroRecordTimeDisplay: '0"'
      })
      return
    }

    this._selfIntroRecordFilePath = filePath

    // 初始化五维度分析进度
    const dimColors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444']
    const dimNames = ['语法复杂度', '词汇丰富度', '表达连贯性', '流利度', '内容深度']
    const introAnalysisDims = dimNames.map((name, i) => ({
      name,
      color: dimColors[i],
      percentage: 0,
      pctDisplay: '0.00'
    }))

    // 开始上传+预估流程
    this.setData({
      selfIntroUploading: true,
      aiStatusText: '正在上传录音...',
      introAnalysisDims: introAnalysisDims,
      introAnalysisOverallPct: 0,
      introAnalysisStatus: '正在上传录音...'
    })

    // 延迟启动五维度分析进度模拟动画，避免与录音停止回调的setData冲突
    setTimeout(() => {
      this._startIntroAnalysisProgress(introAnalysisDims)
    }, 500)

    try {
      // 第一步：上传录音到OSS
      const uploadRes = await uploadAudio(
        filePath,
        this.data.sessionId,
        'self-intro'
      )
      const audioUrl = uploadRes.audioUrl || uploadRes.audio_url || uploadRes.url || ''

      if (!audioUrl) {
        throw new Error('录音上传失败，请重试')
      }

      // 上传完成，更新状态
      this.setData({
        aiStatusText: 'AI正在分析你的英语水平...',
        introAnalysisStatus: 'AI正在深度分析...'
      })

      // 第二步：调用selfIntroEstimate接口
      const estimateData = await selfIntroEstimate(this.data.sessionId, audioUrl)

      // 完成分析进度动画
      this._completeIntroAnalysisProgress(() => {
        // 动画完成后展示预估结果
        this._selfIntroProcessing = false
        this._showEstimateResult(estimateData)
      })

    } catch (err) {
      console.error('[SelfIntro] Estimate failed:', err)
      this._selfIntroProcessing = false
      // 清理分析进度定时器
      if (this._introAnalysisTimer) {
        clearInterval(this._introAnalysisTimer)
        this._introAnalysisTimer = null
      }
      if (this._introAnalysisTimeouts) {
        this._introAnalysisTimeouts.forEach(t => clearTimeout(t))
        this._introAnalysisTimeouts = []
      }
      this.setData({
        selfIntroUploading: false,
        introAnalysisDims: [],
        introAnalysisOverallPct: 0,
        introAnalysisStatus: '',
        introAnalysisComplete: false
      })
      
      if (this._showingModal || this._isPageUnloaded) return
      this._showingModal = true
      // 区分网络错误和业务错误，显示友好提示
      var errMsg = err.message || ''
      var isNetErr = errMsg.indexOf('网络') !== -1 || errMsg.indexOf('network') !== -1 || errMsg.indexOf('net::') !== -1 || errMsg.indexOf('timeout') !== -1 || errMsg.indexOf('uploadFile:fail') !== -1
      var displayContent = isNetErr
        ? '网络连接不稳定，建议检查网络后重新录制，或跳过直接开始测评'
        : (errMsg || '自我介绍分析失败，是否跳过直接开始测评？')
      wx.showModal({
        title: isNetErr ? '网络不稳定' : '分析失败',
        content: displayContent,
        confirmText: '跳过开始',
        cancelText: '重新录制',
        success: (res) => {
          this._showingModal = false
          if (this._isPageUnloaded) return
          if (res.confirm) {
            this._handleSkipIntro()
          } else {
            // 回到自我介绍页面
            this.setData({
              phase: 'selfIntro',
              selfIntroRecordSeconds: 0,
              selfIntroRecordTimeDisplay: '0"',
              aiStatusText: '请重新录制英文自我介绍'
            })
          }
        },
        fail: () => { this._showingModal = false }
      })
    }
  },

  /**
   * 展示预估结果（多维度能力分析）
   */
  _showEstimateResult(estimateData) {
    const el = estimateData.estimatedLevel || {}
    const lowerName = el.lowerBoundName || el.lowerBound || 'PRE1'
    const upperName = el.upperBoundName || el.upperBound || ''
    const startLevelName = estimateData.startSubLevelName || estimateData.startSubLevel || 'PRE1'

    // 级别范围文案：显示为"下界以上"格式（如"G7以上"），不显示上界
    let levelRange = ''
    if (estimateData.levelRange) {
      // 后端返回了levelRange，但需要转换格式：取下界+"以上"
      const parts = estimateData.levelRange.split(/\s*[-~]\s*/)
      levelRange = parts[0] ? `${parts[0]} 以上` : estimateData.levelRange
    } else if (lowerName) {
      levelRange = `${lowerName} 以上`
    } else {
      levelRange = `${startLevelName} 以上`
    }

    // 级别描述：强制使用"途正口语X级"格式，跨级时显示"X-Y级"
    // 不使用后端的levelRangeNames（可能是"初一到初三"这样的年级描述）
    // 优先从levelRange字符串中提取子级别名来计算大级别（因为estimatedLevel对象可能缺失字段）
    let effectiveLower = lowerName
    let effectiveUpper = upperName
    if (estimateData.levelRange) {
      const rangeParts = estimateData.levelRange.split(/\s*[-~]\s*/)
      if (rangeParts[0] && SUB_LEVEL_MAJOR[rangeParts[0]] !== undefined) {
        effectiveLower = rangeParts[0]
      }
      if (rangeParts[1] && SUB_LEVEL_MAJOR[rangeParts[1]] !== undefined) {
        effectiveUpper = rangeParts[1]
      }
    }
    const lowerMajor = SUB_LEVEL_MAJOR[effectiveLower] !== undefined ? SUB_LEVEL_MAJOR[effectiveLower] : (SUB_LEVEL_MAJOR[startLevelName] !== undefined ? SUB_LEVEL_MAJOR[startLevelName] : 0)
    const upperMajor = effectiveUpper ? (SUB_LEVEL_MAJOR[effectiveUpper] !== undefined ? SUB_LEVEL_MAJOR[effectiveUpper] : lowerMajor) : lowerMajor
    const majorLevel = lowerMajor
    let levelDesc = ''
    if (lowerMajor !== upperMajor) {
      levelDesc = `途正口语${lowerMajor}-${upperMajor}级`
    } else {
      levelDesc = `途正口语${lowerMajor}级`
    }
    console.log('[EstimateResult] effectiveLower:', effectiveLower, 'effectiveUpper:', effectiveUpper, 'lowerMajor:', lowerMajor, 'upperMajor:', upperMajor)

    // 引导文案：优先用后端 guidanceText
    const guidanceText = estimateData.guidanceText || '为了更准确定级，请继续完成接下来的外教问答'

    // 综合能力总评：后端 overallComment
    const overallComment = estimateData.overallComment || ''

    // 多维度能力数据：优先用后端 abilityRadar，其次 dimensions，最后生成默认值
    const radar = estimateData.abilityRadar || estimateData.dimensions || el.dimensions || null
    const dimensionColors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444']
    const defaultLabels = ['语法复杂度', '词汇丰富度', '表达连贯性', '流利度', '内容深度']
    let estimateDimensions = []
    if (radar && Array.isArray(radar) && radar.length >= 5) {
      // 后端返回了维度数据
      estimateDimensions = radar.map((d, i) => {
        // 兼容后端字段名：dimensionName / name / label
        const label = d.dimensionName || d.label || d.name || defaultLabels[i]
        return {
          name: d.name || label,
          label: label,
          score: Math.round(d.score || 0),
          comment: d.comment || '',
          color: dimensionColors[i % dimensionColors.length]
        }
      })
    } else {
      // 后端未返回维度数据，根据级别生成合理默认值
      const baseScores = {
        0: [35, 30, 25, 30, 20],
        1: [55, 50, 45, 50, 40],
        2: [70, 65, 60, 68, 55],
        3: [85, 80, 78, 82, 75]
      }
      const scores = baseScores[majorLevel] || baseScores[0]
      estimateDimensions = defaultLabels.map((label, i) => {
        const jitter = Math.floor(Math.random() * 11) - 5
        const score = Math.max(5, Math.min(100, scores[i] + jitter))
        return {
          name: label,
          label: label,
          score: score,
          comment: '',
          color: dimensionColors[i]
        }
      })
    }

    let resultText = ''
    if (lowerName) {
      resultText = `AI预估你的水平在 ${lowerName} 以上\n将从 ${startLevelName} 级别开始测评`
    } else {
      resultText = `分析完成，将从 ${startLevelName} 级别开始测评`
    }

    // 缓存预估返回的题目和级别，用户点击“开始做题”时再进入
    this._estimateQuestion = estimateData.question || this._startQuestion
    this._estimateSubLevel = estimateData.startSubLevel || this._startSubLevel || 'PRE1'
    this._estimateMajorLevel = SUB_LEVEL_MAJOR[this._estimateSubLevel] !== undefined ? SUB_LEVEL_MAJOR[this._estimateSubLevel] : 0

    console.log('[EstimateResult] levelRange:', levelRange, 'levelDesc:', levelDesc)
    console.log('[EstimateResult] guidanceText:', guidanceText)
    console.log('[EstimateResult] overallComment:', overallComment)
    console.log('[EstimateResult] dimensions:', estimateDimensions.length, 'items')

    // 分两步setData，避免一次性传输大量数据导致卡顿
    this.setData({
      selfIntroUploading: false,
      showEstimateResult: true,
      estimatedLevel: el,
      estimateResultText: resultText,
      estimateLevelRange: levelRange,
      estimateLevelDesc: levelDesc,
      estimateGuidanceText: guidanceText,
      estimateOverallComment: overallComment,
      currentQuestion: this._estimateQuestion,
      currentSubLevel: this._estimateSubLevel,
      currentMajorLevel: this._estimateMajorLevel,
      subLevelDisplay: this._estimateSubLevel,
      majorLevelDisplay: MAJOR_LEVEL_NAMES[this._estimateMajorLevel] || '途正口语0级',
      aiStatusText: '分析完成！'
    })
    // 延迟设置维度数据，避免与上面的setData拢在一起
    setTimeout(() => {
      this.setData({ estimateDimensions: estimateDimensions })
    }, 50)

    // 绘制雷达图
    setTimeout(() => {
      this._drawRadarChart(estimateDimensions)
    }, 300)
  },

  /**
   * 绘制多维度能力雷达图（Canvas 2D）
   */
  _drawRadarChart(dimensions) {
    const query = this.createSelectorQuery()
    query.select('#radarCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio || 2
        const width = res[0].width
        const height = res[0].height
        canvas.width = width * dpr
        canvas.height = height * dpr
        ctx.scale(dpr, dpr)

        const cx = width / 2
        const cy = height / 2
        const maxR = Math.min(cx, cy) - 30
        const count = dimensions.length
        const angleStep = (Math.PI * 2) / count
        const startAngle = -Math.PI / 2  // 从顶部开始

        // 背景网格（5层）
        const levels = 5
        for (let l = 1; l <= levels; l++) {
          const r = (maxR / levels) * l
          ctx.beginPath()
          for (let i = 0; i <= count; i++) {
            const angle = startAngle + angleStep * (i % count)
            const x = cx + r * Math.cos(angle)
            const y = cy + r * Math.sin(angle)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
          ctx.strokeStyle = l === levels ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.06)'
          ctx.lineWidth = l === levels ? 1.5 : 1
          ctx.stroke()
          if (l === levels) {
            ctx.fillStyle = 'rgba(59,130,246,0.02)'
            ctx.fill()
          }
        }

        // 轴线
        for (let i = 0; i < count; i++) {
          const angle = startAngle + angleStep * i
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle))
          ctx.strokeStyle = 'rgba(59,130,246,0.08)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        // 数据区域（渐变填充）
        ctx.beginPath()
        for (let i = 0; i <= count; i++) {
          const idx = i % count
          const angle = startAngle + angleStep * idx
          const r = (dimensions[idx].score / 100) * maxR
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fillStyle = 'rgba(59,130,246,0.12)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(59,130,246,0.6)'
        ctx.lineWidth = 2
        ctx.stroke()

        // 数据点
        for (let i = 0; i < count; i++) {
          const angle = startAngle + angleStep * i
          const r = (dimensions[i].score / 100) * maxR
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = dimensions[i].color
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        // 维度标签
        ctx.font = '11px -apple-system, PingFang SC, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < count; i++) {
          const angle = startAngle + angleStep * i
          const labelR = maxR + 20
          const x = cx + labelR * Math.cos(angle)
          const y = cy + labelR * Math.sin(angle)
          ctx.fillStyle = '#5a6a7a'
          ctx.fillText(dimensions[i].label, x, y)
        }
      })
  },

  /**
   * 用户点击“开始做题”按钮（预估结果页）
   */
  handleStartTestFromEstimate() {
    const question = this._estimateQuestion || this._startQuestion
    if (!question) {
      showError('题目加载失败，请重试')
      return
    }
    // 重置预估结果相关状态
    this.setData({
      showEstimateResult: false,
      estimateLevelRange: '',
      estimateLevelDesc: '',
      estimateDimensions: [],
      estimateOverallComment: '',
      estimateGuidanceText: '',
      introAnalysisDims: [],
      introAnalysisOverallPct: 0,
      introAnalysisStatus: '',
      introAnalysisComplete: false
    })
    this._enterTestingPhase(question)
  },

  /**
   * 用户点击“重新录制”按钮（预估结果页）
   */
  handleReRecordIntro() {
    this._selfIntroProcessing = false
    this.setData({
      showEstimateResult: false,
      estimateResultText: '',
      estimatedLevel: null,
      estimateLevelRange: '',
      estimateLevelDesc: '',
      estimateDimensions: [],
      estimateOverallComment: '',
      estimateGuidanceText: '',
      introAnalysisDims: [],
      introAnalysisOverallPct: 0,
      introAnalysisStatus: '',
      introAnalysisComplete: false,
      selfIntroRecording: false,
      selfIntroRecordSeconds: 0,
      selfIntroRecordTimeDisplay: '0"',
      selfIntroCountdown: 120,
      selfIntroUploading: false,
      phase: 'selfIntro',
      aiStatusText: '请重新录制英文自我介绍'
    })
  },

  /**
   * 跳过自我介绍
   */
  handleSkipIntro() {
    if (this._showingModal) return
    this._showingModal = true
    wx.showModal({
      title: '跳过自我介绍',
      content: '跳过后将从最低级别开始测评，可能需要答更多题目。确定跳过吗？',
      confirmText: '确定跳过',
      cancelText: '继续录制',
      success: (res) => {
        this._showingModal = false
        if (res.confirm) {
          this._handleSkipIntro()
        }
      },
      fail: () => { this._showingModal = false }
    })
  },

  /**
   * 执行跳过自我介绍逻辑
   */
  async _handleSkipIntro() {
    this.setData({
      phase: 'loading',
      aiStatusText: '正在准备测评...'
    })

    try {
      const data = await skipIntro(this.data.sessionId)
      const question = data.question || this._startQuestion
      const subLevel = data.startSubLevel || this._startSubLevel || 'PRE1'
      const majorLevel = SUB_LEVEL_MAJOR[subLevel] !== undefined ? SUB_LEVEL_MAJOR[subLevel] : 0

      this.setData({
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '途正口语0级'
      })

      this._enterTestingPhase(question)

    } catch (err) {
      console.error('[SkipIntro] Failed:', err)
      // v4.0: start返回的question可能为null，尝试用兜底question
      const question = this._startQuestion
      if (question && question.questionId) {
        this._enterTestingPhase(question)
      } else {
        // 没有兜底题目，提示用户重试
        showError('准备测评失败，请重试')
        this.setData({ phase: 'selfIntro', aiStatusText: '请录制英文自我介绍' })
      }
    }
  },

  /**
   * 进入正式做题阶段（自我介绍完成/跳过后调用）
   */
  _enterTestingPhase(question) {
    if (!question || !question.questionId) {
      console.error('[EnterTesting] No valid question!')
      showError('题目加载失败，请重试')
      return
    }

    const audioWaves = Array.from({ length: 60 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      currentQuestion: question,
      phase: 'listening',
      showEstimateResult: false,
      selfIntroGuide: null,
      aiStatusText: '请听题目',
      audioWaves,
      showQuestionText: false,
      questionTextDisplay: ''
    })

    this._previousSubLevel = this.data.currentSubLevel
    this._lastEvalResponse = null
    this._recordFilePath = ''
    this._saveTestSession()

    this.startTimer()

    // 自动播放外教语音
    setTimeout(() => {
      this._destroyAudioContext()
      this._playQuestionAudio()
    }, 500)
  },

  // ============ 自我介绍五维度分析进度动画 ============

  /**
   * 启动自我介绍五维度分析进度（CSS transition驱动，无setInterval）
   * 核心思路：只用setTimeout在关键时间点setData设置目标百分比，
   * 进度条动画完全由CSS transition完成，大幅减少setData调用次数。
   * 整个过程只有6次setData（每个维度1次 + 初始1次），而非之前的50+次。
   */
  _startIntroAnalysisProgress(dims) {
    // 清理旧定时器（兼容）
    if (this._introAnalysisTimer) {
      clearInterval(this._introAnalysisTimer)
      this._introAnalysisTimer = null
    }
    // 清理旧的setTimeout队列
    if (this._introAnalysisTimeouts) {
      this._introAnalysisTimeouts.forEach(t => clearTimeout(t))
    }
    this._introAnalysisTimeouts = []

    const statusTexts = [
      '正在分析语法复杂度...',
      '正在分析词汇丰富度...',
      '正在分析表达连贯性...',
      '正在分析流利度...',
      '正在分析内容深度...'
    ]
    // 每个维度的动画延迟（累计），模拟依次推进
    const dimDelays = [0, 2200, 4000, 5800, 7600]

    // 初始状态文案
    this.setData({ introAnalysisStatus: statusTexts[0] })

    // 依次为每个维度设置目标百分比（90%），CSS transition自动动画
    for (let i = 0; i < 5; i++) {
      const t = setTimeout(() => {
        if (this._isPageUnloaded) return
        const overallPct = Math.round(((i * 90) + 90) / 5)  // 当前维度完成90%时的总进度
        this.setData({
          [`introAnalysisDims[${i}].percentage`]: 90,
          [`introAnalysisDims[${i}].pctDisplay`]: '90.00',
          introAnalysisOverallPct: overallPct,
          introAnalysisStatus: i < 4 ? statusTexts[i] : statusTexts[4]
        })
        // 当前维度激活（前面的维度已经有值，自动active）
      }, dimDelays[i])
      this._introAnalysisTimeouts.push(t)
    }
  },

  /**
   * 完成自我介绍分析进度：将所有维度快速填充到100%，然后展示勾选动画，再过渡到结果页
   */
  _completeIntroAnalysisProgress(callback) {
    // 清理旧的setInterval（兼容）
    if (this._introAnalysisTimer) {
      clearInterval(this._introAnalysisTimer)
      this._introAnalysisTimer = null
    }
    // 清理setTimeout队列，停止未完成的进度动画
    if (this._introAnalysisTimeouts) {
      this._introAnalysisTimeouts.forEach(t => clearTimeout(t))
      this._introAnalysisTimeouts = []
    }

    const dimCount = this.data.introAnalysisDims.length
    const STEP_DELAY = 200  // 每个维度间隔200ms完成

    for (let idx = 0; idx < dimCount; idx++) {
      setTimeout(() => {
        // 使用路径式setData，只更新单个维度，避免传输整个数组
        const completedCount = idx + 1
        // 计算已完成维度的总进度
        let totalPct = completedCount * 100
        // 加上未完成维度的当前进度
        for (let j = completedCount; j < dimCount; j++) {
          const dimData = this.data.introAnalysisDims[j]
          totalPct += dimData ? dimData.percentage : 0
        }
        const overallPct = Math.round(totalPct / dimCount)
        const dimName = this.data.introAnalysisDims[idx] ? this.data.introAnalysisDims[idx].name : ''

        this.setData({
          [`introAnalysisDims[${idx}].percentage`]: 100,
          [`introAnalysisDims[${idx}].pctDisplay`]: '100.00',
          [`introAnalysisDims[${idx}].color`]: '#10B981',
          introAnalysisOverallPct: overallPct,
          introAnalysisStatus: idx === dimCount - 1 ? '分析完成！' : `正在完成${dimName}分析...`
        })

        // 最后一个维度完成后，展示勾选动画
        if (idx === dimCount - 1) {
          setTimeout(() => {
            this.setData({
              introAnalysisComplete: true,
              introAnalysisStatus: '分析完成'
            })
            // 勾选动画展示1.2秒后过渡到结果页
            setTimeout(() => {
              this.setData({ introAnalysisComplete: false })
              if (callback) callback()
            }, 1200)
          }, 300)
        }
      }, idx * STEP_DELAY)
    }
  },

  // ============ v4.0 分析进度条动画 ============

  /**
   * 开始模拟分析进度动画
   * 在evaluate请求发出时立即调用，模拟每个步骤的进度
   */
  _startAnalysisProgress() {
    // 清除旧的定时器
    if (this._analysisProgressTimer) {
      clearInterval(this._analysisProgressTimer)
      this._analysisProgressTimer = null
    }

    // 默认步骤配置（首次使用默认值，后续用实际耗时校准）
    const lastSteps = this._lastAnalysisSteps
    const steps = [
      { name: '语音转文字中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[0]) ? lastSteps[0].durationMs * 1.1 : 1500 },
      { name: 'AI分析语法中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[1]) ? lastSteps[1].durationMs * 1.1 : 800 },
      { name: 'AI分析词汇量中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[2]) ? lastSteps[2].durationMs * 1.1 : 800 },
      { name: 'AI分析流利度中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[3]) ? lastSteps[3].durationMs * 1.1 : 800 },
      { name: '分析综合能力中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[4]) ? lastSteps[4].durationMs * 1.1 : 800 },
      { name: '筛选下一题中', percentage: 0, pctDisplay: '0.00', estimatedMs: (lastSteps && lastSteps[5]) ? lastSteps[5].durationMs * 1.1 : 300 }
    ]

    this.setData({
      showAnalysisProgress: true,
      analysisSteps: steps,
      analysisCurrentStep: 0
    })

    // 计算每个步骤的模拟时间
    let currentStepIdx = 0
    const INTERVAL = 80  // 每80ms更新一次

    this._analysisProgressTimer = setInterval(() => {
      if (currentStepIdx >= steps.length) {
        clearInterval(this._analysisProgressTimer)
        this._analysisProgressTimer = null
        return
      }

      const step = steps[currentStepIdx]
      // 每次增加的百分比：根据预估时间计算
      const incrementPerTick = (INTERVAL / step.estimatedMs) * 90  // 最多到 90%
      step.percentage = Math.min(step.percentage + incrementPerTick, 90)
      step.pctDisplay = step.percentage >= 100 ? '100.00' : step.percentage.toFixed(2)

      if (step.percentage >= 90) {
        step.pctDisplay = '90.00'
        currentStepIdx++
        if (currentStepIdx < steps.length) {
          steps[currentStepIdx].percentage = 0
          steps[currentStepIdx].pctDisplay = '0.00'
        }
      }

      this.setData({
        analysisSteps: steps,
        analysisCurrentStep: currentStepIdx
      })
    }, INTERVAL)

    // 【修复】超时保护：30秒后自动关闭进度条，防止永久卡死
    if (this._analysisProgressTimeout) {
      clearTimeout(this._analysisProgressTimeout)
    }
    this._analysisProgressTimeout = setTimeout(() => {
      console.warn('[AnalysisProgress] Timeout 30s, force closing')
      this._stopAnalysisProgress()
    }, 30000)
  },

  /**
   * 【新增】强制关闭分析进度条（统一入口）
   * 清除定时器 + 超时定时器 + 隐藏浮层
   */
  _stopAnalysisProgress() {
    if (this._analysisProgressTimer) {
      clearInterval(this._analysisProgressTimer)
      this._analysisProgressTimer = null
    }
    if (this._analysisProgressTimeout) {
      clearTimeout(this._analysisProgressTimeout)
      this._analysisProgressTimeout = null
    }
    this.setData({ showAnalysisProgress: false })
  },

  /**
   * evaluate返回后，从上到下逐个完成到100%并校准
   */
  _completeAnalysisProgress(analysisStepsData) {
    // 清除模拟定时器
    if (this._analysisProgressTimer) {
      clearInterval(this._analysisProgressTimer)
      this._analysisProgressTimer = null
    }
    // 【修复】清除超时保护定时器
    if (this._analysisProgressTimeout) {
      clearTimeout(this._analysisProgressTimeout)
      this._analysisProgressTimeout = null
    }

    // 缓存实际耗时用于下次校准
    if (analysisStepsData && analysisStepsData.steps) {
      this._lastAnalysisSteps = analysisStepsData.steps
    }

    // 从上到下逐个完成到100%，每个步骤间隔150ms
    const steps = [...this.data.analysisSteps]
    const STEP_DELAY = 150  // 每个步骤完成的间隔

    steps.forEach((step, idx) => {
      setTimeout(() => {
        steps[idx].percentage = 100
        steps[idx].pctDisplay = '100.00'
        this.setData({
          analysisSteps: [...steps],
          analysisCurrentStep: idx
        })

        // 最后一个步骤完成后，500ms后隐藏进度条
        if (idx === steps.length - 1) {
          setTimeout(() => {
            this._stopAnalysisProgress()
          }, 500)
        }
      }, idx * STEP_DELAY)
    })
  }
})
