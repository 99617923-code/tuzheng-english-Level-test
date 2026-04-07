/**
 * 途正英语AI分级测评 - 结果页（自适应引擎 v2）
 * 
 * 核心流程：
 * 1. 显示测评结果（等级、得分、报告）
 * 2. 用户可以"重新测评"（不满意当前结果）
 * 3. 用户点击"确认最终评级"后锁定结果，显示班级群二维码
 * 4. 确认后不可更改
 * 
 * 数据来源：GET /api/v1/test/result/:sessionId
 */
const app = getApp()
const { getTestResult, getQrcodeByLevel, confirmLevel, getUserLevelStatus, getQrcodeDisplaySetting } = require('../../utils/api')
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

  onLoad(options) {
    const navLayout = app.getNavLayout()
    this.setData({
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })

    this._sessionId = options.sessionId || ''
    if (this._sessionId) {
      // 检查二维码显示开关
      this._checkQrcodeSwitch()
      // 检查是否已经确认过
      this._checkConfirmed()
      this.loadResult()
    } else {
      showError('缺少测评会话信息')
      this.setData({ loading: false })
    }
  },

  /** 检查用户是否已确认分级（优先查后端，本地存储做兆底） */
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

  /** 保存确认状态到本地（做兆底缓存） */
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

  /** 加载测评结果 - 对接v2 API */
  async loadResult() {
    try {
      const data = await getTestResult(this._sessionId)

      // 检测后端返回的预览状态（测评未正式结束，数据为实时计算的预览）
      const isPreview = data.status === 'preview'

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

      const scorePercent = Math.min(Math.round(data.overallScore || 0), 100)

      // 时长（后端返回毫秒）
      const totalDuration = data.totalDuration || 0
      const durationSeconds = Math.round(totalDuration / 1000)
      // 如果后端返回0（全部跳过或数据缺失），显示为短横线而非0''
      const durationText = durationSeconds > 0 ? formatDuration(durationSeconds) : '--'

      // 群二维码（v2直接在result里返回，但不立即显示）
      const groupQrcode = data.groupQrcode || {}

      this.setData({
        loading: false,
        isPreview,
        // 等级
        levelName: data.majorLevelName || config.name,
        levelLabel: data.majorLevelLabel || config.label || '',
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
        summary: report.summary || '',
        strengths: report.strengths || [],
        weaknesses: report.weaknesses || [],
        recommendation: report.recommendation || '',
        // 分项得分
        scoreItems,
        // 群二维码（预存但不显示，确认后才可见）
        qrcodeUrl: groupQrcode.qrcodeUrl || '',
        groupName: groupQrcode.groupName || ''
      })

    } catch (err) {
      console.error('[Result] Load error:', err)
      showError(err.message || '获取结果失败')
      this.setData({ loading: false })
    }
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
      content: `你的评级为“${this.data.levelName}”（${this.data.overallScore}分）。确认后将不可再次测评，是否确认？`,
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
          // 传递forceNew=1，告知测评页强制创建新会话
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
      ctx.fillText('途正英语AI分级测评', W / 2, 80)

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
      ? `我在途正英语AI分级测评中获得了${levelName}（${overallScore}分），快来测测你的英语水平！`
      : `我正在途正英语AI分级测评中测试，快来一起测测吧！`
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
      title: `途正英语AI分级测评 - ${levelName}（${overallScore}分）`,
      imageUrl: app.globalData.shareCoverUrl,
      query: ''
    }
  }
})
