/**
 * 途正英语AI分级测评 - 欢迎页
 * 
 * 优化后的极简流程：
 * - 首页点击"开始测评" → 自动授权录音 → 直接进入测评页
 * - 不再经过独立的测评说明页
 * - 讲解视频从后台动态获取（无视频时不展示）
 * - 保留中断恢复检测
 */
const app = getApp()
const { checkLogin, getUserInfo } = require('../../utils/util')
const { getIntroVideo, getUserLevelStatus, getQrcodeByLevel, getQrcodeDisplaySetting, startTest } = require('../../utils/api')

Page({
  data: {
    logoUrl: '',
    isAuthenticated: false,
    userInfo: null,
    // 讲解视频（动态从后台获取）
    hasIntroVideo: false,
    introVideoUrl: '',
    introCoverUrl: '',
    showVideo: false,
    isVerticalVideo: false,  // 视频是否为竖屏
    // 导航布局
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    menuButtonRight: 0,
    // 波纹装饰
    waveHeights: [8, 16, 12, 24, 16, 32, 20, 12, 28, 10, 22, 16, 30, 12, 20, 14, 26, 10, 18, 24, 14, 28, 16, 12],
    // 中断恢复
    hasUnfinishedTest: false,
    unfinishedInfo: '',
    // 恢复弹窗（自定义弹窗替代wx.showModal，支持关闭按钮）
    showResumeModal: false,
    resumeModalAnswered: 0,
    resumeModalSubLevel: '',
    // 录音授权状态
    recordAuthorized: false,
    // 分级确认状态
    levelConfirmed: false,
    confirmedLevelName: '',
    confirmedMajorLevel: 0,
    confirmedLevelColor: '#3B82F6',
    confirmedQrcodeUrl: '',
    confirmedGroupName: '',
    showConfirmedQrModal: false,
    // 二维码显示开关（后台控制）
    qrcodeEnabled: true,
    checkingLevelStatus: false
  },

  _resumeChecked: false,
  _loadingVideo: false,

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      logoUrl: app.globalData.logoUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      menuButtonRight: app.globalData.screenWidth - navLayout.menuButtonLeft + 16
    })

    // 预检查录音权限状态（不弹窗）
    this._checkRecordAuth()
    // 视频在onShow中统一加载，避免onLoad+onShow重复调用
  },

  onShow() {
    const isAuth = checkLogin()
    const userInfo = getUserInfo()
    this.setData({
      isAuthenticated: isAuth,
      userInfo: userInfo
    })

    // 检查用户分级确认状态（已登录时）
    // 检查二维码显示开关
    this._checkQrcodeSwitch()
    if (isAuth) {
      this._checkLevelStatus()
    } else {
      this.setData({ levelConfirmed: false })
    }
    // 检测未完成的测评
    this._checkUnfinishedTest()
    // 刷新录音权限状态
    this._checkRecordAuth()
    // 每次显示页面时刷新视频配置（后台可能随时添加/更换视频）
    this._loadIntroVideo()
  },

  /** 从后台动态加载讲解视频（带防重复锁） */
  async _loadIntroVideo() {
    if (this._loadingVideo) return
    this._loadingVideo = true
    try {
      const videoData = await getIntroVideo()
      if (videoData && videoData.videoUrl) {
        // 判断视频横竖屏：优先用后端返回的宽高信息，否则默认横屏
        const vWidth = videoData.width || 0
        const vHeight = videoData.height || 0
        const isVertical = vHeight > vWidth && vWidth > 0
        this.setData({
          hasIntroVideo: true,
          introVideoUrl: videoData.videoUrl,
          introCoverUrl: videoData.coverUrl || '',
          isVerticalVideo: isVertical
        })
      } else {
        this.setData({
          hasIntroVideo: false,
          introVideoUrl: '',
          introCoverUrl: ''
        })
      }
    } catch (e) {
      console.warn('[Home] Load intro video failed:', e)
      this.setData({ hasIntroVideo: false })
    } finally {
      this._loadingVideo = false
    }
  },

  /** 检查用户分级确认状态（兼容后端新旧字段） */
  async _checkLevelStatus() {
    if (this.data.checkingLevelStatus) return
    this.setData({ checkingLevelStatus: true })
    try {
      const status = await getUserLevelStatus()
      if (status && status.confirmed) {
        // 兼容多种字段名：majorLevel / major_level
        const majorLevel = status.majorLevel !== undefined ? status.majorLevel : (status.major_level !== undefined ? status.major_level : 0)
        const config = app.getLevelConfig(majorLevel)
        // 等级名称：优先后端返回的levelName/finalLevel/majorLevelName，再用本地config
        const levelName = status.levelName || status.finalLevel || status.majorLevelName || config.name || ''
        this.setData({
          levelConfirmed: true,
          confirmedLevelName: levelName,
          confirmedMajorLevel: majorLevel,
          confirmedLevelColor: config.color || '#3B82F6',
          confirmedQrcodeUrl: status.qrcodeUrl || status.qrcode_url || '',
          confirmedGroupName: status.groupName || status.group_name || ''
        })
      } else {
        this.setData({ levelConfirmed: false })
      }
    } catch (e) {
      console.warn('[Home] Check level status failed:', e)
      // 查询失败不影响正常使用
    } finally {
      this.setData({ checkingLevelStatus: false })
    }
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

  /** 查看已确认分级的二维码 */
  async handleViewConfirmedQr() {
    if (!this.data.qrcodeEnabled) {
      wx.showToast({ title: '二维码功能暂未开放', icon: 'none' })
      return
    }
    // 如果已有二维码URL，直接展示
    if (this.data.confirmedQrcodeUrl) {
      this.setData({ showConfirmedQrModal: true })
      return
    }
    // 否则请求二维码
    this.setData({ showConfirmedQrModal: true })
    try {
      const data = await getQrcodeByLevel(this.data.confirmedMajorLevel)
      if (data) {
        this.setData({
          confirmedQrcodeUrl: data.qrcodeUrl || data.qrcode_url || data.imageUrl || '',
          confirmedGroupName: data.groupName || data.group_name || ''
        })
      }
    } catch (e) {
      console.warn('[Home] Fetch QRCode failed:', e)
    }
  },

  /** 关闭已确认分级二维码弹窗 */
  closeConfirmedQrModal() {
    this.setData({ showConfirmedQrModal: false })
  },

  /** 查看已确认分级的测评结果 */
  handleViewConfirmedResult() {
    // 尝试获取确认时的sessionId
    try {
      const confirmedSessions = wx.getStorageSync('tz_confirmed_sessions') || {}
      const keys = Object.keys(confirmedSessions)
      if (keys.length > 0) {
        // 取最新确认的session
        const latestKey = keys.sort((a, b) => {
          return (confirmedSessions[b].confirmedAt || 0) - (confirmedSessions[a].confirmedAt || 0)
        })[0]
        wx.navigateTo({ url: `/pages/result/result?sessionId=${latestKey}` })
        return
      }
    } catch (e) {}
    // 如果找不到，跳到历史记录
    wx.navigateTo({ url: '/pages/history/history' })
  },

  /** 静默检查录音权限状态（不弹窗） */
  _checkRecordAuth() {
    wx.getSetting({
      success: (res) => {
        const authorized = res.authSetting['scope.record'] === true
        this.setData({ recordAuthorized: authorized })
      }
    })
  },

  /** 请求录音授权（返回Promise） */
  _requestRecordAuth() {
    return new Promise((resolve) => {
      // 先检查当前状态
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.record'] === true) {
            // 已授权
            this.setData({ recordAuthorized: true })
            resolve(true)
          } else if (res.authSetting['scope.record'] === false) {
            // 曾经拒绝过，需要引导去设置页
            wx.showModal({
              title: '需要录音权限',
              content: '测评需要使用麦克风录制你的英语回答。请在设置中开启录音权限。',
              confirmText: '去设置',
              confirmColor: '#3B82F6',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.openSetting({
                    success: (settingRes) => {
                      const granted = settingRes.authSetting['scope.record'] === true
                      this.setData({ recordAuthorized: granted })
                      resolve(granted)
                    },
                    fail: () => resolve(false)
                  })
                } else {
                  resolve(false)
                }
              }
            })
          } else {
            // 首次请求
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                this.setData({ recordAuthorized: true })
                resolve(true)
              },
              fail: () => {
                this.setData({ recordAuthorized: false })
                // 首次拒绝后引导
                wx.showModal({
                  title: '需要录音权限',
                  content: '测评需要使用麦克风录制你的英语回答，没有此权限将无法进行测评。',
                  confirmText: '重新授权',
                  confirmColor: '#3B82F6',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting({
                        success: (settingRes) => {
                          const granted = settingRes.authSetting['scope.record'] === true
                          this.setData({ recordAuthorized: granted })
                          resolve(granted)
                        },
                        fail: () => resolve(false)
                      })
                    } else {
                      resolve(false)
                    }
                  }
                })
              }
            })
          }
        },
        fail: () => resolve(false)
      })
    })
  },

  /** 检测是否有未完成的测评 */
  _checkUnfinishedTest() {
    if (!checkLogin()) {
      this.setData({ hasUnfinishedTest: false })
      return
    }

    try {
      const saved = wx.getStorageSync('tz_test_session')
      if (!saved || !saved.sessionId) {
        this.setData({ hasUnfinishedTest: false })
        return
      }

      // 检查是否过期（30分钟内有效）
      const elapsed = Date.now() - (saved.savedAt || 0)
      if (elapsed > 30 * 60 * 1000) {
        wx.removeStorageSync('tz_test_session')
        this.setData({ hasUnfinishedTest: false })
        return
      }

      // 有未完成的测评
      const answeredCount = saved.totalAnswered || 0
      const minutes = Math.floor(elapsed / 60000)
      const info = `已完成 ${answeredCount} 题，${minutes < 1 ? '刚刚' : minutes + ' 分钟前'}中断`
      this.setData({
        hasUnfinishedTest: true,
        unfinishedInfo: info
      })

      // 首次进入时弹窗提示
      if (!this._resumeChecked) {
        this._resumeChecked = true
        this._showResumeDialog(saved)
      }
    } catch (e) {
      console.warn('[Home] Check unfinished test error:', e)
      this.setData({ hasUnfinishedTest: false })
    }
  },

  /** 显示恢复测评弹窗（自定义弹窗，带关闭按钮） */
  _showResumeDialog(saved) {
    const answeredCount = saved.totalAnswered || 0
    const subLevel = saved.currentSubLevel || ''
    this.setData({
      showResumeModal: true,
      resumeModalAnswered: answeredCount,
      resumeModalSubLevel: subLevel
    })
  },

  /** 恢复弹窗 - 继续测评 */
  handleResumeModalContinue() {
    this.setData({ showResumeModal: false })
    wx.navigateTo({ url: '/pages/test/test?resume=1' })
  },

  /** 恢复弹窗 - 重新开始 */
  handleResumeModalRestart() {
    this.setData({ showResumeModal: false, hasUnfinishedTest: false })
    try { wx.removeStorageSync('tz_test_session') } catch (e) {}
    wx.navigateTo({ url: '/pages/test/test?forceNew=1' })
  },

  /** 恢复弹窗 - 关闭（不做任何操作） */
  handleResumeModalClose() {
    this.setData({ showResumeModal: false })
  },

  /** 开始测评 — 直接进入测评页（跳过说明页） */
  async handleStart() {
    if (!checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }

    // 已确认分级，不允许再测评
    if (this.data.levelConfirmed) {
      wx.showToast({ title: '你已确认分级，无法再次测评', icon: 'none' })
      return
    }

    // 如果有未完成的测评，弹窗询问
    if (this.data.hasUnfinishedTest) {
      const saved = wx.getStorageSync('tz_test_session')
      if (saved && saved.sessionId) {
        this._showResumeDialog(saved)
        return
      }
    }

    // 自动请求录音授权
    const authorized = await this._requestRecordAuth()
    if (!authorized) {
      wx.showToast({ title: '需要录音权限才能测评', icon: 'none' })
      return
    }

    // 直接进入测评页
    wx.navigateTo({ url: '/pages/test/test' })
  },

  /** 继续未完成的测评（从banner点击） */
  handleResume() {
    const saved = wx.getStorageSync('tz_test_session')
    if (saved && saved.sessionId) {
      wx.navigateTo({ url: '/pages/test/test?resume=1' })
    } else {
      this.setData({ hasUnfinishedTest: false })
      wx.showToast({ title: '测评已过期', icon: 'none' })
    }
  },

  /** 关闭未完成测评提示（仅隐藏，不删除session） */
  handleDismissResume() {
    this.setData({ hasUnfinishedTest: false })
  },

  /** 放弃未完成的测评 */
  handleDiscardTest() {
    wx.showModal({
      title: '放弃测评',
      content: '确定要放弃未完成的测评吗？放弃后无法恢复。',
      confirmText: '放弃',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          this.setData({ hasUnfinishedTest: false })
          wx.showToast({ title: '已放弃', icon: 'none' })
        }
      }
    })
  },

  /** 播放讲解视频 */
  handlePlayDemo() {
    if (!this.data.introVideoUrl) return
    this.setData({ showVideo: true })
    // 如果后端没返回宽高，通过video组件的bindloadedmetadata事件获取
  },

  /** 视频元数据加载完成，获取实际宽高判断横竖屏 */
  onVideoMetaLoaded(e) {
    const { width, height } = e.detail
    if (width && height) {
      const isVertical = height > width
      if (this.data.isVerticalVideo !== isVertical) {
        this.setData({ isVerticalVideo: isVertical })
      }
    }
  },

  /** 关闭视频弹窗 */
  closeVideo() {
    this.setData({ showVideo: false })
  },

  /** 阻止冒泡 */
  preventClose() {},

  /** 跳转历史记录 */
  goHistory() {
    if (!checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/history/history' })
  },

  /** 分享给好友 */
  onShareAppMessage() {
    return {
      title: '途正英语智能分级测评，精准测评你的英语口语水平',
      path: '/pages/home/home',
      imageUrl: app.globalData.shareCoverUrl
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return {
      title: '途正英语智能分级测评，精准测评你的英语口语水平',
      imageUrl: app.globalData.shareCoverUrl,
      query: ''
    }
  }
})
