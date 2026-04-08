/**
 * 途正英语分级测评 - 结果页（v3 智能预判引擎 - 轮询等待模式）
 * 
 * v3核心改动：
 * - 测评结束后，后端异步进行精确评分（调用LLM逐题评分）
 * - 结果页轮询report-status接口，等待评分完成
 * - 评分进行中显示"正在生成报告"加载动画（带进度提示）
 * - 评分完成后自动加载完整报告
 * - 评分失败可重试
 * 
 * 降级兼容：
 * - 如果后端还没实现report-status接口，直接调用report/result接口
 * 
 * 核心流程：
 * 1. 进入页面 → 先查询report-status
 * 2. status=processing → 显示加载动画+进度提示，每3秒轮询
 * 3. status=completed → 加载完整报告
 * 4. status=failed → 显示失败提示+重试按钮
 * 5. report-status接口不存在 → 降级到直接调用report/result
 */
const app = getApp()
const { getTestReport, getTestResult, getQrcodeByLevel, confirmLevel, getUserLevelStatus, getQrcodeDisplaySetting, getReportStatus, retryReport } = require('../../utils/api')
const { showError, formatDuration } = require('../../utils/util')

Page({
  data: {
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    loading: true,

    // 确认状态
    confirmed: false,
    // 预览状态（测评未正式结束，后端返回status:preview）
    isPreview: false,

    // v3轮询状态
    reportGenerating: false,    // 报告正在生成中
    reportFailed: false,        // 报告生成失败
    reportProgress: 0,          // 报告生成进度 0-100
    reportProgressText: '',     // 报告进度描述文字
    reportEstimatedTime: '',    // 预计剩余时间

    // 等级信息
    levelName: '',
    levelLabel: '',
    levelColor: '#3B82F6',
    levelBgGradient: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(34,197,94,0.06))',
    heroBgGradient: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(34,197,94,0.06))',
    levelShadow: 'rgba(59,130,246,0.25)',
    scorePercent: 0,
    starsArray: [true, false, false, false],
    highestSubLevel: '',

    // 得分
    overallScore: 0,
    totalQuestions: 0,
    passedQuestions: 0,
    durationText: '',

    // 报告
    summary: '',
    strengths: [],
    weaknesses: [],
    recommendation: '',

    // 分项得分
    scoreItems: [],

    // 逐题分析
    questionDetails: [],
    showQuestionDetails: false,

    // 海报
    posterSaving: false,

    // 详细报告折叠
    showDetailReport: false,

    // 二维码弹窗
    showQrModal: false,
    qrcodeUrl: '',
    groupName: '',

    // 二维码显示开关（后台控制）
    qrcodeEnabled: true
  },

  _sessionId: '',
  _majorLevel: 0,
  _pollTimer: null,       // 轮询定时器
  _pollCount: 0,          // 轮询次数
  _maxPollCount: 120,     // 最大轮询次数（120次 x 3秒 = 6分钟）
  _isDestroyed: false,    // 页面是否已销毁

  onLoad(options) {
    const navLayout = app.getNavLayout()
    this.setData({
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })

    this._sessionId = options.sessionId || ''
    this._isDestroyed = false
    if (this._sessionId) {
      // 检查二维码显示开关
      this._checkQrcodeSwitch()
      // 检查是否已经确认过
      this._checkConfirmed()
      // v3: 先查询报告状态，决定是轮询还是直接加载
      this._startReportCheck()
    } else {
      showError('缺少测评会话信息')
      this.setData({ loading: false })
    }
  },

  onUnload() {
    this._isDestroyed = true
    this._stopPolling()
  },

  /**
   * v3: 开始报告状态检查
   * 先调用report-status接口，根据返回状态决定后续操作
   * 如果report-status接口不存在（404），降级到直接加载报告
   */
  async _startReportCheck() {
    try {
      const statusData = await getReportStatus(this._sessionId)
      
      if (statusData.status === 'completed') {
        // 评分已完成，直接加载报告
        this.loadResult()
      } else if (statusData.status === 'processing' || statusData.status === 'pending') {
        // 评分进行中或等待开始，进入轮询模式
        this.setData({
          loading: false,
          reportGenerating: true,
          reportProgress: statusData.progress || 0,
          reportProgressText: statusData.progressText || (statusData.status === 'pending' ? '正在准备分析...' : '正在分析你的表现...'),
          reportEstimatedTime: this._formatEstimatedTime(statusData.estimatedRemainingSeconds)
        })
        this._startPolling()
      } else if (statusData.status === 'failed') {
        // 评分失败
        this.setData({
          loading: false,
          reportFailed: true,
          reportProgressText: statusData.error || '报告生成失败'
        })
      } else {
        // 未知状态，降级到直接加载
        this.loadResult()
      }
    } catch (err) {
      // report-status接口不存在或失败，降级到直接加载报告
      if (err.message && (err.message.includes('404') || err.message.includes('Not Found'))) {
        console.warn('[Result] report-status API not available, fallback to direct load')
      } else {
        console.warn('[Result] report-status check failed:', err.message)
      }
      this.loadResult()
    }
  },

  /**
   * v3: 开始轮询
   * 每3秒查询一次report-status，直到completed或failed
   */
  _startPolling() {
    this._pollCount = 0
    this._stopPolling()  // 清除可能存在的旧定时器
    this._pollTimer = setInterval(() => {
      if (this._isDestroyed) {
        this._stopPolling()
        return
      }
      this._pollCount++
      if (this._pollCount >= this._maxPollCount) {
        this._stopPolling()
        this.setData({
          reportGenerating: false,
          reportFailed: true,
          reportProgressText: '报告生成超时，请稍后重试'
        })
        return
      }
      this._pollReportStatus()
    }, 3000)
  },

  /** v3: 停止轮询 */
  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  /** v3: 单次轮询查询 */
  async _pollReportStatus() {
    try {
      const statusData = await getReportStatus(this._sessionId)
      if (this._isDestroyed) return

      if (statusData.status === 'completed') {
        // 评分完成，停止轮询，加载报告
        this._stopPolling()
        this.setData({
          reportGenerating: false,
          reportProgress: 100,
          reportProgressText: '报告已生成！',
          loading: true  // 切换到加载报告状态
        })
        // 稍延迟再加载，让用户看到100%的动画
        setTimeout(() => {
          if (!this._isDestroyed) this.loadResult()
        }, 500)
      } else if (statusData.status === 'failed') {
        // 评分失败
        this._stopPolling()
        this.setData({
          reportGenerating: false,
          reportFailed: true,
          reportProgressText: statusData.error || '报告生成失败'
        })
      } else {
        // 还在处理中，更新进度
        let progressText = statusData.progressText || this.data.reportProgressText
        // 利用后端v3返回的aiScoredCount/totalQuestions生成更精确的进度文案
        if (statusData.aiScoredCount !== undefined && statusData.totalQuestions) {
          progressText = `正在评分第 ${statusData.aiScoredCount}/${statusData.totalQuestions} 题...`
        }
        this.setData({
          reportProgress: statusData.progress || this.data.reportProgress,
          reportProgressText: progressText,
          reportEstimatedTime: this._formatEstimatedTime(statusData.estimatedRemainingSeconds)
        })
      }
    } catch (err) {
      // 单次轮询失败不停止，继续重试
      console.warn('[Result] Poll report status failed:', err.message)
    }
  },

  /** v3: 重试生成报告 */
  async handleRetryReport() {
    this.setData({
      reportFailed: false,
      reportGenerating: true,
      reportProgress: 0,
      reportProgressText: '正在重新生成报告...'
    })
    try {
      await retryReport(this._sessionId)
      // 重新开始轮询
      this._startPolling()
    } catch (err) {
      console.error('[Result] Retry report failed:', err)
      // 重试失败，尝试直接加载报告（可能后端没实现retry接口）
      this.setData({
        reportGenerating: false,
        loading: true
      })
      this.loadResult()
    }
  },

  /** v3: 格式化预计剩余时间 */
  _formatEstimatedTime(seconds) {
    if (!seconds || seconds <= 0) return ''
    if (seconds < 60) return `预计还需${Math.ceil(seconds)}秒`
    return `预计还需${Math.ceil(seconds / 60)}分钟`
  },

  /** 检查用户是否已确认分级（优先查后端，本地存储做兜底） */
  async _checkConfirmed() {
    try {
      const status = await getUserLevelStatus()
      if (status && status.confirmed) {
        this.setData({ confirmed: true })
        // 同步保存到本地缓存
        this._saveConfirmedLocal()
        return
      }
    } catch (e) {
      console.warn('[Result] Check server confirmed status failed:', e)
    }
    // 后端查询失败时，回退到本地存储检查
    try {
      const confirmedSessions = wx.getStorageSync('tz_confirmed_sessions') || {}
      if (confirmedSessions[this._sessionId]) {
        this.setData({ confirmed: true })
      }
    } catch (e) {}
  },

  /** 保存确认状态到本地（做兜底缓存） */
  _saveConfirmedLocal() {
    try {
      const confirmedSessions = wx.getStorageSync('tz_confirmed_sessions') || {}
      confirmedSessions[this._sessionId] = {
        confirmedAt: Date.now(),
        majorLevel: this._majorLevel,
        levelName: this.data.levelName
      }
      wx.setStorageSync('tz_confirmed_sessions', confirmedSessions)
    } catch (e) {
      console.warn('[Result] Save confirmed state locally failed:', e)
    }
  },

  /**
   * 加载测评结果 - 优先使用report接口（含逐题分析），降级到result接口
   */
  async loadResult() {
    let data = null
    let hasDetailQuestions = false

    // 优先调用report接口（v0.1.7新增，含逐题分析）
    try {
      data = await getTestReport(this._sessionId)
      // report接口成功，检查是否包含逐题分析
      if (data && data.questions && data.questions.length > 0) {
        hasDetailQuestions = true
      }
    } catch (reportErr) {
      console.warn('[Result] getTestReport failed, fallback to getTestResult:', reportErr.message)
      // report接口失败，降级到旧的result接口
      try {
        data = await getTestResult(this._sessionId)
      } catch (resultErr) {
        console.error('[Result] Both report and result APIs failed:', resultErr)
        showError(resultErr.message || '获取结果失败')
        this.setData({ loading: false })
        return
      }
    }

    if (!data) {
      showError('获取结果失败')
      this.setData({ loading: false })
      return
    }

    try {
      this._processResultData(data, hasDetailQuestions)
    } catch (err) {
      console.error('[Result] Process data error:', err)
      showError('数据处理异常')
      this.setData({ loading: false })
    }
  },

  /**
   * 处理结果数据（report和result接口共用）
   */
  _processResultData(data, hasDetailQuestions) {
    // 检测后端返回的预览状态（测评未正式结束，数据为实时计算的预览）
    const isPreview = data.status === 'preview'

    // v2字段 - 兼容多种字段名
    this._majorLevel = data.majorLevel !== undefined ? data.majorLevel : (data.major_level !== undefined ? data.major_level : 0)
    const config = app.getLevelConfig(this._majorLevel)

    // 等级名称：优先后端返回的finalLevel/levelName/majorLevelName
    const levelName = data.finalLevel || data.levelName || data.majorLevelName || config.name
    const levelLabel = data.levelLabel || data.majorLevelLabel || config.label || ''

    // 报告数据
    const report = data.report || {}

    // 分项得分
    const scoreItems = []
    if (report.pronunciation !== undefined) {
      scoreItems.push({
        label: '发音准确度',
        value: report.pronunciation,
        percent: report.pronunciation,
        color: '#3B82F6'
      })
    }
    if (report.grammar !== undefined) {
      scoreItems.push({
        label: '语法运用',
        value: report.grammar,
        percent: report.grammar,
        color: '#8B5CF6'
      })
    }
    if (report.vocabulary !== undefined) {
      scoreItems.push({
        label: '词汇量',
        value: report.vocabulary,
        percent: report.vocabulary,
        color: '#22c55e'
      })
    }
    if (report.fluency !== undefined) {
      scoreItems.push({
        label: '口语流利度',
        value: report.fluency,
        percent: report.fluency,
        color: '#F59E0B'
      })
    }

    // 星级
    const totalStars = 5
    const filledStars = config.stars || 1
    const starsArray = Array.from({ length: totalStars }, (_, i) => i < filledStars)

    // 背景渐变
    const bgGradients = {
      0: 'linear-gradient(135deg, rgba(138,149,165,0.06), rgba(200,210,220,0.06))',
      1: 'linear-gradient(135deg, rgba(27,63,145,0.06), rgba(43,91,160,0.04))',
      2: 'linear-gradient(135deg, rgba(131,186,18,0.06), rgba(106,154,16,0.04))',
      3: 'linear-gradient(135deg, rgba(43,91,160,0.06), rgba(27,63,145,0.04))'
    }

    const levelShadows = {
      0: 'rgba(138,149,165,0.25)',
      1: 'rgba(27,63,145,0.25)',
      2: 'rgba(131,186,18,0.25)',
      3: 'rgba(43,91,160,0.25)'
    }

    const scorePercent = Math.min(Math.round(data.overallScore || data.overall_score || 0), 100)

    // 时长（后端返回毫秒或秒，做兼容）
    const totalDuration = data.totalDuration || data.total_duration || 0
    // 如果值大于10000，认为是毫秒；否则认为是秒
    const durationSeconds = totalDuration > 10000 ? Math.round(totalDuration / 1000) : totalDuration
    // 如果后端返回0（全部跳过或数据缺失），显示为短横线而非0''
    const durationText = durationSeconds > 0 ? formatDuration(durationSeconds) : '--'

    // 群二维码（v2直接在result里返回，但不立即显示）
    const groupQrcode = data.groupQrcode || data.group_qrcode || {}

    // 逐题分析数据处理
    const questionDetails = []
    if (hasDetailQuestions && data.questions) {
      data.questions.forEach((q, idx) => {
        // 兼容下划线命名
        const questionText = q.questionText || q.question_text || ''
        const userAnswer = q.userAnswer || q.user_answer || q.recognizedText || q.recognized_text || ''
        const score = q.score !== undefined ? q.score : 0
        const feedback = q.feedback || q.evaluation || ''
        const suggestion = q.suggestion || ''
        const audioUrl = q.audioUrl || q.audio_url || ''
        const userAudioUrl = q.userAudioUrl || q.user_audio_url || ''
        const passed = q.passed !== undefined ? q.passed : (score >= 60)

        questionDetails.push({
          index: idx + 1,
          questionText,
          userAnswer: userAnswer || '（未作答）',
          score,
          feedback,
          suggestion,
          audioUrl,
          userAudioUrl,
          passed,
          scoreColor: passed ? '#22c55e' : '#ef4444',
          passedText: passed ? '通过' : '未通过'
        })
      })
    }

    this.setData({
      loading: false,
      isPreview,
      // 等级
      levelName,
      levelLabel,
      levelColor: config.color,
      levelBgGradient: bgGradients[this._majorLevel] || bgGradients[1],
      heroBgGradient: bgGradients[this._majorLevel] || bgGradients[1],
      levelShadow: levelShadows[this._majorLevel] || levelShadows[1],
      scorePercent,
      starsArray,
      highestSubLevel: data.highestSubLevel || data.highest_sub_level || '',
      // 得分
      overallScore: Math.round(data.overallScore || data.overall_score || 0),
      totalQuestions: data.totalQuestions || data.total_questions || 0,
      passedQuestions: data.passedQuestions || data.passed_questions || 0,
      durationText,
      // 报告
      summary: report.summary || '',
      strengths: report.strengths || [],
      weaknesses: report.weaknesses || [],
      recommendation: report.recommendation || '',
      // 分项得分
      scoreItems,
      // 逐题分析
      questionDetails,
      // 群二维码（预存但不显示，确认后才可见）
      qrcodeUrl: groupQrcode.qrcodeUrl || groupQrcode.qrcode_url || '',
      groupName: groupQrcode.groupName || groupQrcode.group_name || ''
    })
  },

  /** 确认最终评级 */
  handleConfirmLevel() {
    // 预览状态下不允许确认
    if (this.data.isPreview) {
      wx.showToast({ title: '测评尚未完成，无法确认评级', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认最终评级',
      content: `你的评级为"${this.data.levelName}"（${this.data.overallScore}分）。确认后将不可再次测评，是否确认？`,
      confirmText: '确认评级',
      confirmColor: '#3B82F6',
      cancelText: '再想想',
      success: async (res) => {
        if (res.confirm) {
          // 调用后端接口确认分级
          wx.showLoading({ title: '确认中...', mask: true })
          try {
            await confirmLevel(this._sessionId, this._majorLevel, this.data.levelName)
            this.setData({ confirmed: true })
            this._saveConfirmedLocal()

            wx.hideLoading()
            wx.showToast({
              title: '评级已确认！',
              icon: 'success',
              duration: 2000
            })

            // 清除测评缓存（确认后不再允许恢复）
            try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          } catch (err) {
            wx.hideLoading()
            console.error('[Result] Confirm level failed:', err)
            wx.showToast({ title: err.message || '确认失败，请重试', icon: 'none' })
          }
        }
      }
    })
  },

  /** 检查二维码显示开关 */
  async _checkQrcodeSwitch() {
    try {
      const setting = await getQrcodeDisplaySetting()
      this.setData({ qrcodeEnabled: setting.enabled })
    } catch (e) {
      // 默认显示
    }
  },

  /** 加入学习群（仅确认后可用） */
  async handleJoinGroup() {
    if (!this.data.qrcodeEnabled) {
      wx.showToast({ title: '二维码功能暂未开放', icon: 'none' })
      return
    }
    if (!this.data.confirmed) {
      wx.showToast({ title: '请先确认评级', icon: 'none' })
      return
    }

    // 如果v2 result已经返回了二维码，直接显示
    if (this.data.qrcodeUrl) {
      this.setData({ showQrModal: true })
      return
    }

    // 否则单独请求
    this.setData({ showQrModal: true })
    try {
      const data = await getQrcodeByLevel(this._majorLevel)
      if (data) {
        this.setData({
          qrcodeUrl: data.qrcodeUrl || data.qrcode_url || data.imageUrl || '',
          groupName: data.groupName || data.group_name || ''
        })
      }
    } catch (e) {
      console.warn('[QRCode] Fetch failed:', e)
    }
  },

  /** 切换详细报告展开/折叠 */
  toggleDetailReport() {
    this.setData({ showDetailReport: !this.data.showDetailReport })
  },

  /** 切换逐题分析展开/折叠 */
  toggleQuestionDetails() {
    this.setData({ showQuestionDetails: !this.data.showQuestionDetails })
  },

  /** 播放题目录音（逐题分析中） */
  playQuestionAudio(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (this._detailAudioCtx) {
      try { this._detailAudioCtx.stop() } catch (e) {}
      try { this._detailAudioCtx.destroy() } catch (e) {}
    }
    this._detailAudioCtx = wx.createInnerAudioContext()
    this._detailAudioCtx.obeyMuteSwitch = false
    this._detailAudioCtx.src = url
    this._detailAudioCtx.play()
    this._detailAudioCtx.onEnded(() => {
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
    })
    this._detailAudioCtx.onError(() => {
      wx.showToast({ title: '播放失败', icon: 'none' })
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
    })
  },

  /** 关闭二维码弹窗 */
  closeQrModal() {
    this.setData({ showQrModal: false })
  },

  preventClose() {},

  /** 重新测评（仅未确认时可用） */
  handleRetake() {
    if (this.data.confirmed) {
      wx.showToast({ title: '你已确认分级，无法再次测评', icon: 'none' })
      return
    }

    wx.showModal({
      title: '重新测评',
      content: '将开始一次全新的测评，当前结果不会保留。确定要重新测评吗？',
      confirmText: '重新测评',
      confirmColor: '#22c55e',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 清除中断恢复缓存
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          wx.redirectTo({ url: '/pages/test/test?forceNew=1' })
        }
      }
    })
  },

  /** 保存测评海报（仅确认后可用） */
  async savePoster() {
    if (!this.data.confirmed) {
      wx.showToast({ title: '请先确认评级', icon: 'none' })
      return
    }

    if (this.data.posterSaving) return
    this.setData({ posterSaving: true })

    try {
      // 获取canvas节点
      const query = this.createSelectorQuery()
      const canvas = await new Promise((resolve) => {
        query.select('#posterCanvas')
          .fields({ node: true, size: true })
          .exec((res) => resolve(res[0]))
      })

      if (!canvas || !canvas.node) {
        throw new Error('无法初始化画布')
      }

      const canvasNode = canvas.node
      const ctx = canvasNode.getContext('2d')

      // 设置画布尺寸（高分辨率）
      const dpr = wx.getWindowInfo().pixelRatio || 2
      const W = 750
      const H = 1400
      canvasNode.width = W * dpr
      canvasNode.height = H * dpr
      ctx.scale(dpr, dpr)

      // ===== 绘制背景 =====
      const bgGrad = ctx.createLinearGradient(0, 0, W, H)
      bgGrad.addColorStop(0, '#f0f4f8')
      bgGrad.addColorStop(1, '#e8edf2')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // 顶部装饰条（按级别色彩）
      const levelColors = {
        0: ['#22c55e', '#16a34a'],  // 绿色
        1: ['#3B82F6', '#2563EB'],  // 蓝色
        2: ['#8B5CF6', '#7C3AED'],  // 紫色
        3: ['#F59E0B', '#D97706']   // 金色
      }
      const [gradStart, gradEnd] = levelColors[this._majorLevel] || levelColors[1]
      const topGrad = ctx.createLinearGradient(0, 0, W, 0)
      topGrad.addColorStop(0, gradStart)
      topGrad.addColorStop(1, gradEnd)
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, W, 8)

      // ===== 标题区 =====
      ctx.fillStyle = '#1a2340'
      ctx.font = 'bold 42px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('途正英语智能分级测评', W / 2, 80)

      ctx.fillStyle = '#7a8a9a'
      ctx.font = '26px sans-serif'
      ctx.fillText('最终测评报告', W / 2, 120)

      // ===== 等级卡片 =====
      const cardX = 50, cardY = 160, cardW = W - 100, cardH = 520
      ctx.fillStyle = '#ffffff'
      this._roundRect(ctx, cardX, cardY, cardW, cardH, 24)
      ctx.fill()
      ctx.shadowColor = 'rgba(59,130,246,0.08)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 8
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // 等级徽章（宽度自适应）
      const levelColor = this.data.levelColor || '#3B82F6'
      const levelText = this.data.levelName || '未定级'
      ctx.font = 'bold 34px sans-serif'
      const textMetrics = ctx.measureText(levelText)
      const badgeW = Math.max(200, textMetrics.width + 60)  // 最小200，文字宽+左右padding
      const badgeH = 64
      const badgeX = (W - badgeW) / 2, badgeY = cardY + 40
      // 徽章渐变背景（按级别色彩）
      const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY)
      badgeGrad.addColorStop(0, gradStart)
      badgeGrad.addColorStop(1, gradEnd)
      ctx.fillStyle = badgeGrad
      this._roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 32)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 34px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(levelText, W / 2, badgeY + 44)

      // 等级描述（已移除levelLabel，只保留途正口语X级）

      // 分数圆环（使用级别色彩）
      const ringCX = W / 2, ringCY = badgeY + 240, ringR = 80
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = levelColor + '15'  // 使用级别色+透明度作为背景环
      ctx.lineWidth = 14
      ctx.stroke()
      const percent = this.data.scorePercent || 0
      const endAngle = -Math.PI / 2 + (percent / 100) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, -Math.PI / 2, endAngle)
      // 圆环渐变色
      const ringGrad = ctx.createLinearGradient(ringCX - ringR, ringCY, ringCX + ringR, ringCY)
      ringGrad.addColorStop(0, gradStart)
      ringGrad.addColorStop(1, gradEnd)
      ctx.strokeStyle = ringGrad
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.fillStyle = '#1a2332'
      ctx.font = 'bold 56px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(this.data.overallScore), ringCX, ringCY + 18)
      ctx.fillStyle = '#7a8a9a'
      ctx.font = '22px sans-serif'
      ctx.fillText('分', ringCX, ringCY + 46)

      // 统计数据（增大与圆环的间距，固定在卡片底部）
      const statsY = cardY + cardH - 90
      const stats = [
        { label: '答题数', value: String(this.data.totalQuestions || 0) },
        { label: '通过数', value: String(this.data.passedQuestions || 0) },
        { label: '用时', value: this.data.durationText || '-' }
      ]
      const statW = cardW / 3
      stats.forEach((s, i) => {
        const sx = cardX + statW * i + statW / 2
        ctx.fillStyle = '#1a2332'
        ctx.font = 'bold 32px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(s.value, sx, statsY)
        ctx.fillStyle = '#7a8a9a'
        ctx.font = '22px sans-serif'
        ctx.fillText(s.label, sx, statsY + 32)
      })
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      for (let i = 1; i < 3; i++) {
        const lx = cardX + statW * i
        ctx.beginPath()
        ctx.moveTo(lx, statsY - 24)
        ctx.lineTo(lx, statsY + 40)
        ctx.stroke()
      }

      // ===== 分项得分 =====
      const scoreY = cardY + cardH + 40
      ctx.fillStyle = '#1a2332'
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('分项得分', cardX, scoreY)

      const items = this.data.scoreItems || []
      items.forEach((item, i) => {
        const iy = scoreY + 50 + i * 70
        ctx.fillStyle = '#5a6577'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(item.label, cardX, iy)
        ctx.fillStyle = item.color || '#3B82F6'
        ctx.font = 'bold 24px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(String(item.value), cardX + cardW, iy)
        const barY = iy + 12, barH = 10, barW = cardW
        ctx.fillStyle = levelColor + '10'  // 使用级别色作为背景条
        this._roundRect(ctx, cardX, barY, barW, barH, 5)
        ctx.fill()
        ctx.fillStyle = item.color || '#3B82F6'
        this._roundRect(ctx, cardX, barY, barW * (item.percent / 100), barH, 5)
        ctx.fill()
      })

      // ===== 能力评估 =====
      const summaryY = scoreY + 50 + items.length * 70 + 40
      ctx.fillStyle = '#1a2332'
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('能力评估', cardX, summaryY)

      ctx.fillStyle = '#5a6577'
      ctx.font = '24px sans-serif'
      const summaryLines = this._wrapText(ctx, this.data.summary || '', cardW, 24)
      summaryLines.forEach((line, i) => {
        ctx.fillText(line, cardX, summaryY + 40 + i * 36)
      })

      // ===== 底部品牌 =====
      // 动态计算底部位置：确保在能力评估文字下方有足够间距，不重叠
      const summaryEndY = summaryY + 40 + summaryLines.length * 36
      const footerY = Math.max(summaryEndY + 80, H - 50)
      // 底部分割线
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cardX, footerY - 30)
      ctx.lineTo(cardX + cardW, footerY - 30)
      ctx.stroke()
      // 品牌文字
      ctx.fillStyle = '#b0b8c4'
      ctx.font = '22px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('途正英语 · 智能分级测评', W / 2, footerY)

      // ===== 保存到相册 =====
      const tempFilePath = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas: canvasNode,
          x: 0,
          y: 0,
          width: W * dpr,
          height: H * dpr,
          destWidth: W * 2,
          destHeight: H * 2,
          fileType: 'png',
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        })
      })

      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: resolve,
          fail: (err) => {
            if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启相册权限，才能保存海报',
                confirmText: '去设置',
                success: (res) => {
                  if (res.confirm) wx.openSetting()
                }
              })
            }
            reject(err)
          }
        })
      })

      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (err) {
      console.error('[Poster] Save error:', err)
      if (err.errMsg && err.errMsg.indexOf('auth deny') === -1) {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    } finally {
      this.setData({ posterSaving: false })
    }
  },

  /** 绘制圆角矩形路径 */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  },

  /** 文本自动换行 */
  _wrapText(ctx, text, maxWidth, fontSize) {
    const lines = []
    let line = ''
    for (let i = 0; i < text.length; i++) {
      const testLine = line + text[i]
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line.length > 0) {
        lines.push(line)
        line = text[i]
      } else {
        line = testLine
      }
    }
    if (line) lines.push(line)
    return lines.slice(0, 5)
  },

  /** 回首页 */
  goHome() {
    wx.reLaunch({ url: '/pages/home/home' })
  },

  /** 分享给好友 */
  onShareAppMessage() {
    const { levelName, overallScore, confirmed } = this.data
    const title = confirmed
      ? `我在途正英语分级测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`
      : `我正在途正英语分级测评中测试，快来一起测测吧！`
    return {
      title,
      path: '/pages/home/home',
      imageUrl: app.globalData.shareCoverUrl
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    const { levelName, overallScore } = this.data
    return {
      title: `途正英语分级测评 - ${levelName}（${overallScore}分）`,
      imageUrl: app.globalData.shareCoverUrl,
      query: ''
    }
  }
})
