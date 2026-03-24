/**
 * 途正英语AI分级测评 - 结果页
 */
const app = getApp()
const { getTestResult, getQrcodeByLevel } = require('../../utils/api')
const { showError, formatDuration } = require('../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 88,
    loading: true,

    // 等级信息
    levelName: '',
    levelLabel: '',
    levelColor: '#1B3F91',
    levelBgGradient: 'linear-gradient(135deg, rgba(27,63,145,0.06), rgba(131,186,18,0.06))',
    starsArray: [true, false, false, false],

    // 得分
    overallScore: 0,
    questionCount: 0,
    durationText: '',
    description: '',
    recommendation: '',

    // 分项得分
    scoreItems: [],

    // 二维码弹窗
    showQrModal: false,
    qrcodeUrl: ''
  },

  _sessionId: '',
  _finalLevel: 0,

  onLoad(options) {
    const systemInfo = wx.getWindowInfo()
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const navHeight = statusBarHeight + 44

    this.setData({ statusBarHeight, navHeight })

    this._sessionId = options.sessionId || ''
    if (this._sessionId) {
      this.loadResult()
    } else {
      showError('缺少测评会话信息')
      this.setData({ loading: false })
    }
  },

  /** 加载测评结果 */
  async loadResult() {
    try {
      const data = await getTestResult(this._sessionId)
      this._finalLevel = data.finalLevel || 0

      const config = app.getLevelConfig(this._finalLevel)
      const scores = data.scores || {}

      // 构建星级数组（最多5颗星）
      const totalStars = 5
      const filledStars = config.stars || 1
      const starsArray = Array.from({ length: totalStars }, (_, i) => i < filledStars)

      // 分项得分
      const scoreItems = [
        { label: '听力理解', value: scores.comprehension || 0, percent: scores.comprehension || 0, color: '#1B3F91' },
        { label: '语法运用', value: scores.grammar || 0, percent: scores.grammar || 0, color: '#2B5BA0' },
        { label: '词汇量', value: scores.vocabulary || 0, percent: scores.vocabulary || 0, color: '#83BA12' },
        { label: '口语流利度', value: scores.fluency || 0, percent: scores.fluency || 0, color: '#4a8a30' }
      ]

      if (scores.pronunciation) {
        scoreItems.push({ label: '发音准确度', value: scores.pronunciation, percent: scores.pronunciation, color: '#6a9a10' })
      }

      // 等级背景渐变
      const bgGradients = {
        0: 'linear-gradient(135deg, rgba(138,149,165,0.08), rgba(200,210,220,0.08))',
        1: 'linear-gradient(135deg, rgba(27,63,145,0.08), rgba(43,91,160,0.06))',
        2: 'linear-gradient(135deg, rgba(131,186,18,0.08), rgba(106,154,16,0.06))',
        3: 'linear-gradient(135deg, rgba(43,91,160,0.08), rgba(27,63,145,0.06))'
      }

      // 计算用时
      const totalDuration = data.totalDuration || 0
      const durationText = formatDuration(Math.round(totalDuration))

      this.setData({
        loading: false,
        levelName: config.name,
        levelLabel: config.label || data.levelLabel || '',
        levelColor: config.color,
        levelBgGradient: bgGradients[this._finalLevel] || bgGradients[1],
        starsArray,
        overallScore: scores.overall || 0,
        questionCount: data.questionCount || 0,
        durationText,
        description: config.description || '',
        recommendation: data.recommendation || config.recommendation || '',
        scoreItems
      })

    } catch (err) {
      console.error('[Result] Load error:', err)
      showError(err.message || '获取结果失败')
      this.setData({ loading: false })
    }
  },

  /** 加入学习群 */
  async handleJoinGroup() {
    this.setData({ showQrModal: true })

    // 尝试获取群二维码
    try {
      const data = await getQrcodeByLevel(this._finalLevel)
      if (data && data.qrcodeUrl) {
        this.setData({ qrcodeUrl: data.qrcodeUrl })
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
    wx.redirectTo({ url: '/pages/rules/rules' })
  },

  /** 回首页 */
  goHome() {
    wx.reLaunch({ url: '/pages/home/home' })
  },

  /** 分享 */
  onShareAppMessage() {
    const { levelName, overallScore } = this.data
    return {
      title: `我在途正英语AI测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`,
      path: '/pages/home/home'
    }
  }
})
