/**
 * 途正英语 - 工具函数
 */

/** 格式化日期 */
function formatDate(dateStr) {
  try {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}`
  } catch (e) {
    return dateStr || ''
  }
}

/** 格式化秒数为 mm:ss */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** 格式化录音时长显示 */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}"`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}'${String(secs).padStart(2, '0')}"`
}

/** 显示Toast提示 */
function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

/** 显示错误提示 */
function showError(msg) {
  wx.showToast({ title: msg || '操作失败', icon: 'error', duration: 2000 })
}

/** 显示成功提示 */
function showSuccess(msg) {
  wx.showToast({ title: msg || '操作成功', icon: 'success', duration: 1500 })
}

/** 延迟函数 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 检查是否已登录 */
function checkLogin() {
  const token = wx.getStorageSync('tz_biz_token')
  return !!token
}

/** 获取本地保存的用户信息 */
function getUserInfo() {
  try {
    return wx.getStorageSync('tz_user_info') || null
  } catch (e) {
    return null
  }
}

/** rpx转px */
function rpx2px(rpx) {
  const systemInfo = wx.getWindowInfo()
  return rpx * systemInfo.windowWidth / 750
}

module.exports = {
  formatDate,
  formatTime,
  formatDuration,
  showToast,
  showError,
  showSuccess,
  delay,
  checkLogin,
  getUserInfo,
  rpx2px
}
