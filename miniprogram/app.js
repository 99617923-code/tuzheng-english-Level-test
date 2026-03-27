/**
 * 途正英语AI分级测评 - 小程序入口
 * 全局适配：状态栏 + 胶囊按钮 + 安全区域
 */
const { request, getToken } = require('./utils/request')

App({
  globalData: {
    userInfo: null,
    isAuthenticated: false,
    // 系统布局信息（所有页面共用）
    systemInfo: null,
    statusBarHeight: 0,
    menuButtonInfo: null,
    navBarHeight: 0,      // 自定义导航栏总高度（状态栏 + 导航内容）
    navContentHeight: 0,  // 导航内容区高度
    navContentTop: 0,     // 导航内容区距顶部距离
    screenWidth: 375,
    screenHeight: 667,
    safeAreaBottom: 0,
    // 品牌资源
    logoUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png',
    aiAvatarUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp',
    // 等级配置
    levelConfig: {
      0: { name: '零级', label: '零基础 / 小学水平', color: '#8a95a5', bgColor: 'rgba(138,149,165,0.08)', stars: 1, abilityLabel: '入门', description: '你目前处于英语入门阶段，掌握了基本的英文字母和少量常用词汇。别担心，每个人都是从零开始的！', recommendation: '推荐加入零基础口语营，从最基础的日常用语开始，循序渐进地建立英语信心。' },
      1: { name: '一级', label: '初中水平', color: '#1B3F91', bgColor: 'rgba(27,63,145,0.06)', stars: 2, abilityLabel: '基础', description: '你具备初中水平的英语基础，能理解简单的日常对话，可以用基本句型进行交流。', recommendation: '推荐加入初级口语营，重点提升日常会话能力和基础语法运用。' },
      2: { name: '二级', label: '高中水平', color: '#83BA12', bgColor: 'rgba(131,186,18,0.06)', stars: 3, abilityLabel: '中级', description: '你的英语基础不错！能理解较复杂的句子结构，能够就常见话题进行较为流畅的表达。', recommendation: '推荐加入中级口语营，进一步拓展词汇量，提升口语表达的准确性和流利度。' },
      3: { name: '三级', label: '高中以上水平', color: '#2B5BA0', bgColor: 'rgba(43,91,160,0.06)', stars: 4, abilityLabel: '高级', description: '你的英语水平很棒！词汇丰富，语法扎实，能够应对复杂的语言场景，表达流利自如。', recommendation: '推荐加入高级口语营，挑战更高难度的话题讨论和商务英语场景。' }
    }
  },

  onLaunch() {
    // 初始化系统布局信息
    this.initSystemInfo()
    // 检查登录状态
    this.checkAuth()
  },

  /** 初始化系统信息（状态栏、胶囊按钮、导航栏高度） */
  initSystemInfo() {
    try {
      const systemInfo = wx.getWindowInfo()
      const menuButton = wx.getMenuButtonBoundingClientRect()
      
      const statusBarHeight = systemInfo.statusBarHeight || 20
      // 胶囊按钮上下间距对称
      const menuButtonMarginTop = menuButton.top - statusBarHeight
      const navContentHeight = menuButton.height
      const navContentTop = menuButton.top
      // 导航栏总高度 = 胶囊底部 + 胶囊上边距（对称）
      const navBarHeight = menuButton.bottom + menuButtonMarginTop

      this.globalData.systemInfo = systemInfo
      this.globalData.statusBarHeight = statusBarHeight
      this.globalData.menuButtonInfo = menuButton
      this.globalData.navBarHeight = navBarHeight
      this.globalData.navContentHeight = navContentHeight
      this.globalData.navContentTop = navContentTop
      this.globalData.screenWidth = systemInfo.screenWidth || 375
      this.globalData.screenHeight = systemInfo.screenHeight || 667
      this.globalData.safeAreaBottom = systemInfo.safeArea ? (systemInfo.screenHeight - systemInfo.safeArea.bottom) : 0
    } catch (e) {
      console.warn('获取系统信息失败', e)
      // 降级默认值
      this.globalData.statusBarHeight = 44
      this.globalData.navBarHeight = 88
      this.globalData.navContentHeight = 32
      this.globalData.navContentTop = 48
    }
  },

  /** 获取导航栏布局数据（供各页面使用） */
  getNavLayout() {
    const { statusBarHeight, navBarHeight, navContentHeight, navContentTop, menuButtonInfo } = this.globalData
    return {
      statusBarHeight,
      navBarHeight,
      navContentHeight,
      navContentTop,
      // 胶囊按钮左侧边界（内容区右边界不能超过这里）
      menuButtonLeft: menuButtonInfo ? menuButtonInfo.left : 280,
      menuButtonWidth: menuButtonInfo ? menuButtonInfo.width : 87,
      menuButtonRight: menuButtonInfo ? menuButtonInfo.right : 367
    }
  },

  /** 检查认证状态 */
  checkAuth() {
    const token = getToken()
    if (!token) {
      this.globalData.isAuthenticated = false
      this.globalData.userInfo = null
      return
    }

    // 验证token有效性
    request('/api/v1/auth/me').then(res => {
      if (res.code === 200 && res.data && res.data.user_info) {
        this.globalData.userInfo = res.data.user_info
        this.globalData.isAuthenticated = true
        wx.setStorageSync('tz_user_info', res.data.user_info)
      } else {
        this.clearAuth()
      }
    }).catch(() => {
      this.clearAuth()
    })
  },

  /** 清除认证信息 */
  clearAuth() {
    this.globalData.userInfo = null
    this.globalData.isAuthenticated = false
    wx.removeStorageSync('tz_biz_token')
    wx.removeStorageSync('tz_refresh_token')
    wx.removeStorageSync('tz_user_info')
  },

  /** 获取等级配置 */
  getLevelConfig(level) {
    return this.globalData.levelConfig[level] || this.globalData.levelConfig[1]
  }
})
