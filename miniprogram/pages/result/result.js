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
    heroBgGradient: 'linear-gradient(135deg, rgba(27,63,145,0.06), rgba(131,186,18,0.06))',
    levelShadow: 'rgba(27,63,145,0.25)',
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

    // 海报
    posterSaving: false,

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

      const scorePercent = Math.min(Math.round(data.overallScore || 0), 100)

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
        heroBgGradient: bgGradients[this._majorLevel] || bgGradients[1],
        levelShadow: levelShadows[this._majorLevel] || levelShadows[1],
        scorePercent,
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
          wx.redirectTo({ url: '/pages/test/test' })
        }
      }
    })
  },

  /** 保存测评海报 */
  async savePoster() {
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
      const H = 1200
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
      topGrad.addColorStop(0, '#1B3F91')
      topGrad.addColorStop(1, '#2B5BA0')
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, W, 8)

      // ===== 标题区 =====
      ctx.fillStyle = '#1B3F91'
      ctx.font = 'bold 42px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('途正英语AI分级测评', W / 2, 80)

      ctx.fillStyle = '#8a95a5'
      ctx.font = '26px sans-serif'
      ctx.fillText('测评报告', W / 2, 120)

      // ===== 等级卡片 =====
      const cardX = 50, cardY = 160, cardW = W - 100, cardH = 440
      // 卡片背景
      ctx.fillStyle = '#ffffff'
      this._roundRect(ctx, cardX, cardY, cardW, cardH, 24)
      ctx.fill()
      // 卡片阴影
      ctx.shadowColor = 'rgba(27,63,145,0.08)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 8
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // 等级徽章
      const badgeW = 200, badgeH = 64
      const badgeX = (W - badgeW) / 2, badgeY = cardY + 40
      const levelColor = this.data.levelColor || '#1B3F91'
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
      const ringCX = W / 2, ringCY = badgeY + 220, ringR = 80
      // 背景圆
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(27,63,145,0.08)'
      ctx.lineWidth = 14
      ctx.stroke()
      // 进度圆
      const percent = this.data.scorePercent || 0
      const endAngle = -Math.PI / 2 + (percent / 100) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(ringCX, ringCY, ringR, -Math.PI / 2, endAngle)
      ctx.strokeStyle = levelColor
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.stroke()
      // 分数文字
      ctx.fillStyle = '#1a2332'
      ctx.font = 'bold 56px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(this.data.overallScore || 0), ringCX, ringCY + 16)
      ctx.fillStyle = '#8a95a5'
      ctx.font = '22px sans-serif'
      ctx.fillText('分', ringCX, ringCY + 46)

      // 统计数据
      const statsY = cardY + cardH - 70
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
        ctx.fillStyle = '#8a95a5'
        ctx.font = '22px sans-serif'
        ctx.fillText(s.label, sx, statsY + 32)
      })
      // 分割线
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
        // 标签
        ctx.fillStyle = '#5a6577'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(item.label, cardX, iy)
        // 分数
        ctx.fillStyle = item.color || '#1B3F91'
        ctx.font = 'bold 24px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(String(item.value), cardX + cardW, iy)
        // 进度条背景
        const barY = iy + 12, barH = 10, barW = cardW
        ctx.fillStyle = 'rgba(27,63,145,0.06)'
        this._roundRect(ctx, cardX, barY, barW, barH, 5)
        ctx.fill()
        // 进度条填充
        ctx.fillStyle = item.color || '#1B3F91'
        this._roundRect(ctx, cardX, barY, barW * (item.percent / 100), barH, 5)
        ctx.fill()
      })

      // ===== 能力评估 =====
      const summaryY = scoreY + 50 + items.length * 70 + 40
      ctx.fillStyle = '#1a2332'
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('能力评估', cardX, summaryY)

      // 自动换行绘制摘要
      ctx.fillStyle = '#5a6577'
      ctx.font = '24px sans-serif'
      const summaryLines = this._wrapText(ctx, this.data.summary || '', cardW, 24)
      summaryLines.forEach((line, i) => {
        ctx.fillText(line, cardX, summaryY + 40 + i * 36)
      })

      // ===== 底部品牌 =====
      const footerY = H - 60
      ctx.fillStyle = '#b0b8c4'
      ctx.font = '22px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('途正英语 · AI智能分级测评', W / 2, footerY)

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
    return lines.slice(0, 5) // 最多5行
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
