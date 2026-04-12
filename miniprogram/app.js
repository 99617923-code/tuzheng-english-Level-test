/**
 * 途正英语AI分级测评 - 小程序入口
 * 全局适配：状态栏 + 胶囊按钮 + 安全区域
 */
const { request, getToken } = require('./utils/request')
const { getTeacherConfig } = require('./utils/api')

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
    aiAvatarUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/male-teacher-avatar-T5xrDtUUzwee9GXzJpVr28.webp',
    shareCoverUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/share-cover_103ee497.png',
    // 等级配置（仅保留UI相关配置如颜色、星级等，名称和描述优先使用后端返回的majorLevelName、majorLevelLabel字段）
    levelConfig: {
      0: { name: '零级', label: '学前水平', color: '#22c55e', bgColor: 'rgba(34,197,94,0.08)', stars: 1, abilityLabel: '入门' },
      1: { name: '一级', label: '小学水平', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.06)', stars: 2, abilityLabel: '基础' },
      2: { name: '二级', label: '中学水平', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.06)', stars: 3, abilityLabel: '中级' },
      3: { name: '三级', label: '雅思水平', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.06)', stars: 4, abilityLabel: '高级' }
    }
  },

  onLaunch() {
    // 初始化系统布局信息
    this.initSystemInfo()
    // 检查登录状态
    this.checkAuth()
    // 加载外教配置（动态获取外教头像、名字、开场白录音）
    this.loadTeacherConfig()
  },

  /** 全局错误处理 */
  onError(msg) {
    console.error('[App] Global error:', msg)
  },

  /** 未捕获的Promise拒绝 */
  onUnhandledRejection(event) {
    console.warn('[App] Unhandled rejection:', event.reason)
    // 防止未处理的Promise拒绝导致小程序崩溃
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

  /** 获取等级配置（安全降级：未知级别返回最高级配置，负数/无效值返回零级配置） */
  getLevelConfig(level) {
    const lvl = parseInt(level)
    if (isNaN(lvl) || lvl < 0) return this.globalData.levelConfig[0]
    if (lvl > 3) return this.globalData.levelConfig[3] // IELTS7/8/9等扩展级别映射到最高级
    return this.globalData.levelConfig[lvl] || this.globalData.levelConfig[0]
  },

  /**
   * 加载外教信息配置（从后台动态获取）
   * 接口：GET /api/v1/test/teacher-config
   * 返回：{ name, title, avatarUrl, introAudioUrl }
   */
  loadTeacherConfig() {
    getTeacherConfig().then(data => {
      if (data) {
        // 更新全局外教配置
        if (data.avatarUrl) {
          this.globalData.aiAvatarUrl = data.avatarUrl
        }
        this.globalData.teacherName = data.name || 'Kristyan'
        this.globalData.teacherTitle = data.title || '外教Kristyan老师'
        this.globalData.teacherIntroAudioUrl = data.introAudioUrl || ''
        console.log('[App] Teacher config loaded:', data.name, data.title)
      }
    }).catch(err => {
      console.warn('[App] Load teacher config failed, using defaults:', err)
      // 失败时使用默认值
      this.globalData.teacherName = this.globalData.teacherName || 'Kristyan'
      this.globalData.teacherTitle = this.globalData.teacherTitle || '外教Kristyan老师'
    })
  }
})
