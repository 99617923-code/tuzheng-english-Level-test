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
 * 前端保底规则：至少答完10题才允许定级结束
 * 如果后端在10题内返回finished，前端会继续请求新题目
 */
const app = getApp()
const { startTest, evaluateAnswer, uploadAudio, terminateTest, transcribeAudio, textToSpeech } = require('../../utils/api')
const { formatTime, showToast, showError, delay } = require('../../utils/util')

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
const MIN_QUESTIONS_BEFORE_FINISH = 10

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
    showLevelUp: false,

    // 下一步按钮文字
    nextButtonText: '下一题'
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
  _initRetryCount: 0,
  _forceMinQuestions: true,  // 前端保底：至少10题

  onLoad(options) {
    const navLayout = app.getNavLayout()
    const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      audioWaves
    })

    this._recorderManager = wx.getRecorderManager()
    this._audioContext = wx.createInnerAudioContext()
    // 设置音频属性，确保在小程序中可以播放
    this._audioContext.obeyMuteSwitch = false  // 不受静音开关影响
    this._isNavigating = false
    this._isSubmitting = false
    this._initRetryCount = 0
    this._setupAudioEvents()
    this._setupRecorderEvents()

    // 检查是否是恢复测评
    if (options && options.resume === '1') {
      this._resumeTest()
    } else {
      this.initTest()
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
    if (this._audioContext) {
      try {
        this._audioContext.stop()
        this._audioContext.destroy()
      } catch (e) {}
      this._audioContext = null
    }
    if (this._recorderManager) {
      try { this._recorderManager.stop() } catch (e) {}
    }
    if (plugin && plugin.voiceRecognizer) {
      try { plugin.voiceRecognizer.stop() } catch (e) {}
    }
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
        totalAnswered, totalSeconds, currentQuestion, savedAt: Date.now()
      }
      wx.setStorageSync('tz_test_session', sessionData)
      console.log('[Test] Session saved:', sessionId, 'answered:', totalAnswered)
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
      const subLevel = data.currentSubLevel || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (SUB_LEVEL_MAJOR[subLevel] || 0)
      const isResumed = data.sessionId === saved.sessionId
      const totalAnswered = data.totalAnswered || 0

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
        questionCountDisplay: `第 ${totalAnswered + 1} 题`,
        progressPercent: Math.min((totalAnswered / 34) * 100, 95),
        phase: 'listening',
        aiStatusText: isResumed ? '已恢复，请听题目' : '请听题目'
      })

      this._previousSubLevel = subLevel
      this.startTimer()
      this._saveTestSession()

      if (isResumed) {
        wx.showToast({ title: `已恢复测评（第${totalAnswered + 1}题）`, icon: 'none', duration: 2000 })
      }

      // 自动播放语音
      await delay(800)
      this._autoPlayAudio()

    } catch (err) {
      console.error('[Test] Resume failed:', err)
      wx.showModal({
        title: '恢复失败',
        content: '无法恢复上次的测评，是否开始新测评？',
        confirmText: '重新开始',
        confirmColor: '#83BA12',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            this._clearTestSession()
            this.initTest()
          } else {
            this._clearTestSession()
            if (!this._isNavigating) {
              this._isNavigating = true
              wx.navigateBack({ fail: () => {
                wx.reLaunch({ url: '/pages/home/home' })
              }})
            }
          }
        }
      })
    }
  },

  // ============ 初始化测评（v2） ============

  async initTest() {
    this.setData({ phase: 'loading', aiStatusText: '正在准备测评...' })

    try {
      const data = await startTest()

      const question = data.question
      const subLevel = data.currentSubLevel || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (SUB_LEVEL_MAJOR[subLevel] || 0)
      const totalAnswered = data.totalAnswered || 0

      this.setData({
        sessionId: data.sessionId,
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        questionIndex: data.questionIndex || 1,
        totalAnswered: totalAnswered,
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '零级 · 预备',
        // 题号从 totalAnswered+1 开始（正常新测评 totalAnswered=0 → 第1题）
        questionCountDisplay: `第 ${totalAnswered + 1} 题`,
        progressPercent: 0,
        phase: 'guide',
        showGuide: true,
        guideStep: 1,
        aiStatusText: '你好！我是你的AI外教'
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

      wx.showModal({
        title: '创建测评失败',
        content: err.message || '服务器响应异常，请稍后再试',
        confirmText: '重试',
        cancelText: '返回',
        confirmColor: '#83BA12',
        success: (res) => {
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
        }
      })
    }
  },

  // ============ 音频播放 ============

  _setupAudioEvents() {
    this._audioContext.onPlay(() => {
      console.log('[Audio] Playing')
      this.setData({ audioPlaying: true, aiSpeaking: true, aiStatusText: '外教正在提问...' })
    })

    this._audioContext.onEnded(() => {
      console.log('[Audio] Ended')
      this.setData({
        audioPlaying: false,
        aiSpeaking: false,
        aiStatusText: '请用英语回答',
        phase: 'answering'
      })
    })

    this._audioContext.onError((err) => {
      console.error('[Audio] Play error:', err)
      // 音频播放失败 → 尝试TTS降级
      this._tryTTSFallback()
    })

    this._audioContext.onStop(() => {
      this.setData({ audioPlaying: false, aiSpeaking: false })
    })
  },

  /** 自动播放音频（进入题目后自动调用） */
  _autoPlayAudio() {
    const { currentQuestion } = this.data

    if (currentQuestion && currentQuestion.audioUrl) {
      console.log('[Audio] Auto-playing:', currentQuestion.audioUrl)
      this.setData({ phase: 'listening', aiStatusText: '外教正在提问...' })
      this._audioContext.src = currentQuestion.audioUrl
      this._audioContext.play()
    } else {
      // 没有audioUrl → 尝试TTS
      console.log('[Audio] No audioUrl, trying TTS fallback')
      this._tryTTSFallback()
    }
  },

  /** 手动点击语音条重播 */
  playAudio() {
    const { currentQuestion, audioPlaying } = this.data

    if (audioPlaying) {
      this._audioContext.stop()
      return
    }

    if (!currentQuestion || !currentQuestion.audioUrl) return

    this._audioContext.src = currentQuestion.audioUrl
    this._audioContext.play()
  },

  /** TTS降级：audioUrl不可用时用后端TTS生成语音 */
  async _tryTTSFallback() {
    const { currentQuestion } = this.data
    if (!currentQuestion || !currentQuestion.questionText) {
      // 连文本都没有，直接进入回答阶段
      this.setData({ phase: 'answering', aiStatusText: '请用英语回答', audioPlaying: false, aiSpeaking: false })
      return
    }

    try {
      console.log('[TTS] Generating speech for:', currentQuestion.questionText)
      this.setData({ phase: 'listening', aiStatusText: '正在生成语音...' })
      const ttsRes = await textToSpeech(currentQuestion.questionText)
      const ttsUrl = ttsRes.audioUrl || ttsRes.audio_url || ttsRes.url || ''

      if (ttsUrl) {
        console.log('[TTS] Playing generated audio:', ttsUrl)
        // 更新currentQuestion的audioUrl以便重播
        const updatedQuestion = { ...currentQuestion, audioUrl: ttsUrl }
        this.setData({ currentQuestion: updatedQuestion })
        this._audioContext.src = ttsUrl
        this._audioContext.play()
      } else {
        // TTS也失败了，直接进入回答
        this.setData({ phase: 'answering', aiStatusText: '请用英语回答', audioPlaying: false, aiSpeaking: false })
      }
    } catch (e) {
      console.warn('[TTS] Fallback failed:', e)
      this.setData({ phase: 'answering', aiStatusText: '请用英语回答', audioPlaying: false, aiSpeaking: false })
    }
  },

  // ============ 录音（改为tap切换模式） ============

  _setupRecorderEvents() {
    this._recorderManager.onStart(() => {
      console.log('[Recorder] Started')
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
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
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
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
      this.setData({ isRecording: false })
      showError('录音失败，请重试')
    })
  },

  /** 点击切换录音（tap模式） */
  toggleRecording() {
    if (this.data.phase !== 'answering') return

    if (this.data.isRecording) {
      this.stopRecording()
    } else {
      this.startRecording()
    }
  },

  /** 开始录音 */
  startRecording() {
    if (this.data.isRecording) return

    // 先检查录音权限
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
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
    } catch (e) {
      console.error('[Recorder] Start exception:', e)
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

    if (this._isSubmitting) {
      console.warn('[Submit] Already submitting, skip')
      return
    }
    this._isSubmitting = true

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
      }

      // 第二步：如果同声传译没识别到文字 + 有audioUrl → 用后端Whisper转写
      let finalTranscription = userTranscription || ''
      if (!finalTranscription && audioUrl) {
        try {
          console.log('[Whisper] Transcribing uploaded audio...')
          const whisperRes = await transcribeAudio(audioUrl, 'en')
          finalTranscription = whisperRes.text || whisperRes.transcription || ''
          console.log('[Whisper] Result:', finalTranscription)
        } catch (e) {
          console.warn('[Whisper] Transcribe failed:', e.message)
        }
      }

      // 第三步：调用v2 evaluate接口
      const evalRes = await evaluateAnswer({
        sessionId,
        questionId: currentQuestion.questionId,
        audioUrl: audioUrl || undefined,
        recognizedText: finalTranscription || '',
        duration: recordSeconds * 1000
      })

      // 缓存完整响应
      this._lastEvalResponse = evalRes

      // 第四步：处理评估结果
      const evaluation = evalRes.evaluation || {}
      const score = evaluation.score || 0
      const passed = evaluation.passed || false
      const feedback = evaluation.feedback || ''
      const scoreColor = score >= 80 ? '#83BA12' : score >= 60 ? '#2B5BA0' : '#e74c3c'

      // 前端保底：检查是否满足最少题数
      const newTotalAnswered = (evalRes.totalAnswered || (this.data.totalAnswered + 1))
      const isFinished = evalRes.status === 'finished'
      const shouldForceContine = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH

      if (shouldForceContine) {
        console.log(`[Test] Backend says finished at ${newTotalAnswered} questions, but min is ${MIN_QUESTIONS_BEFORE_FINISH}. Forcing continue.`)
      }

      // 如果后端说finished但不够10题，按钮文字仍然是"下一题"
      const buttonText = (isFinished && !shouldForceContine) ? '查看测评报告' : '下一题'

      this.setData({
        evaluationFeedback: feedback,
        evaluationScore: score,
        evaluationPassed: passed,
        scoreColor,
        totalAnswered: newTotalAnswered,
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
      // 后端说finished但不够10题 → 创建新session继续
      console.log('[Test] Force continue: creating new session to reach minimum questions')
      this.setData({ phase: 'loading', aiStatusText: '继续测评中...' })

      try {
        const data = await startTest()
        const question = data.question
        const subLevel = data.currentSubLevel || (question && question.subLevel) || this.data.currentSubLevel
        const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (SUB_LEVEL_MAJOR[subLevel] || 0)

        const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

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
          nextButtonText: '下一题'
        })

        this._previousSubLevel = subLevel
        this._lastEvalResponse = null
        this._recordFilePath = ''
        this._saveTestSession()

        await delay(500)
        this._autoPlayAudio()
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
    if (!nextQuestion) {
      if (this._isNavigating) return
      this._isNavigating = true
      this.cleanup()
      wx.redirectTo({
        url: `/pages/result/result?sessionId=${this.data.sessionId}`,
        fail: () => { this._isNavigating = false }
      })
      return
    }

    const newSubLevel = evalRes.currentSubLevel || nextQuestion.subLevel || this.data.currentSubLevel
    const newMajorLevel = evalRes.currentMajorLevel !== undefined ? evalRes.currentMajorLevel : (SUB_LEVEL_MAJOR[newSubLevel] || 0)
    const questionIndex = evalRes.questionIndex || 1

    // 检测是否升级到新的小级
    const isLevelUp = newSubLevel !== this._previousSubLevel

    if (isLevelUp) {
      this.setData({
        showLevelUp: true,
        levelUpFrom: this._previousSubLevel,
        levelUpTo: newSubLevel,
        phase: 'levelup'
      })
      await delay(1500)
      this.setData({ showLevelUp: false })
    }

    const progress = Math.min((totalAnswered / 34) * 100, 95)
    const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

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
      nextButtonText: '下一题'
    })

    this._previousSubLevel = newSubLevel
    this._lastEvalResponse = null
    this._recordFilePath = ''

    this._saveTestSession()

    // 自动播放下一题语音
    await delay(500)
    this._autoPlayAudio()
  },

  /** 跳过此题 */
  handleSkip() {
    wx.showModal({
      title: '跳过此题',
      content: '跳过将视为未通过此题，可能影响你的最终定级。确定要跳过吗？',
      success: async (res) => {
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
            const newTotalAnswered = evalRes.totalAnswered || (this.data.totalAnswered + 1)
            const isFinished = evalRes.status === 'finished'
            const shouldForceContinue = isFinished && newTotalAnswered < MIN_QUESTIONS_BEFORE_FINISH
            const buttonText = (isFinished && !shouldForceContinue) ? '查看测评报告' : '下一题'

            this.setData({
              evaluationFeedback: '已跳过此题',
              evaluationScore: evaluation.score || 0,
              evaluationPassed: false,
              scoreColor: '#8a95a5',
              totalAnswered: newTotalAnswered,
              phase: 'feedback',
              aiStatusText: '已跳过',
              nextButtonText: buttonText
            })

          } catch (err) {
            showError(err.message || '操作失败')
            this.setData({ phase: 'answering' })
          }
        }
      }
    })
  },

  /** 退出测评 */
  handleQuit() {
    wx.showModal({
      title: '退出测评',
      content: '退出后可以在首页继续未完成的测评，确定要退出吗？',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          if (this._isNavigating) return
          this._isNavigating = true
          this.cleanup()
          wx.navigateBack({ fail: () => {
            wx.reLaunch({ url: '/pages/home/home' })
          }})
        }
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
      this._autoPlayAudio()
    }, 500)
  },

  handleGuideSkip() {
    this.handleGuideStart()
  }
})
