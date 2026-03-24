/**
 * 途正英语AI分级测评 - 欢迎页
 */
const app = getApp()
const { checkLogin, getUserInfo } = require('../../utils/util')
const { logout } = require('../../utils/api')

Page({
  data: {
    logoUrl: '',
    isAuthenticated: false,
    userInfo: null,
    showVideo: false,
    demoVideoUrl: '', // 后续由客户提供真实视频替换
    waveHeights: [8, 16, 12, 24, 16, 32, 20, 12, 28, 10, 22, 16, 30, 12, 20, 14, 26, 10, 18, 24, 14, 28, 16, 12]
  },

  onLoad() {
    this.setData({
      logoUrl: app.globalData.logoUrl
    })
  },

  onShow() {
    // 每次显示时刷新登录状态
    const isAuth = checkLogin()
    const userInfo = getUserInfo()
    this.setData({
      isAuthenticated: isAuth,
      userInfo: userInfo
    })
  },

  /** 开始测评 */
  handleStart() {
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

  /** 跳转登录 */
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  /** 跳转历史记录 */
  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  /** 退出登录 */
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout().then(() => {
            app.clearAuth()
            this.setData({
              isAuthenticated: false,
              userInfo: null
            })
            wx.showToast({ title: '已退出登录', icon: 'success' })
          })
        }
      }
    })
  }
})
