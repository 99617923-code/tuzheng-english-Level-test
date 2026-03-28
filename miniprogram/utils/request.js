/**
 * 途正英语 - 网络请求封装
 * 对接后端: https://tzapp-admin.figo.cn
 * 认证方式: Bearer Token + X-App-Key
 */

const BASE_URL = 'https://tzapp-admin.figo.cn'
const APP_KEY = 'tzk_ce457c0a5a5daf5a5ba0af8c6952f345'

// 默认超时时间（毫秒）
const DEFAULT_TIMEOUT = 15000
// 登录/评估等耗时接口的超时时间（AI评估可能耗时较长）
const LONG_TIMEOUT = 45000

// ============ Token 管理 ============

function getToken() {
  return wx.getStorageSync('tz_biz_token') || ''
}

function getRefreshToken() {
  return wx.getStorageSync('tz_refresh_token') || ''
}

function setTokens(bizToken, refreshToken) {
  if (bizToken) wx.setStorageSync('tz_biz_token', bizToken)
  if (refreshToken) wx.setStorageSync('tz_refresh_token', refreshToken)
}

function clearTokens() {
  wx.removeStorageSync('tz_biz_token')
  wx.removeStorageSync('tz_refresh_token')
  wx.removeStorageSync('tz_user_info')
}

// ============ 请求封装 ============

let isRefreshing = false
let refreshSubscribers = []

/**
 * 将等待刷新的请求加入队列
 */
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback)
}

/**
 * 刷新完成后通知所有等待的请求
 */
function onTokenRefreshed(success) {
  refreshSubscribers.forEach(cb => cb(success))
  refreshSubscribers = []
}

/**
 * 判断是否为耗时接口（需要更长超时时间）
 */
function isLongTimeoutUrl(url) {
  const longUrls = [
    '/auth/wx-phone-login',
    '/test/evaluate',
    '/test/transcribe',
    '/test/tts',
    '/test/start',
    '/test/upload-audio'
  ]
  return longUrls.some(u => url.includes(u))
}

/**
 * 通用请求方法
 * @param {string} url - API路径（不含域名）
 * @param {object} options - 请求选项
 * @param {string} options.method - 请求方法，默认 GET
 * @param {object} options.data - 请求数据
 * @param {object} options.header - 额外请求头
 * @param {boolean} options.noAuth - 是否跳过认证头
 * @param {number} options.timeout - 自定义超时时间（毫秒）
 * @returns {Promise<object>} 响应数据
 */
function request(url, options = {}) {
  const { method = 'GET', data, header = {}, noAuth = false, timeout } = options

  const headers = {
    'Content-Type': 'application/json',
    'X-App-Key': APP_KEY,
    ...header
  }

  if (!noAuth) {
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // 根据接口类型自动选择超时时间
  const requestTimeout = timeout || (isLongTimeoutUrl(url) ? LONG_TIMEOUT : DEFAULT_TIMEOUT)

  return new Promise((resolve, reject) => {
    console.log(`[Request] ${method} ${url}`, data ? JSON.stringify(data).substring(0, 200) : '')

    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: headers,
      timeout: requestTimeout,
      success(res) {
        const responseData = res.data
        const statusCode = res.statusCode

        console.log(`[Request] ${method} ${url} → HTTP ${statusCode}`,
          typeof responseData === 'object' ? `code=${responseData.code}` : '')

        // HTTP状态码异常处理
        if (statusCode >= 500) {
          console.error(`[Request] Server error ${statusCode}:`, url, responseData)
          reject(new Error(`服务器错误(${statusCode})，请稍后重试`))
          return
        }

        if (statusCode === 404) {
          console.error(`[Request] Not found:`, url)
          reject(new Error('接口不存在(404)'))
          return
        }

        if (statusCode === 403) {
          console.error(`[Request] Forbidden:`, url, responseData)
          reject(new Error(responseData.msg || '请求被拒绝(403)'))
          return
        }

        // Token过期处理（HTTP 401 或 业务code 401/10001）
        if (statusCode === 401 || responseData.code === 401 || responseData.code === 10001) {
          console.warn(`[Request] Auth expired for ${url}, attempting refresh...`)

          if (!isRefreshing) {
            isRefreshing = true
            tryRefreshToken().then(refreshed => {
              isRefreshing = false
              onTokenRefreshed(refreshed)
            }).catch(() => {
              isRefreshing = false
              onTokenRefreshed(false)
            })
          }

          // 将当前请求加入等待队列
          subscribeTokenRefresh((refreshed) => {
            if (refreshed) {
              // 重试原请求
              const retryHeaders = { ...headers, 'Authorization': `Bearer ${getToken()}` }
              wx.request({
                url: `${BASE_URL}${url}`,
                method,
                data,
                header: retryHeaders,
                timeout: requestTimeout,
                success(retryRes) {
                  if (retryRes.statusCode >= 400) {
                    reject(new Error(retryRes.data?.msg || `请求失败(${retryRes.statusCode})`))
                  } else {
                    resolve(retryRes.data)
                  }
                },
                fail(err) {
                  reject(new Error(err.errMsg || '网络请求失败'))
                }
              })
            } else {
              clearTokens()
              // 跳转登录页（避免页面栈溢出）
              const pages = getCurrentPages()
              const currentPage = pages[pages.length - 1]
              const currentRoute = currentPage ? currentPage.route : ''
              if (currentRoute !== 'pages/login/login') {
                wx.navigateTo({
                  url: '/pages/login/login',
                  fail: () => {
                    wx.reLaunch({ url: '/pages/login/login' })
                  }
                })
              }
              reject(new Error('登录已过期，请重新登录'))
            }
          })
          return
        }

        resolve(responseData)
      },
      fail(err) {
        console.error('[Request] Network failed:', url, err)
        // 区分超时和网络错误
        if (err.errMsg && err.errMsg.includes('timeout')) {
          reject(new Error('网络请求超时，请检查网络后重试'))
        } else if (err.errMsg && (err.errMsg.includes('fail') || err.errMsg.includes('abort'))) {
          reject(new Error('网络连接失败，请检查网络设置'))
        } else {
          reject(new Error(err.errMsg || '网络请求失败'))
        }
      }
    })
  })
}

/**
 * 尝试刷新Token
 */
function tryRefreshToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    console.warn('[Request] No refresh token available')
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    console.log('[Request] Attempting token refresh...')
    wx.request({
      url: `${BASE_URL}/api/v1/auth/refresh-token`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-App-Key': APP_KEY
      },
      data: { refresh_token: refreshToken },
      timeout: DEFAULT_TIMEOUT,
      success(res) {
        if (res.data && res.data.code === 200) {
          console.log('[Request] Token refresh successful')
          setTokens(res.data.data.biz_token, res.data.data.refresh_token)
          resolve(true)
        } else {
          console.warn('[Request] Token refresh failed:', res.data)
          resolve(false)
        }
      },
      fail(err) {
        console.warn('[Request] Token refresh network error:', err)
        resolve(false)
      }
    })
  })
}

/**
 * 上传文件
 * @param {string} url - API路径
 * @param {string} filePath - 本地文件路径
 * @param {string} name - 文件字段名
 * @param {object} formData - 额外表单数据
 * @returns {Promise<object>} 响应数据
 */
function uploadFile(url, filePath, name = 'file', formData = {}) {
  const token = getToken()
  const headers = {
    'X-App-Key': APP_KEY
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  console.log(`[Upload] ${url}, file: ${filePath}`)

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}${url}`,
      filePath,
      name,
      formData,
      header: headers,
      timeout: LONG_TIMEOUT,
      success(res) {
        console.log(`[Upload] ${url} → HTTP ${res.statusCode}`)
        try {
          const data = JSON.parse(res.data)
          if (res.statusCode >= 400) {
            reject(new Error(data.msg || `上传失败(${res.statusCode})`))
          } else {
            resolve(data)
          }
        } catch (e) {
          console.error('[Upload] Parse response failed:', res.data)
          reject(new Error('解析响应失败'))
        }
      },
      fail(err) {
        console.error('[Upload] Failed:', url, err)
        if (err.errMsg && err.errMsg.includes('timeout')) {
          reject(new Error('上传超时，请检查网络后重试'))
        } else {
          reject(new Error(err.errMsg || '上传失败'))
        }
      }
    })
  })
}

module.exports = {
  request,
  uploadFile,
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  BASE_URL,
  APP_KEY
}
