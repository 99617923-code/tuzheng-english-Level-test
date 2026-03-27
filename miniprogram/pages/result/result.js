/**
 * 途正英语AI分级测评 - 结果页
 * 对接真实后端API：getTestResult + getQrcodeByLevel
 * 小程序原生适配：全局导航布局
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
    qrcodeUrl: '',
    groupName: ''
  },

  _sessionId: '',
  _finalLevel: 0,

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

  /** 加载测评结果 - 对接真实后端API */
  async loadResult() {
    try {
      const data = await getTestResult(this._sessionId)

      // 兼容后端不同字段命名（camelCase / snake_case）
      this._finalLevel = data.finalLevel !== undefined ? data.finalLevel
        : data.final_level !== undefined ? data.final_level
        : data.level !== undefined ? data.level : 0

      const config = app.getLevelConfig(this._finalLevel)

      // 兼容后端不同的分数字段结构
      const scores = data.scores || data.score_detail || {}

      const totalStars = 5
      const filledStars = config.stars || 1
      const starsArray = Array.from({ length: totalStars }, (_, i) => i < filledStars)

      // 构建分项得分列表
      const scoreItems = [
        {
          label: '听力理解',
          value: scores.comprehension || scores.listening || 0,
          percent: scores.comprehension || scores.listening || 0,
          color: '#1B3F91'
        },
        {
          label: '语法运用',
          value: scores.grammar || 0,
          percent: scores.grammar || 0,
          color: '#2B5BA0'
        },
        {
          label: '词汇量',
          value: scores.vocabulary || 0,
          percent: scores.vocabulary || 0,
          color: '#83BA12'
        },
        {
          label: '口语流利度',
          value: scores.fluency || 0,
          percent: scores.fluency || 0,
          color: '#4a8a30'
        }
      ]

      if (scores.pronunciation) {
        scoreItems.push({
          label: '发音准确度',
          value: scores.pronunciation,
          percent: scores.pronunciation,
          color: '#6a9a10'
        })
      }

      const bgGradients = {
        0: 'linear-gradient(135deg, rgba(138,149,165,0.08), rgba(200,210,220,0.08))',
        1: 'linear-gradient(135deg, rgba(27,63,145,0.08), rgba(43,91,160,0.06))',
        2: 'linear-gradient(135deg, rgba(131,186,18,0.08), rgba(106,154,16,0.06))',
        3: 'linear-gradient(135deg, rgba(43,91,160,0.08), rgba(27,63,145,0.06))'
      }

      // 兼容后端不同的时长字段
      const totalDuration = data.totalDuration || data.total_duration || data.duration || 0
      const durationText = formatDuration(Math.round(totalDuration))

      // 兼容后端不同的题目数字段
      const questionCount = data.questionCount || data.question_count || data.total_questions || 0

      // 兼容后端不同的综合分字段
      const overallScore = scores.overall || scores.overall_score || scores.total || 0

      this.setData({
        loading: false,
        levelName: config.name,
        levelLabel: config.label || data.levelLabel || data.level_label || '',
        levelColor: config.color,
        levelBgGradient: bgGradients[this._finalLevel] || bgGradients[1],
        starsArray,
        overallScore,
        questionCount,
        durationText,
        description: config.description || data.description || '',
        recommendation: data.recommendation || config.recommendation || '',
        scoreItems
      })

    } catch (err) {
      console.error('[Result] Load error:', err)
      showError(err.message || '获取结果失败')
      this.setData({ loading: false })
    }
  },

  /** 加入学习群 - 对接真实后端群二维码接口 */
  async handleJoinGroup() {
    this.setData({ showQrModal: true, qrcodeUrl: '', groupName: '' })
    try {
      const data = await getQrcodeByLevel(this._finalLevel)
      if (data) {
        // 兼容后端不同字段命名
        const qrcodeUrl = data.qrcodeUrl || data.qrcode_url || data.imageUrl || data.image_url || ''
        const groupName = data.groupName || data.group_name || ''

        this.setData({
          qrcodeUrl,
          groupName
        })
      }
    } catch (e) {
      console.warn('[QRCode] Fetch failed:', e)
      // 获取失败不阻断，弹窗显示"二维码即将上线"占位
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

  /** 分享给好友 */
  onShareAppMessage() {
    const { levelName, overallScore } = this.data
    return {
      title: `我在途正英语AI测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`,
      path: '/pages/home/home'
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    const { levelName, overallScore } = this.data
    return {
      title: `我在途正英语AI测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`,
      query: `sessionId=${this._sessionId}`
    }
  }
})
