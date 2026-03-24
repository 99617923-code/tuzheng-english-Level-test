/**
 * 途正英语AI分级测评 - 历史记录页
 */
const app = getApp()
const { getTestHistory } = require('../../utils/api')
const { formatDate, formatDuration, showError, checkLogin } = require('../../utils/util')

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 88,
    loading: true,
    loadingMore: false,
    noMore: false,
    list: [],
    page: 1,
    pageSize: 20,
    total: 0
  },

  onLoad() {
    const systemInfo = wx.getWindowInfo()
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const navHeight = statusBarHeight + 44

    this.setData({ statusBarHeight, navHeight })

    if (!checkLogin()) {
      wx.showModal({
        title: '请先登录',
        content: '需要登录后才能查看测评记录',
        confirmText: '去登录',
        showCancel: true,
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/login' })
          } else {
            wx.navigateBack()
          }
        }
      })
      return
    }

    this.loadHistory()
  },

  /** 加载历史记录 */
  async loadHistory() {
    try {
      const data = await getTestHistory(this.data.page, this.data.pageSize)
      const list = (data.list || []).map(item => this.formatItem(item))

      this.setData({
        loading: false,
        list: [...this.data.list, ...list],
        total: data.total || 0,
        noMore: list.length < this.data.pageSize
      })
    } catch (err) {
      console.error('[History] Load error:', err)
      showError(err.message || '获取记录失败')
      this.setData({ loading: false })
    }
  },

  /** 格式化记录项 */
  formatItem(item) {
    const config = app.getLevelConfig(item.finalLevel || 0)
    const isCompleted = item.status === 'completed'

    return {
      ...item,
      levelName: isCompleted ? (item.levelName || config.name) : null,
      levelLabel: isCompleted ? (item.levelLabel || config.label) : null,
      levelColor: isCompleted ? config.color : '#8a95a5',
      completedAtFormatted: item.completedAt ? formatDate(item.completedAt) : '未完成',
      durationText: item.totalDuration ? formatDuration(Math.round(item.totalDuration)) : '-',
      statusText: isCompleted ? '已完成' : '未完成'
    }
  },

  /** 加载更多 */
  loadMore() {
    if (this.data.loadingMore || this.data.noMore) return

    this.setData({
      loadingMore: true,
      page: this.data.page + 1
    })

    this.loadHistory().finally(() => {
      this.setData({ loadingMore: false })
    })
  },

  /** 查看详情 */
  viewDetail(e) {
    const sessionId = e.currentTarget.dataset.sessionId
    if (sessionId) {
      wx.navigateTo({
        url: `/pages/result/result?sessionId=${sessionId}`
      })
    }
  },

  /** 去测评 */
  goTest() {
    wx.navigateTo({ url: '/pages/rules/rules' })
  },

  /** 返回 */
  goBack() {
    wx.navigateBack()
  }
})
