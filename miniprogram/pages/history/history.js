/**
 * 途正英语AI分级测评 - 历史记录页
 * 对接真实后端API：getTestHistory
 * 优化排版版：左侧序号+右侧信息，统计摘要
 */
const app = getApp()
const { getTestHistory } = require('../../utils/api')
const { formatDate, formatDuration, showError, checkLogin } = require('../../utils/util')

Page({
  data: {
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    loading: true,
    loadingMore: false,
    noMore: false,
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    completedCount: 0,
    bestLevel: ''
  },

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })

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

  /** 加载历史记录 - 对接真实后端API */
  async loadHistory() {
    try {
      const data = await getTestHistory(this.data.page, this.data.pageSize)
      const rawList = data.list || data.records || data.items || []
      const list = rawList.map(item => this.formatItem(item))
      const allList = [...this.data.list, ...list]

      // 计算统计摘要
      const completedItems = allList.filter(item => item.status === 'completed')
      const completedCount = completedItems.length
      let bestLevel = ''
      if (completedItems.length > 0) {
        const best = completedItems.reduce((prev, curr) => {
          return (curr.finalLevel || 0) > (prev.finalLevel || 0) ? curr : prev
        })
        bestLevel = best.levelName || ''
      }

      this.setData({
        loading: false,
        list: allList,
        total: data.total || data.totalCount || data.total_count || 0,
        noMore: list.length < this.data.pageSize,
        completedCount,
        bestLevel
      })
    } catch (err) {
      console.error('[History] Load error:', err)
      showError(err.message || '获取记录失败')
      this.setData({ loading: false })
    }
  },

  /** 格式化记录项 - 兼容后端不同字段命名 */
  formatItem(item) {
    const finalLevel = item.finalLevel !== undefined ? item.finalLevel
      : item.final_level !== undefined ? item.final_level
      : item.level !== undefined ? item.level : 0

    const config = app.getLevelConfig(finalLevel)
    const isCompleted = item.status === 'completed'

    // 兼容后端不同字段命名
    const sessionId = item.sessionId || item.session_id || item.id || ''
    const completedAt = item.completedAt || item.completed_at || item.updatedAt || item.updated_at || ''
    const totalDuration = item.totalDuration || item.total_duration || item.duration || 0
    const questionCount = item.questionCount || item.question_count || 0

    return {
      ...item,
      sessionId,
      finalLevel,
      levelName: isCompleted ? (item.levelName || item.level_name || config.name) : null,
      levelLabel: isCompleted ? (item.levelLabel || item.level_label || config.label) : null,
      levelColor: isCompleted ? config.color : '#8a95a5',
      completedAtFormatted: completedAt ? formatDate(completedAt) : '未完成',
      durationText: totalDuration ? formatDuration(Math.round(totalDuration)) : '-',
      questionCount,
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
    const sessionId = e.currentTarget.dataset.sessionId || e.currentTarget.dataset.sessionid
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
