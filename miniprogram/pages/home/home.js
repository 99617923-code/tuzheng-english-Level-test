/**
 * 途正英语AI分级测评 - 欢迎页
 * 小程序原生适配版
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
    waveHeights: [8, 16, 12, 24, 16, 32, 20, 12, 28, 10, 22, 16, 30, 12, 20, 14, 26, 10, 18, 24, 14, 28, 16, 12]
  },

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
  },

  /** 开始测评 */
  handleStart() {
    if (!checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    wx.navigateTo({ url: '/pages/rules/rules' })
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
  }
})
