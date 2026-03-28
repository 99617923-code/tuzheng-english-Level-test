/**
 * 途正英语AI分级测评 - 测评说明页
 * 小程序原生适配：使用全局导航布局 + wx.authorize录音授权
 */
const app = getApp()
const { checkLogin } = require('../../utils/util')

Page({
  data: {
    aiAvatarUrl: '',
    // 导航布局
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    // 录音权限
    recordPermission: 'unknown', // unknown | authorized | denied
    steps: [
      { title: '听题', desc: '听AI外教的英语提问，可点击重播', color: '#1B3F91', bgColor: 'rgba(27,63,145,0.10)', icon: 'headphones' },
      { title: '录音作答', desc: '按住麦克风按钮，用英语回答问题', color: '#83BA12', bgColor: 'rgba(131,186,18,0.10)', icon: 'mic' },
      { title: 'AI实时评估', desc: 'AI分析你的发音、语法和表达，判断是否过关', color: '#2B5BA0', bgColor: 'rgba(43,91,160,0.10)', icon: 'zap' },
      { title: '自动升级出题', desc: '过关后自动升级到更高难度，继续答题', color: '#e67e22', bgColor: 'rgba(230,126,34,0.10)', icon: 'trending-up', isLoop: true },
      { title: '生成报告', desc: '当无法继续升级时，确定你的英语等级', color: '#4a8a30', bgColor: 'rgba(74,138,48,0.10)', icon: 'award' }
    ],
    tips: [
      { text: '请在安静的环境中进行测评', color: '#1B3F91' },
      { text: '说话时请靠近手机麦克风', color: '#83BA12' },
      { text: '请用英语回答，不要使用中文', color: '#2B5BA0' },
      { text: '不会的题目可以点击“跳过”', color: '#4a8a30' },
      { text: '测评中途退出可自动保存进度', color: '#e67e22' }
    ]
  },

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })
    this.checkRecordPermission()
  },

  onShow() {
    // 从设置页返回时重新检查权限
    this.checkRecordPermission()
  },

  /** 检查录音权限（小程序原生API） */
  checkRecordPermission() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === true) {
          this.setData({ recordPermission: 'authorized' })
        } else if (res.authSetting['scope.record'] === false) {
          this.setData({ recordPermission: 'denied' })
        } else {
          this.setData({ recordPermission: 'unknown' })
        }
      }
    })
  },

  /** 请求录音权限（小程序原生API） */
  requestPermission() {
    const { recordPermission } = this.data

    if (recordPermission === 'denied') {
      // 已拒绝过，引导去系统设置页开启
      wx.showModal({
        title: '需要录音权限',
        content: '请在设置中开启麦克风权限，否则无法进行测评',
        confirmText: '去设置',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.record']) {
                  this.setData({ recordPermission: 'authorized' })
                  wx.showToast({ title: '授权成功', icon: 'success' })
                }
              }
            })
          }
        }
      })
      return
    }

    // 首次请求，弹出系统授权弹窗
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recordPermission: 'authorized' })
        wx.showToast({ title: '授权成功', icon: 'success' })
      },
      fail: () => {
        this.setData({ recordPermission: 'denied' })
      }
    })
  },

  /** 开始测评 */
  handleStartTest() {
    if (!checkLogin()) {
      wx.showModal({
        title: '请先登录',
        content: '需要登录后才能开始测评',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' })
          }
        }
      })
      return
    }

    if (this.data.recordPermission !== 'authorized') {
      this.requestPermission()
      return
    }

    wx.navigateTo({ url: '/pages/test/test' })
  },

  /** 返回上一页 */
  goBack() {
    wx.navigateBack()
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
