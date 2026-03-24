/**
 * 途正英语AI分级测评 - 测评说明页
 */
const app = getApp()
const { checkLogin, showToast } = require('../../utils/util')

Page({
  data: {
    aiAvatarUrl: '',
    statusBarHeight: 20,
    navHeight: 88,
    recordPermission: 'unknown', // unknown | authorized | denied
    steps: [
      { title: '听AI外教说', desc: '听一段英语语音，理解对话内容', color: '#1B3F91', bgColor: 'rgba(27,63,145,0.10)' },
      { title: '跟着说英语', desc: '按住按钮，用英语回答问题', color: '#83BA12', bgColor: 'rgba(131,186,18,0.10)' },
      { title: 'AI智能评估', desc: 'AI实时分析你的发音、语法和表达', color: '#2B5BA0', bgColor: 'rgba(43,91,160,0.10)' },
      { title: '获取等级报告', desc: '完成测评后获得详细的等级评定报告', color: '#4a8a30', bgColor: 'rgba(74,138,48,0.10)' }
    ],
    tips: [
      { text: '请在安静的环境中进行测评', color: '#1B3F91' },
      { text: '说话时请靠近手机麦克风', color: '#83BA12' },
      { text: '每道题有充足的准备和回答时间', color: '#2B5BA0' },
      { text: '请用英语回答，不要使用中文', color: '#4a8a30' },
      { text: '如果不会回答，可以说 "I don\'t know" 或跳过', color: '#8a95a5' }
    ]
  },

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    const menuRect = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const navHeight = statusBarHeight + 44 // 44px for nav content

    this.setData({
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      statusBarHeight,
      navHeight
    })

    this.checkRecordPermission()
  },

  /** 检查录音权限 */
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

  /** 请求录音权限 */
  requestPermission() {
    const { recordPermission } = this.data

    if (recordPermission === 'denied') {
      // 已拒绝，引导去设置页
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
                }
              }
            })
          }
        }
      })
      return
    }

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
    // 检查登录
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

    // 检查录音权限
    if (this.data.recordPermission !== 'authorized') {
      this.requestPermission()
      return
    }

    // 进入测评页
    wx.navigateTo({ url: '/pages/test/test' })
  },

  /** 返回 */
  goBack() {
    wx.navigateBack()
  }
})
