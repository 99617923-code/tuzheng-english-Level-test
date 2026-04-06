/**
 * 途正英语AI分级测评 - 测评说明页
 * 优化：进入即自动弹出录音授权 + 开始测评按钮置顶 + 说明内容折叠
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
    // 折叠面板状态
    expandedSections: {
      flow: false,
      tips: false
    },
    steps: [
      { title: '听题', desc: '听AI外教的英语提问，理解题目内容', color: '#1B3F91', bgColor: 'rgba(27,63,145,0.10)', icon: 'headphones-blue' },
      { title: '录音作答', desc: '按住麦克风按钮，用英语回答问题', color: '#83BA12', bgColor: 'rgba(131,186,18,0.10)', icon: 'mic-green' },
      { title: 'AI实时评估', desc: 'AI分析你的回答，判断是否过关', color: '#2B5BA0', bgColor: 'rgba(43,91,160,0.10)', icon: 'zap-blue' },
      { title: '过关自动升级', desc: '通过后自动出更难的题，继续挑战', color: '#e67e22', bgColor: 'rgba(230,126,34,0.10)', icon: 'trending-up-orange', isLoop: true },
      { title: '生成等级报告', desc: '无法继续升级时，确定你的英语等级', color: '#4a8a30', bgColor: 'rgba(74,138,48,0.10)', icon: 'award-green' }
    ],
    tips: [
      { text: '请在安静的环境中进行测评', icon: '🤫' },
      { text: '说话时请靠近手机麦克风', icon: '🎙️' },
      { text: '请用英语回答，不要使用中文', icon: '🇬🇧' },
      { text: '不会的题目可以点击"跳过"', icon: '⏭️' },
      { text: '中途退出可自动保存进度', icon: '💾' }
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
    // 先检查权限状态
    this._checkAndAutoAuthorize()
  },

  onShow() {
    // 从设置页返回时重新检查权限
    this._checkPermissionSilent()
  },

  /** 进入页面自动检查并弹出授权 */
  _checkAndAutoAuthorize() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record'] === true) {
          this.setData({ recordPermission: 'authorized' })
        } else if (res.authSetting['scope.record'] === false) {
          // 之前拒绝过，标记为denied，不自动弹窗（系统不允许）
          this.setData({ recordPermission: 'denied' })
          // 延迟提示用户去设置开启
          setTimeout(() => {
            this._guideToDeniedSetting()
          }, 500)
        } else {
          // 首次，自动弹出系统授权弹窗
          this.setData({ recordPermission: 'unknown' })
          setTimeout(() => {
            this._autoRequestPermission()
          }, 300)
        }
      }
    })
  },

  /** 静默检查权限（不弹窗） */
  _checkPermissionSilent() {
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

  /** 自动请求录音权限 */
  _autoRequestPermission() {
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recordPermission: 'authorized' })
      },
      fail: () => {
        this.setData({ recordPermission: 'denied' })
      }
    })
  },

  /** 引导已拒绝的用户去设置页 */
  _guideToDeniedSetting() {
    wx.showModal({
      title: '需要录音权限',
      content: '测评需要使用麦克风，请在设置中开启录音权限',
      confirmText: '去设置',
      cancelText: '稍后',
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
  },

  /** 手动请求录音权限（点击授权状态区域时） */
  requestPermission() {
    const { recordPermission } = this.data
    if (recordPermission === 'authorized') return

    if (recordPermission === 'denied') {
      this._guideToDeniedSetting()
      return
    }

    // 首次请求
    this._autoRequestPermission()
  },

  /** 切换折叠面板 */
  toggleSection(e) {
    const section = e.currentTarget.dataset.section
    const key = `expandedSections.${section}`
    this.setData({
      [key]: !this.data.expandedSections[section]
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
