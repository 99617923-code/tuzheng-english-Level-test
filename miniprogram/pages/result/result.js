/**
 * 途正英语分级测评 - 结果页（自适应引擎 v2）
 * 
 * 核心流程：
 * 1. 显示测评结果（等级、得分、报告）
 * 2. 用户可以"重新测评"（不满意当前结果）
 * 3. 用户点击"确认最终评级"后锁定结果
 * 4. 确认后不可更改
 * 
 * 数据来源：
 * - 主数据：GET /api/v1/test/report/:sessionId（详细报告，含逐题分析）
 * - 降级：GET /api/v1/test/result/:sessionId（旧接口，无逐题分析）
 */
const app = getApp()
const { getTestReport, getTestResult, confirmLevel, getUserLevelStatus } = require('../../utils/api')
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

    // 录音播放状态
    playingAudioUrl: '',

    // 海报
    posterSaving: false,



    // 报告Tab切换
    activeReportTab: 'summary',  // 当前激活的报告Tab: 'intro' | 'questions' | 'summary'，默认综合报告

    // 个人介绍测评报告
    selfIntroReport: null,       // 个人介绍测评数据对象
    // 高亮详情气泡
    activeHighlight: null         // 当前点击的高亮词详情 { text, type, suggestion, reason }
  },

  _sessionId: '',
  _majorLevel: 0,

  onLoad(options) {
    const navLayout = app.getNavLayout()
    this.setData({
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })

    this._sessionId = options.sessionId || ''
    if (this._sessionId) {
      // 检查是否已经确认过
      this._checkConfirmed()
      this.loadResult()
    } else {
      showError('缺少测评会话信息')
      this.setData({ loading: false })
    }
  },

  /** 检查用户是否已确认分级（优先查后端，本地存储做兜底） */
  async _checkConfirmed() {
    try {
      const status = await getUserLevelStatus()
      if (status && status.confirmed) {
        // 检查当前会话是否是最终定级的会话
        const confirmedSessionId = status.sessionId || status.session_id || ''
        const isThisSessionConfirmed = confirmedSessionId && confirmedSessionId === this._sessionId
        console.log('[Result] Confirmed check:', { confirmedSessionId, currentSessionId: this._sessionId, isThisSessionConfirmed })
        
        // 所有已定级用户的记录都显示confirmed状态（不可再测）
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

    // 等级名称：统一使用"途正口语X级"格式，不管后端返回什么
    const levelName = `途正口语${this._majorLevel}级`
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

    // 时长处理：后端可能返回毫秒、秒、或已格式化的字符串
    const rawDuration = data.totalDuration || data.total_duration || data.duration || 0
    console.log('[Result] 后端返回的原始时长数据:', JSON.stringify({ totalDuration: data.totalDuration, total_duration: data.total_duration, duration: data.duration, rawDuration }))
    
    let durationText = '--'
    if (typeof rawDuration === 'string' && rawDuration.includes(':')) {
      // 后端返回已格式化的字符串，如 "7:37" 或 "07:37"
      durationText = rawDuration
    } else {
      const totalDuration = Number(rawDuration) || 0
      // 如果值大于10000，认为是毫秒；否则认为是秒
      const durationSeconds = totalDuration > 10000 ? Math.round(totalDuration / 1000) : totalDuration
      durationText = durationSeconds > 0 ? formatDuration(durationSeconds) : '--'
      console.log('[Result] 时长计算:', { totalDuration, durationSeconds, durationText })
    }

    // 逐题分析数据处理（兼容report接口的questions和result接口的answerDetails）
    const questionDetails = []
    const rawDetailSource = (hasDetailQuestions && data.questions) ? data.questions : (data.answerDetails || data.answer_details || [])
    // 防御性过滤：过滤掉被重新提交替换的旧记录（后端标记为[REPLACED_BY_RESUBMIT]）
    const detailSource = rawDetailSource.filter(q => {
      const answer = q.userAnswer || q.user_answer || q.recognizedText || q.recognized_text || ''
      return !answer.includes('[REPLACED_BY_RESUBMIT]') && !answer.includes('REPLACED_BY_RESUBMIT')
    })
    if (detailSource.length > 0) {
      detailSource.forEach((q, idx) => {
        // 兼容下划线命名
        const questionText = q.questionText || q.question_text || ''
        const userAnswer = q.userAnswer || q.user_answer || q.recognizedText || q.recognized_text || ''
        const score = q.score !== undefined ? q.score : 0
        const feedback = q.feedback || q.evaluation || ''
        const suggestion = q.suggestion || ''
        const audioUrl = q.audioUrl || q.audio_url || ''
        const userAudioUrl = q.userAudioUrl || q.user_audio_url || ''
        const passed = q.passed !== undefined ? q.passed : (score >= 60)
        const subLevel = q.subLevel || q.sub_level || ''
        const subLevelName = q.subLevelName || q.sub_level_name || ''
        const questionIndex = q.questionIndex || q.question_index || (idx + 1)

        // 四维度评分（scoreDetail）
        const sd = q.scoreDetail || q.score_detail || {}
        const scoreDetail = {
          relevance: sd.relevance !== undefined ? sd.relevance : null,
          pronunciation: sd.pronunciation !== undefined ? sd.pronunciation : null,
          grammar: sd.grammar !== undefined ? sd.grammar : null,
          vocabulary: sd.vocabulary !== undefined ? sd.vocabulary : null,
          fluency: sd.fluency !== undefined ? sd.fluency : null
        }
        // 是否有四维度评分数据
        const hasScoreDetail = Object.values(scoreDetail).some(v => v !== null)

        questionDetails.push({
          index: questionIndex,
          questionText,
          userAnswer: userAnswer || '（未作答）',
          score,
          feedback,
          suggestion,
          audioUrl,
          userAudioUrl,
          passed,
          scoreColor: passed ? '#22c55e' : '#ef4444',
          passedText: passed ? '通过' : '未通过',
          subLevel,
          subLevelName,
          scoreDetail,
          hasScoreDetail,
          expanded: true  // 默认展开，直接显示AI解析和评分
        })
      })
    }

    // 提取个人介绍测评报告数据（后端在report接口中返回）
    let selfIntroReport = null
    const si = data.selfIntro || data.self_intro || null
    if (si) {
      // 兼容下划线命名
      const audioUrl = si.audioUrl || si.audio_url || ''
      const transcription = si.transcription || si.recognized_text || si.recognizedText || ''
      const wordCount = si.wordCount || si.word_count || 0
      const duration = si.duration || 0
      // 级别范围：转换为"X以上"格式
      const rawLevelRange = si.levelRange || si.level_range || ''
      let levelRange = ''
      if (rawLevelRange) {
        const parts = rawLevelRange.split(/\s*[-~]\s*/)
        levelRange = parts[0] ? `${parts[0]} 以上` : rawLevelRange
      }
      // 级别描述：强制使用"途正口语X级"格式，不使用后端的年级描述
      const SUB_LEVEL_MAJOR_MAP = {
        'PRE1': 0, 'PRE2': 0, 'PRE': 0,
        'G1': 0, 'G2': 0, 'G3': 0, 'G4': 0,
        'G5': 1, 'G6': 1, 'G7': 1, 'G8': 1, 'G9': 1,
        'G10': 2, 'G11': 2, 'G12': 2,
        'IELTS4': 3, 'IELTS5': 3, 'IELTS6': 3, 'IELTS7': 3, 'IELTS8': 3, 'IELTS9': 3
      }
      const estLevel = si.estimatedLevel || si.estimated_level || {}
      let lowerBound = estLevel.lowerBoundName || estLevel.lowerBound || estLevel.lower_bound_name || ''
      let upperBound = estLevel.upperBoundName || estLevel.upperBound || estLevel.upper_bound_name || ''
      // 优先从levelRange字符串提取子级别名（因为estimatedLevel对象可能缺失字段）
      if (rawLevelRange) {
        const rangeParts = rawLevelRange.split(/\s*[-~]\s*/)
        if (rangeParts[0] && SUB_LEVEL_MAJOR_MAP[rangeParts[0]] !== undefined) {
          lowerBound = rangeParts[0]
        }
        if (rangeParts[1] && SUB_LEVEL_MAJOR_MAP[rangeParts[1]] !== undefined) {
          upperBound = rangeParts[1]
        }
      }
      const lMajor = SUB_LEVEL_MAJOR_MAP[lowerBound] !== undefined ? SUB_LEVEL_MAJOR_MAP[lowerBound] : -1
      const uMajor = SUB_LEVEL_MAJOR_MAP[upperBound] !== undefined ? SUB_LEVEL_MAJOR_MAP[upperBound] : lMajor
      let levelRangeNames = ''
      if (lMajor >= 0) {
        if (lMajor !== uMajor && uMajor >= 0) {
          levelRangeNames = `途正口语${lMajor}-${uMajor}级`
        } else {
          levelRangeNames = `途正口语${lMajor}级`
        }
      }
      const overallComment = si.overallComment || si.overall_comment || ''
      const rawRadar = si.abilityRadar || si.ability_radar || []
      
      // 处理五维度数据
      const dimensions = rawRadar.map(dim => {
        const name = dim.dimensionName || dim.dimension_name || dim.name || ''
        const score = dim.score !== undefined ? dim.score : 0
        const comment = dim.comment || dim.feedback || ''
        // 维度颜色映射
        const colorMap = {
          '语法复杂度': '#3B82F6',
          '词汇丰富度': '#8B5CF6',
          '表达连贯性': '#22c55e',
          '流利度': '#F59E0B',
          '内容深度': '#EC4899'
        }
        return {
          name,
          score,
          comment,
          color: colorMap[name] || '#3B82F6'
        }
      })

      // 解析highlights高亮标注
      const rawHighlights = si.highlights || []
      let textSegments = []
      if (rawHighlights.length > 0 && transcription) {
        // 按在原文中出现的位置排序
        const sortedHL = rawHighlights
          .map(h => {
            const text = h.text || ''
            const idx = transcription.indexOf(text)
            return { ...h, _idx: idx }
          })
          .filter(h => h._idx >= 0)
          .sort((a, b) => a._idx - b._idx)

        let cursor = 0
        sortedHL.forEach((h, i) => {
          const start = transcription.indexOf(h.text, cursor)
          if (start < 0) return
          // 前面的普通文本
          if (start > cursor) {
            textSegments.push({ id: 'n' + i, text: transcription.slice(cursor, start), type: 'normal' })
          }
          // 高亮片段
          textSegments.push({
            id: 'h' + i,
            text: h.text,
            type: h.type || 'highlight', // 'error' | 'highlight'
            suggestion: h.suggestion || '',
            reason: h.reason || ''
          })
          cursor = start + h.text.length
        })
        // 尾部剩余普通文本
        if (cursor < transcription.length) {
          textSegments.push({ id: 'tail', text: transcription.slice(cursor), type: 'normal' })
        }
      }
      const hasHighlights = textSegments.length > 0
      // 统计错误和亮点数量
      const errorCount = textSegments.filter(s => s.type === 'error').length
      const highlightCount = textSegments.filter(s => s.type === 'highlight').length

      selfIntroReport = {
        audioUrl,
        transcription,
        wordCount,
        duration,
        durationText: duration > 0 ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '',
        levelRange,
        levelRangeNames,
        overallComment,
        dimensions,
        hasDimensions: dimensions.length > 0,
        textSegments,
        hasHighlights,
        errorCount,
        highlightCount
      }
    }

    this.setData({
      loading: false,
      isPreview,
      selfIntroReport,
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

  /** 点击高亮词查看详情 */
  onHighlightTap(e) {
    const { seg } = e.currentTarget.dataset
    if (!seg || seg.type === 'normal') return
    // 如果点击同一个，切换关闭
    if (this.data.activeHighlight && this.data.activeHighlight.id === seg.id) {
      this.setData({ activeHighlight: null })
      return
    }
    this.setData({
      activeHighlight: {
        id: seg.id,
        text: seg.text,
        type: seg.type,
        suggestion: seg.suggestion || '',
        reason: seg.reason || ''
      }
    })
  },

  /** 关闭高亮详情气泡 */
  closeHighlightBubble() {
    this.setData({ activeHighlight: null })
  },



  /** 切换报告Tab */
  switchReportTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab && tab !== this.data.activeReportTab) {
      this.setData({ activeReportTab: tab, activeHighlight: null })
    }
  },

  /** 播放个人介绍录音 */
  playSelfIntroAudio() {
    const url = this.data.selfIntroReport && this.data.selfIntroReport.audioUrl
    if (!url) {
      wx.showToast({ title: '暂无录音', icon: 'none' })
      return
    }
    // 复用已有的音频播放逻辑
    if (this._detailAudioCtx) {
      try { this._detailAudioCtx.stop() } catch (e) {}
      try { this._detailAudioCtx.destroy() } catch (e) {}
      if (this._playingAudioUrl === url) {
        this._detailAudioCtx = null
        this._playingAudioUrl = ''
        this.setData({ playingAudioUrl: '' })
        return
      }
    }
    this._playingAudioUrl = url
    this.setData({ playingAudioUrl: url })
    this._detailAudioCtx = wx.createInnerAudioContext()
    this._detailAudioCtx.obeyMuteSwitch = false
    this._detailAudioCtx.src = url
    this._detailAudioCtx.play()
    this._detailAudioCtx.onEnded(() => {
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
      this._playingAudioUrl = ''
      this.setData({ playingAudioUrl: '' })
    })
    this._detailAudioCtx.onError(() => {
      wx.showToast({ title: '播放失败', icon: 'none' })
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
      this._playingAudioUrl = ''
      this.setData({ playingAudioUrl: '' })
    })
  },



  /** 切换单题展开/折叠（显示详细评分和AI解析） */
  toggleQuestionExpand(e) {
    const idx = e.currentTarget.dataset.idx
    const key = `questionDetails[${idx}].expanded`
    this.setData({ [key]: !this.data.questionDetails[idx].expanded })
  },

  /** 播放用户录音回放 */
  playUserAudio(e) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      wx.showToast({ title: '暂无录音', icon: 'none' })
      return
    }
    // 停止当前播放
    if (this._detailAudioCtx) {
      try { this._detailAudioCtx.stop() } catch (e) {}
      try { this._detailAudioCtx.destroy() } catch (e) {}
      // 如果点击的是同一个正在播放的，停止即可
      if (this._playingAudioUrl === url) {
        this._detailAudioCtx = null
        this._playingAudioUrl = ''
        this.setData({ playingAudioUrl: '' })
        return
      }
    }
    this._playingAudioUrl = url
    this.setData({ playingAudioUrl: url })
    this._detailAudioCtx = wx.createInnerAudioContext()
    this._detailAudioCtx.obeyMuteSwitch = false
    this._detailAudioCtx.src = url
    this._detailAudioCtx.play()
    this._detailAudioCtx.onEnded(() => {
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
      this._playingAudioUrl = ''
      this.setData({ playingAudioUrl: '' })
    })
    this._detailAudioCtx.onError(() => {
      wx.showToast({ title: '播放失败', icon: 'none' })
      try { this._detailAudioCtx.destroy() } catch (e) {}
      this._detailAudioCtx = null
      this._playingAudioUrl = ''
      this.setData({ playingAudioUrl: '' })
    })
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



  /** 重新测评（仅未确认时可用） */
  handleRetake() {
    if (this.data.confirmed) {
      wx.showToast({ title: '\u4f60\u5df2\u786e\u8ba4\u5206\u7ea7\uff0c\u65e0\u6cd5\u518d\u6b21\u6d4b\u8bc4', icon: 'none' })
      return
    }

    wx.showModal({
      title: '\u91cd\u65b0\u6d4b\u8bc4',
      content: '\u5c06\u5f00\u59cb\u4e00\u6b21\u5168\u65b0\u7684\u6d4b\u8bc4\uff0c\u5f53\u524d\u7ed3\u679c\u4e0d\u4f1a\u4fdd\u7559\u3002\u786e\u5b9a\u8981\u91cd\u65b0\u6d4b\u8bc4\u5417\uff1f',
      confirmText: '\u91cd\u65b0\u6d4b\u8bc4',
      confirmColor: '#22c55e',
      cancelText: '\u53d6\u6d88',
      success: (res) => {
        if (res.confirm) {
          // \u6e05\u9664\u4e2d\u65ad\u6062\u590d\u7f13\u5b58
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          // \u8df3\u56de\u9996\u9875\u5e76\u81ea\u52a8\u5f39\u51fa\u6a21\u5f0f\u9009\u62e9\u5f39\u7a97
          wx.redirectTo({ url: '/pages/home/home?autoStartTest=1' })
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

      // 顶部装饰条
      const topGrad = ctx.createLinearGradient(0, 0, W, 0)
      topGrad.addColorStop(0, '#3B82F6')
      topGrad.addColorStop(1, '#2563EB')
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

      // 等级徽章
      const badgeW = 200, badgeH = 64
      const badgeX = (W - badgeW) / 2, badgeY = cardY + 40
      const levelColor = this.data.levelColor || '#3B82F6'
      ctx.fillStyle = levelColor
      this._roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 32)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 34px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(this.data.levelName || '未定级', W / 2, badgeY + 44)

      // 等级描述
      ctx.fillStyle = '#5a6577'
      ctx.font = '26px sans-serif'
      ctx.fillText(this.data.levelLabel || '', W / 2, badgeY + 100)

      // 分数圆环
      const ringCX = W / 2, ringCY = badgeY + 240, ringR = 80
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(59,130,246,0.08)'
      ctx.lineWidth = 14
      ctx.stroke()
      const percent = this.data.scorePercent || 0
      const endAngle = -Math.PI / 2 + (percent / 100) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, -Math.PI / 2, endAngle)
      ctx.strokeStyle = levelColor
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

      // 统计数据（增大与圆环的间距）
      const statsY = cardY + cardH - 80
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
        ctx.fillStyle = 'rgba(59,130,246,0.06)'
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
      // 动态计算底部位置：确保在能力评估文字下方有足够间距
      const summaryEndY = summaryY + 40 + summaryLines.length * 36
      const footerY = Math.max(summaryEndY + 60, H - 60)
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
