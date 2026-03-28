/**
 * 途正英语AI分级测评 - 测评主页面（自适应引擎 v2）
 * 
 * 核心流程：
 * 1. startTest → 后端返回第一题（从PRE1开始）
 * 2. 播放外教真人语音 → 用户录音回答
 * 3. evaluate → 后端AI评分 + 自适应升级判断
 * 4. status=continue → 播放下一题（可能升级到更高小级）
 * 5. status=finished → 跳转结果页
 * 
 * 升级逻辑（后端控制）：
 * - 每个小级随机抽2道题
 * - 2道全通过 → 升级到下一个小级
 * - 1通过1不通过 → 定为当前小级所属大级
 * - 0通过 → 定为前一个大级（最低0级）
 * 
 * 小级路径：PRE1→PRE2→G1→G2→...→G12→IELTS4→...
 */
const app = getApp()
const { startTest, evaluateAnswer, uploadAudio, terminateTest } = require('../../utils/api')
const { formatTime, showToast, showError, delay } = require('../../utils/util')

// 同声传译插件
const plugin = requirePlugin('WechatSI')

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

Page({
  data: {
    aiAvatarUrl: '',
    // 导航布局
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,

    // 测评状态
    phase: 'loading', // loading | listening | answering | evaluating | feedback | levelup
    sessionId: '',

    // 当前题目（v2格式）
    currentQuestion: null,     // { questionId, audioUrl, questionText, subLevel }
    currentSubLevel: 'PRE1',   // 当前小级
    currentMajorLevel: 0,      // 当前大级
    questionIndex: 1,          // 本小级第几题（1或2）
    totalAnswered: 0,          // 已答题总数

    // 显示信息
    subLevelDisplay: 'PRE1',   // 当前小级显示
    majorLevelDisplay: '零级 · 预备', // 当前大级显示
    questionCountDisplay: '第 1 题', // 题目序号显示

    // 计时
    timerDisplay: '00:00',
    totalSeconds: 0,

    // 进度（基于已答题数，最大约34题=17小级x2）
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
  _lastEvalResponse: null,  // 缓存最近一次evaluate的完整响应
  _previousSubLevel: '',    // 上一题的小级（用于检测升级）
  _isNavigating: false,     // 防止重复跳转
  _isSubmitting: false,     // 防止重复提交
  _initRetryCount: 0,       // 初始化重试次数

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
    try {
      plugin.voiceRecognizer.stop()
    } catch (e) {}
  },

  // ============ 测评中断恢复 ============

  /** 保存测评状态到本地存储（每次答题后调用） */
  _saveTestSession() {
    try {
      const { sessionId, currentSubLevel, currentMajorLevel, questionIndex,
              totalAnswered, totalSeconds, currentQuestion } = this.data
      if (!sessionId) return

      const sessionData = {
        sessionId,
        currentSubLevel,
        currentMajorLevel,
        questionIndex,
        totalAnswered,
        totalSeconds,
        currentQuestion,
        savedAt: Date.now()
      }
      wx.setStorageSync('tz_test_session', sessionData)
      console.log('[Test] Session saved:', sessionId, 'answered:', totalAnswered)
    } catch (e) {
      console.warn('[Test] Save session failed:', e)
    }
  },

  /** 清除缓存的测评状态 */
  _clearTestSession() {
    try {
      wx.removeStorageSync('tz_test_session')
      console.log('[Test] Session cache cleared')
    } catch (e) {}
  },

  /** 检查是否有未完成的测评可恢复 */
  _getSavedSession() {
    try {
      const saved = wx.getStorageSync('tz_test_session')
      if (!saved || !saved.sessionId) return null

      // 检查是否过期（30分钟内有效）
      const elapsed = Date.now() - (saved.savedAt || 0)
      if (elapsed > 30 * 60 * 1000) {
        console.log('[Test] Saved session expired, clearing')
        this._clearTestSession()
        return null
      }

      return saved
    } catch (e) {
      return null
    }
  },

  /** 恢复中断的测评 */
  async _resumeTest() {
    this.setData({ phase: 'loading', aiStatusText: '正在恢复测评...' })

    const saved = this._getSavedSession()
    if (!saved) {
      console.log('[Test] No saved session found, starting new test')
      this.initTest()
      return
    }

    console.log('[Test] Resuming session:', saved.sessionId)

    try {
      // 尝试用保存的sessionId调用start接口
      // 后端如果支持会返回当前进度，如果不支持则创建新的
      const data = await startTest()

      // 后端返回了新的session，使用新数据
      const question = data.question
      const subLevel = data.currentSubLevel || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (SUB_LEVEL_MAJOR[subLevel] || 0)

      // 检查后端是否返回了同一个session（支持恢复）
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

      // 播放语音
      if (question && question.audioUrl) {
        await delay(800)
        this.playAudio()
      } else {
        this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
      }

    } catch (err) {
      console.error('[Test] Resume failed:', err)
      // 恢复失败，提示用户重新开始
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

      // v2接口返回格式
      const question = data.question
      const subLevel = data.currentSubLevel || (question && question.subLevel) || 'PRE1'
      const majorLevel = data.currentMajorLevel !== undefined ? data.currentMajorLevel : (SUB_LEVEL_MAJOR[subLevel] || 0)

      this.setData({
        sessionId: data.sessionId,
        currentQuestion: question,
        currentSubLevel: subLevel,
        currentMajorLevel: majorLevel,
        questionIndex: data.questionIndex || 1,
        totalAnswered: data.totalAnswered || 0,
        subLevelDisplay: subLevel,
        majorLevelDisplay: MAJOR_LEVEL_NAMES[majorLevel] || '零级 · 预备',
        questionCountDisplay: `第 ${(data.totalAnswered || 0) + 1} 题`,
        progressPercent: 0,
        phase: 'listening',
        aiStatusText: '请听题目'
      })

      this._previousSubLevel = subLevel
      this.startTimer()

      // 保存测评状态（用于中断恢复）
      this._saveTestSession()

      // 播放外教真人语音
      if (question && question.audioUrl) {
        await delay(500)
        this.playAudio()
      } else {
        // 没有音频直接进入回答
        this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
      }
    } catch (err) {
      console.error('[Test] Init error:', err)

      // 如果是登录过期，不重试
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

      // 自动重试（最多2次）
      this._initRetryCount = (this._initRetryCount || 0) + 1
      if (this._initRetryCount <= 2) {
        console.log(`[Test] Retrying init (${this._initRetryCount}/2)...`)
        showToast(`正在重试...(${this._initRetryCount}/2)`)
        await delay(2000)
        this.initTest()
        return
      }

      // 重试耗尽，提示用户
      wx.showModal({
        title: '创建测评失败',
        content: err.message || '服务器响应异常，请稍后再试',
        confirmText: '重试',
        cancelText: '返回',
        success: (modalRes) => {
          if (modalRes.confirm) {
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

  /** 开始总计时 */
  startTimer() {
    this._timer = setInterval(() => {
      const totalSeconds = this.data.totalSeconds + 1
      this.setData({
        totalSeconds,
        timerDisplay: formatTime(totalSeconds)
      })
    }, 1000)
  },

  // ============ 音频播放 ============

  _setupAudioEvents() {
    this._audioContext.onPlay(() => {
      this.setData({ audioPlaying: true, aiSpeaking: true, aiStatusText: '外教正在提问...' })
    })

    this._audioContext.onEnded(() => {
      this.setData({
        audioPlaying: false,
        aiSpeaking: false,
        aiStatusText: '请用英语回答',
        phase: 'answering'
      })
    })

    this._audioContext.onError((err) => {
      console.error('[Audio] Play error:', err)
      this.setData({
        audioPlaying: false,
        aiSpeaking: false,
        aiStatusText: '请用英语回答',
        phase: 'answering'
      })
    })

    this._audioContext.onStop(() => {
      this.setData({ audioPlaying: false, aiSpeaking: false })
    })
  },

  /** 播放外教真人语音 */
  playAudio() {
    const { currentQuestion, audioPlaying } = this.data

    if (audioPlaying) {
      this._audioContext.stop()
      return
    }

    if (!currentQuestion || !currentQuestion.audioUrl) {
      this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
      return
    }

    this._audioContext.src = currentQuestion.audioUrl
    this._audioContext.play()
  },

  // ============ 录音 ============

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

      this.startVoiceRecognition()
    })

    this._recorderManager.onStop((res) => {
      console.log('[Recorder] Stopped, path:', res.tempFilePath)
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
      this._recordFilePath = res.tempFilePath
      this.setData({ isRecording: false })

      try {
        plugin.voiceRecognizer.stop()
      } catch (e) {}

      if (this._recordFilePath) {
        this.submitAnswer()
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

  /** 开始录音 */
  startRecording() {
    if (this.data.isRecording || this.data.phase !== 'answering') return

    // 先检查录音权限
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === false) {
          // 权限被拒绝，引导用户去设置
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

        // 权限OK或未询问过，尝试开始录音
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
      fail: () => {
        // getSetting失败，仍尝试录音
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
      }
    })
  },

  /** 停止录音 */
  stopRecording() {
    if (!this.data.isRecording) return
    this._recorderManager.stop()
  },

  /** 取消录音 */
  cancelRecording() {
    if (!this.data.isRecording) return
    this._recorderManager.stop()
    this._recordFilePath = ''
    this.setData({ isRecording: false, realtimeText: '' })
    try {
      plugin.voiceRecognizer.stop()
    } catch (e) {}
  },

  /** 启动同声传译语音识别 */
  startVoiceRecognition() {
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

    manager.start({
      lang: 'en_US',
      isAutoDetect: false,
      duration: 60000
    })
  },

  // ============ 提交评估（v2 自适应引擎） ============

  /**
   * 提交回答 - v2流程：
   * 1. 上传录音到OSS
   * 2. 调用evaluate接口（传audioUrl + recognizedText + duration）
   * 3. 后端AI评分 + 自适应升级判断
   * 4. 根据status决定继续或结束
   */
  async submitAnswer() {
    const { sessionId, currentQuestion, userTranscription, recordSeconds } = this.data

    if (!this._recordFilePath) {
      this.setData({ phase: 'answering' })
      return
    }

    // 防止重复提交
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
        console.warn('[Upload] Failed, continuing with text only:', e)
      }

      // 第二步：调用v2 evaluate接口
      const evalRes = await evaluateAnswer({
        sessionId,
        questionId: currentQuestion.questionId,
        audioUrl: audioUrl || undefined,
        recognizedText: userTranscription || '',
        duration: recordSeconds * 1000  // 后端接收毫秒
      })

      // 缓存完整响应
      this._lastEvalResponse = evalRes

      // 第三步：处理评估结果
      const evaluation = evalRes.evaluation || {}
      const score = evaluation.score || 0
      const passed = evaluation.passed || false
      const feedback = evaluation.feedback || ''
      const scoreColor = score >= 80 ? '#83BA12' : score >= 60 ? '#2B5BA0' : '#e74c3c'

      this.setData({
        evaluationFeedback: feedback,
        evaluationScore: score,
        evaluationPassed: passed,
        scoreColor,
        phase: 'feedback',
        aiStatusText: passed ? '回答正确！' : '继续加油！',
        nextButtonText: evalRes.status === 'finished' ? '查看测评报告' : '下一题'
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

    if (status === 'finished') {
      // 测评结束 → 清除缓存 + 跳转结果页（防重复跳转）
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

    // status === 'continue' → 加载下一题
    const nextQuestion = evalRes.question
    if (!nextQuestion) {
      // 安全兗底：没有下一题也跳结果页
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
    const totalAnswered = evalRes.totalAnswered || (this.data.totalAnswered + 1)
    const questionIndex = evalRes.questionIndex || 1

    // 检测是否升级到新的小级
    const isLevelUp = newSubLevel !== this._previousSubLevel

    if (isLevelUp) {
      // 显示升级动画
      this.setData({
        showLevelUp: true,
        levelUpFrom: this._previousSubLevel,
        levelUpTo: newSubLevel,
        phase: 'levelup'
      })

      // 升级动画显示1.5秒
      await delay(1500)
      this.setData({ showLevelUp: false })
    }

    // 更新进度（估算最大34题）
    const progress = Math.min((totalAnswered / 34) * 100, 95)
    const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      currentQuestion: nextQuestion,
      currentSubLevel: newSubLevel,
      currentMajorLevel: newMajorLevel,
      questionIndex: questionIndex,
      totalAnswered: totalAnswered,
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

    // 保存测评状态（用于中断恢复）
    this._saveTestSession()

    // 播放下一题的外教真人语音
    if (nextQuestion.audioUrl) {
      await delay(500)
      this.playAudio()
    } else {
      this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
    }
  },

  /** 跳过此题（提交空答案，让后端判断） */
  handleSkip() {
    wx.showModal({
      title: '跳过此题',
      content: '跳过将视为未通过此题，可能影响你的最终定级。确定要跳过吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({
            phase: 'evaluating',
            aiStatusText: '正在处理...',
            userTranscription: '(跳过)'
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

            this.setData({
              evaluationFeedback: '已跳过此题',
              evaluationScore: evaluation.score || 0,
              evaluationPassed: false,
              scoreColor: '#8a95a5',
              phase: 'feedback',
              aiStatusText: '已跳过',
              nextButtonText: evalRes.status === 'finished' ? '查看测评报告' : '下一题'
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
          // 不清除缓存，保留中断恢复能力（用户主动退出不调terminate）
          this.cleanup()
          wx.navigateBack({ fail: () => {
            wx.reLaunch({ url: '/pages/home/home' })
          }})
        }
      }
    })
  },

  /** 获取按钮文字 */
  getNextButtonText() {
    if (!this._lastEvalResponse) return '下一题'
    return this._lastEvalResponse.status === 'finished' ? '查看测评报告' : '下一题'
  }
})
