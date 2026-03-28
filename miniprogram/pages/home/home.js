/**
 * 途正英语AI分级测评 - 欢迎页
 * 小程序原生适配版
 * 
 * 功能：
 * - 品牌展示 + 开始测评入口
 * - 测评中断恢复检测（onShow时检查未完成的测评）
 */
const app = getApp()
const { checkLogin, getUserInfo } = require('../../utils/util')

Page({
  data: {
    logoUrl: '',
    isAuthenticated: false,
    userInfo: null,
    showVideo: false,
    demoVideoUrl: '',
    // 导航布局
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    menuButtonRight: 0,
    // 波纹装饰
    waveHeights: [8, 16, 12, 24, 16, 32, 20, 12, 28, 10, 22, 16, 30, 12, 20, 14, 26, 10, 18, 24, 14, 28, 16, 12],
    // 中断恢复
    hasUnfinishedTest: false,
    unfinishedInfo: ''
  },

  _resumeChecked: false, // 防止重复弹窗

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      logoUrl: app.globalData.logoUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      menuButtonRight: app.globalData.screenWidth - navLayout.menuButtonLeft + 16
    })
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
          // 继续测评 → 直接跳转到测评页（test.js会从后端恢复）
          wx.navigateTo({ url: '/pages/test/test?resume=1' })
        } else {
          // 重新开始 → 清除缓存
          try { wx.removeStorageSync('tz_test_session') } catch (e) {}
          this.setData({ hasUnfinishedTest: false })
        }
      }
    })
  },

  /** 开始测评 */
  handleStart() {
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

    wx.navigateTo({ url: '/pages/rules/rules' })
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

  /** 播放示例视频 */
  handlePlayDemo() {
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
