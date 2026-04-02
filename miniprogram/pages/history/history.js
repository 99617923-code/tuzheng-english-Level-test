/**
 * 途正英语AI分级测评 - 历史记录页（自适应引擎 v2）
 * 对接后端API：getTestHistory
 * 
 * v2 历史记录格式：
 * {
 *   list: [{
 *     sessionId, status, majorLevel, majorLevelName,
 *     highestSubLevel, overallScore, totalQuestions,
 *     passedQuestions, totalDuration, createdAt, completedAt
 *   }],
 *   total, page, pageSize
 * }
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

  /** 加载历史记录 - 对接v2 API */
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
          return (curr.majorLevel || 0) > (prev.majorLevel || 0) ? curr : prev
        })
        bestLevel = best.levelName || ''
      }

      this.setData({
        loading: false,
        list: allList,
        total: data.total || data.totalCount || 0,
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

  /** 格式化记录项 - 适配v2字段 */
  formatItem(item) {
    // v2字段优先，兼容v1
    const majorLevel = item.majorLevel !== undefined ? item.majorLevel
      : item.finalLevel !== undefined ? item.finalLevel
      : item.final_level !== undefined ? item.final_level
      : item.level !== undefined ? item.level : 0

    const config = app.getLevelConfig(majorLevel)
    const isCompleted = item.status === 'completed'

    // 兼容不同字段命名
    const sessionId = item.sessionId || item.session_id || item.id || ''
    const completedAt = item.completedAt || item.completed_at || item.updatedAt || item.updated_at || ''
    const createdAt = item.createdAt || item.created_at || ''

    // v2: totalDuration 是毫秒
    const totalDuration = item.totalDuration || item.total_duration || item.duration || 0
    const durationSeconds = totalDuration > 10000 ? Math.round(totalDuration / 1000) : Math.round(totalDuration)

    const totalQuestions = item.totalQuestions || item.question_count || item.questionCount || 0
    const passedQuestions = item.passedQuestions || 0
    const overallScore = item.overallScore || item.overall_score || 0
    const highestSubLevel = item.highestSubLevel || item.highest_sub_level || ''

    return {
      ...item,
      sessionId,
      majorLevel,
      levelName: isCompleted ? (item.majorLevelName || item.levelName || item.level_name || config.name) : null,
      levelLabel: isCompleted ? (item.majorLevelLabel || config.label || '') : null,
      levelColor: isCompleted ? config.color : '#8a95a5',
      completedAtFormatted: completedAt ? formatDate(completedAt) : (createdAt ? formatDate(createdAt) : '未完成'),
      durationText: durationSeconds > 0 ? formatDuration(durationSeconds) : '-',
      totalQuestions,
      passedQuestions,
      overallScore: Math.round(overallScore),
      highestSubLevel,
      statusText: isCompleted ? '已完成' : '未完成'
    }
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    this.setData({
      page: 1,
      list: [],
      noMore: false,
      loading: true
    })
    await this.loadHistory()
    wx.stopPullDownRefresh()
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
    wx.navigateTo({ url: '/pages/test/test' })
  },

  /** 返回 */
  goBack() {
    wx.navigateBack()
  }
})
