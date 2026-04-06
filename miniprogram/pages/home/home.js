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
const { getIntroVideo } = require('../../utils/api')

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
    // 录音授权状态
    recordAuthorized: false
  },

  _resumeChecked: false,

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
    // 加载讲解视频配置
    this._loadIntroVideo()
  },

  onShow() {
    const isAuth = checkLogin()
    const userInfo = getUserInfo()
    this.setData({
      isAuthenticated: isAuth,
      userInfo: userInfo
    })

    // 检测未完成的测评
    this._checkUnfinishedTest()
    // 刷新录音权限状态
    this._checkRecordAuth()
    // 每次显示页面时刷新视频配置（后台可能随时添加/更换视频）
    this._loadIntroVideo()
  },

  /** 从后台动态加载讲解视频 */
  async _loadIntroVideo() {
    try {
      const videoData = await getIntroVideo()
      if (videoData && videoData.videoUrl) {
        this.setData({
          hasIntroVideo: true,
          introVideoUrl: videoData.videoUrl,
          introCoverUrl: videoData.coverUrl || ''
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
    }
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
              confirmColor: '#1B3F91',
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
                  confirmColor: '#1B3F91',
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

  /** 显示恢复测评弹窗 */
  _showResumeDialog(saved) {
    const answeredCount = saved.totalAnswered || 0
    const subLevel = saved.currentSubLevel || ''

    wx.showModal({
      title: '发现未完成的测评',
      content: `你有一次未完成的测评（已答 ${answeredCount} 题，当前级别 ${subLevel}），是否继续？`,
      confirmText: '继续测评',
      confirmColor: '#83BA12',
      cancelText: '重新开始',
      success: (res) => {
        if (res.confirm) {
          // 继续测评：恢复旧会话
          wx.navigateTo({ url: '/pages/test/test?resume=1' })
        } else {
          // 重新开始：清除缓存 + 强制创建新会话
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          this.setData({ hasUnfinishedTest: false })
          wx.navigateTo({ url: '/pages/test/test?forceNew=1' })
        }
      }
    })
  },

  /** 开始测评 — 直接进入测评页（跳过说明页） */
  async handleStart() {
    if (!checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
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
      title: '途正英语AI智能分级测评，3分钟测出你的英语水平',
      path: '/pages/home/home',
      imageUrl: app.globalData.shareCoverUrl
    }
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return {
      title: '途正英语AI智能分级测评，3分钟测出你的英语水平',
      imageUrl: app.globalData.shareCoverUrl,
      query: ''
    }
  }
})
