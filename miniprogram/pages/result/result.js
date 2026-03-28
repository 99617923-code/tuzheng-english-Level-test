/**
 * 途正英语AI分级测评 - 结果页（自适应引擎 v2）
 * 
 * 数据来源：GET /api/v1/test/result/:sessionId
 * 
 * v2 结果格式：
 * {
 *   majorLevel: 0-3,
 *   majorLevelName: "一级",
 *   highestSubLevel: "G3",
 *   overallScore: 68.5,
 *   totalQuestions: 8,
 *   passedQuestions: 5,
 *   totalDuration: 120000,  // 毫秒
 *   report: {
 *     pronunciation: 72, grammar: 65, vocabulary: 68, fluency: 66,
 *     summary: "...", strengths: [...], weaknesses: [...], recommendation: "..."
 *   },
 *   groupQrcode: { groupName: "...", qrcodeUrl: "..." }
 * }
 */
const app = getApp()
const { getTestResult, getQrcodeByLevel } = require('../../utils/api')
const { showError, formatDuration } = require('../../utils/util')

Page({
  data: {
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    loading: true,

    // 等级信息
    levelName: '',
    levelLabel: '',
    levelColor: '#1B3F91',
    levelBgGradient: 'linear-gradient(135deg, rgba(27,63,145,0.06), rgba(131,186,18,0.06))',
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

    // 二维码弹窗
    showQrModal: false,
    qrcodeUrl: '',
    groupName: ''
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
      this.loadResult()
    } else {
      showError('缺少测评会话信息')
      this.setData({ loading: false })
    }
  },

  /** 加载测评结果 - 对接v2 API */
  async loadResult() {
    try {
      const data = await getTestResult(this._sessionId)

      // v2字段
      this._majorLevel = data.majorLevel !== undefined ? data.majorLevel : 0
      const config = app.getLevelConfig(this._majorLevel)

      // 报告数据
      const report = data.report || {}

      // 分项得分
      const scoreItems = []
      if (report.pronunciation !== undefined) {
        scoreItems.push({
          label: '发音准确度',
          value: report.pronunciation,
          percent: report.pronunciation,
          color: '#1B3F91'
        })
      }
      if (report.grammar !== undefined) {
        scoreItems.push({
          label: '语法运用',
          value: report.grammar,
          percent: report.grammar,
          color: '#2B5BA0'
        })
      }
      if (report.vocabulary !== undefined) {
        scoreItems.push({
          label: '词汇量',
          value: report.vocabulary,
          percent: report.vocabulary,
          color: '#83BA12'
        })
      }
      if (report.fluency !== undefined) {
        scoreItems.push({
          label: '口语流利度',
          value: report.fluency,
          percent: report.fluency,
          color: '#4a8a30'
        })
      }

      // 星级
      const totalStars = 5
      const filledStars = config.stars || 1
      const starsArray = Array.from({ length: totalStars }, (_, i) => i < filledStars)

      // 背景渐变
      const bgGradients = {
        0: 'linear-gradient(135deg, rgba(138,149,165,0.08), rgba(200,210,220,0.08))',
        1: 'linear-gradient(135deg, rgba(27,63,145,0.08), rgba(43,91,160,0.06))',
        2: 'linear-gradient(135deg, rgba(131,186,18,0.08), rgba(106,154,16,0.06))',
        3: 'linear-gradient(135deg, rgba(43,91,160,0.08), rgba(27,63,145,0.06))'
      }

      // 时长（后端返回毫秒）
      const totalDuration = data.totalDuration || 0
      const durationText = formatDuration(Math.round(totalDuration / 1000))

      // 群二维码（v2直接在result里返回）
      const groupQrcode = data.groupQrcode || {}

      this.setData({
        loading: false,
        // 等级
        levelName: data.majorLevelName || config.name,
        levelLabel: config.label || '',
        levelColor: config.color,
        levelBgGradient: bgGradients[this._majorLevel] || bgGradients[1],
        starsArray,
        highestSubLevel: data.highestSubLevel || '',
        // 得分
        overallScore: Math.round(data.overallScore || 0),
        totalQuestions: data.totalQuestions || 0,
        passedQuestions: data.passedQuestions || 0,
        durationText,
        // 报告
        summary: report.summary || config.description || '',
        strengths: report.strengths || [],
        weaknesses: report.weaknesses || [],
        recommendation: report.recommendation || config.recommendation || '',
        // 分项得分
        scoreItems,
        // 群二维码（预填充）
        qrcodeUrl: groupQrcode.qrcodeUrl || '',
        groupName: groupQrcode.groupName || ''
      })

    } catch (err) {
      console.error('[Result] Load error:', err)
      showError(err.message || '获取结果失败')
      this.setData({ loading: false })
    }
  },

  /** 加入学习群 */
  async handleJoinGroup() {
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

  /** 关闭二维码弹窗 */
  closeQrModal() {
    this.setData({ showQrModal: false })
  },

  preventClose() {},

  /** 重新测评 */
  handleRetake() {
    wx.showModal({
      title: '重新测评',
      content: '将开始一次全新的测评，确定要继续吗？',
      confirmText: '开始',
      confirmColor: '#83BA12',
      success: (res) => {
        if (res.confirm) {
          // 清除中断恢复缓存
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          wx.redirectTo({ url: '/pages/rules/rules' })
        }
      }
    })
  },

  /** 回首页 */
  goHome() {
    wx.reLaunch({ url: '/pages/home/home' })
  },

  /** 分享给好友 */
  onShareAppMessage() {
    const { levelName, overallScore } = this.data
    return {
      title: `我在途正英语AI分级测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`,
      path: '/pages/home/home',
      imageUrl: app.globalData.shareCoverUrl
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    const { levelName, overallScore } = this.data
    return {
      title: `途正英语AI分级测评 - ${levelName}（${overallScore}分）`,
      imageUrl: app.globalData.shareCoverUrl,
      query: ''
    }
  }
})
