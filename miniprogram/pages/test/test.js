/**
 * 途正英语AI分级测评 - 测评主页面
 * 核心交互：听AI语音 → 按住说话 → AI评分 → 下一题/出结果
 * 使用微信同声传译插件进行实时语音识别
 */
const app = getApp()
const { startTest, evaluateAnswer, uploadAudio, terminateTest } = require('../../utils/api')
const { formatTime, showToast, showError, delay } = require('../../utils/util')

// 同声传译插件
const plugin = requirePlugin('WechatSI')

Page({
  data: {
    aiAvatarUrl: '',
    statusBarHeight: 20,
    navHeight: 88,

    // 测评状态
    phase: 'loading', // loading | listening | answering | evaluating | feedback
    sessionId: '',
    currentQuestion: {},
    currentQuestionIndex: 0,
    currentLevelName: '',
    totalQuestions: 10,
    isLastQuestion: false,

    // 计时
    timerDisplay: '00:00',
    totalSeconds: 0,

    // 进度
    progressPercent: 0,

    // 音频播放
    audioPlaying: false,
    audioDurationText: '',
    audioWaves: [],
    aiSpeaking: false,
    aiStatusText: '准备中...',

    // 录音
    isRecording: false,
    recordTimeDisplay: '0"',
    recordSeconds: 0,
    realtimeText: '',
    userTranscription: '',

    // 评价
    evaluationFeedback: '',
    evaluationScore: 0,
    scoreColor: '#1B3F91'
  },

  // 内部状态
  _timer: null,
  _recordTimer: null,
  _audioContext: null,
  _recorderManager: null,
  _recordFilePath: '',
  _sessionManager: null,

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const navHeight = statusBarHeight + 44

    // 生成音频波形数据
    const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      statusBarHeight,
      navHeight,
      audioWaves
    })

    this._recorderManager = wx.getRecorderManager()
    this._audioContext = wx.createInnerAudioContext()
    this._setupAudioEvents()
    this._setupRecorderEvents()

    this.initTest()
  },

  onUnload() {
    this.cleanup()
  },

  /** 清理资源 */
  cleanup() {
    if (this._timer) clearInterval(this._timer)
    if (this._recordTimer) clearInterval(this._recordTimer)
    if (this._audioContext) {
      this._audioContext.stop()
      this._audioContext.destroy()
    }
    if (this._recorderManager) {
      this._recorderManager.stop()
    }
    // 停止语音识别
    try {
      plugin.voiceRecognizer.stop()
    } catch (e) {}
  },

  /** 初始化测评 */
  async initTest() {
    this.setData({ phase: 'loading', aiStatusText: '正在准备测评...' })

    try {
      const data = await startTest()
      this.setData({
        sessionId: data.sessionId,
        currentQuestion: data.firstQuestion,
        totalQuestions: data.totalQuestions || 10,
        currentQuestionIndex: 0,
        currentLevelName: this.getLevelName(data.firstQuestion.level),
        phase: 'listening',
        aiStatusText: '请听题目',
        progressPercent: 0
      })

      // 开始计时
      this.startTimer()

      // 自动播放音频
      if (data.firstQuestion.audioUrl) {
        await delay(500)
        this.playAudio()
      }
    } catch (err) {
      showError(err.message || '创建测评失败')
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  /** 获取等级名称 */
  getLevelName(level) {
    const config = app.getLevelConfig(level)
    return config ? config.name : `第${level}级`
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
      this.setData({ audioPlaying: true, aiSpeaking: true, aiStatusText: '正在说话...' })
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

  /** 播放AI语音 */
  playAudio() {
    const { currentQuestion, audioPlaying } = this.data

    if (audioPlaying) {
      this._audioContext.stop()
      return
    }

    if (!currentQuestion.audioUrl) {
      // 无音频，直接进入回答阶段
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

      // 录音计时
      this._recordTimer = setInterval(() => {
        const secs = this.data.recordSeconds + 1
        this.setData({
          recordSeconds: secs,
          recordTimeDisplay: `${secs}"`
        })
        // 最长60秒
        if (secs >= 60) {
          this.stopRecording()
        }
      }, 1000)

      // 启动同声传译语音识别
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

      // 停止语音识别
      try {
        plugin.voiceRecognizer.stop()
      } catch (e) {}

      // 提交评估
      this.submitAnswer()
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

    this.setData({ realtimeText: '', userTranscription: '', evaluationFeedback: '' })

    this._recorderManager.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3',
      frameSize: 50
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
    // 标记为取消
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

  // ============ 提交评估 ============

  async submitAnswer() {
    const { sessionId, currentQuestion, userTranscription, recordSeconds } = this.data

    // 如果取消了录音
    if (!this._recordFilePath) {
      this.setData({ phase: 'answering' })
      return
    }

    this.setData({
      phase: 'evaluating',
      aiStatusText: 'AI正在评估...'
    })

    try {
      // 1. 上传录音
      let audioUrl = ''
      try {
        const uploadRes = await uploadAudio(
          this._recordFilePath,
          sessionId,
          currentQuestion.questionId
        )
        audioUrl = uploadRes.audioUrl
      } catch (e) {
        console.warn('[Upload] Failed, continuing with transcription only:', e)
      }

      // 2. 提交评估
      const evalRes = await evaluateAnswer({
        sessionId,
        questionId: currentQuestion.questionId,
        transcription: userTranscription || '',
        audioUrl: audioUrl || undefined,
        answerDuration: recordSeconds
      })

      // 3. 显示评价
      const { evaluation, nextQuestion, nextAction, result } = evalRes
      const score = evaluation ? evaluation.score : 0
      const scoreColor = score >= 80 ? '#83BA12' : score >= 60 ? '#2B5BA0' : '#e74c3c'

      this.setData({
        evaluationFeedback: evaluation ? evaluation.feedback : '',
        evaluationScore: score,
        scoreColor,
        phase: 'feedback',
        aiStatusText: '评估完成',
        isLastQuestion: nextAction === 'complete' || !nextQuestion
      })

      // 保存下一题数据
      if (nextQuestion) {
        this._nextQuestion = nextQuestion
      }
      if (result) {
        this._testResult = result
      }

    } catch (err) {
      console.error('[Evaluate] Error:', err)
      showError(err.message || '评估失败')
      this.setData({ phase: 'answering', aiStatusText: '请重新回答' })
    }
  },

  // ============ 下一题 / 查看结果 ============

  async handleNext() {
    const { isLastQuestion, sessionId } = this.data

    if (isLastQuestion) {
      // 跳转结果页
      const resultSessionId = this._testResult ? this._testResult.sessionId : sessionId
      wx.redirectTo({
        url: `/pages/result/result?sessionId=${resultSessionId}`
      })
      return
    }

    // 加载下一题
    if (this._nextQuestion) {
      const nextIndex = this.data.currentQuestionIndex + 1
      const progress = Math.min(((nextIndex) / this.data.totalQuestions) * 100, 100)

      // 生成新的波形数据
      const audioWaves = Array.from({ length: 30 }, () => Math.floor(Math.random() * 32) + 8)

      this.setData({
        currentQuestion: this._nextQuestion,
        currentQuestionIndex: nextIndex,
        currentLevelName: this.getLevelName(this._nextQuestion.level),
        progressPercent: progress,
        phase: 'listening',
        aiStatusText: '请听题目',
        userTranscription: '',
        evaluationFeedback: '',
        evaluationScore: 0,
        realtimeText: '',
        audioWaves
      })

      this._nextQuestion = null
      this._recordFilePath = ''

      // 自动播放音频
      if (this.data.currentQuestion.audioUrl) {
        await delay(500)
        this.playAudio()
      } else {
        this.setData({ phase: 'answering', aiStatusText: '请用英语回答' })
      }
    }
  },

  /** 跳过此题 */
  handleSkip() {
    wx.showModal({
      title: '跳过此题',
      content: '跳过后将直接进入下一题，确定要跳过吗？',
      success: async (res) => {
        if (res.confirm) {
          // 提交空回答
          this.setData({
            phase: 'evaluating',
            aiStatusText: 'AI正在评估...',
            userTranscription: '(跳过)'
          })

          try {
            const evalRes = await evaluateAnswer({
              sessionId: this.data.sessionId,
              questionId: this.data.currentQuestion.questionId,
              transcription: '',
              answerDuration: 0
            })

            const { nextQuestion, nextAction, result } = evalRes

            this.setData({
              evaluationFeedback: '已跳过此题',
              evaluationScore: 0,
              scoreColor: '#8a95a5',
              phase: 'feedback',
              aiStatusText: '已跳过',
              isLastQuestion: nextAction === 'complete' || !nextQuestion
            })

            if (nextQuestion) this._nextQuestion = nextQuestion
            if (result) this._testResult = result

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
      content: '退出后本次测评进度将不会保存，确定要退出吗？',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          this.cleanup()
          try {
            await terminateTest(this.data.sessionId, 'user_quit')
          } catch (e) {}
          wx.navigateBack()
        }
      }
    })
  }
})
