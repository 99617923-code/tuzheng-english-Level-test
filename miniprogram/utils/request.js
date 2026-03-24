/**
 * 途正英语 - 网络请求封装
 * 对接后端: https://tzapp-admin.figo.cn
 * 认证方式: Bearer Token + X-App-Key
 */

const BASE_URL = 'https://tzapp-admin.figo.cn'
const APP_KEY = 'tzk_ce457c0a5a5daf5a5ba0af8c6952f345'

// ============ Token 管理 ============

function getToken() {
  return wx.getStorageSync('tz_biz_token') || ''
}

function getRefreshToken() {
  return wx.getStorageSync('tz_refresh_token') || ''
}

function setTokens(bizToken, refreshToken) {
  wx.setStorageSync('tz_biz_token', bizToken)
  wx.setStorageSync('tz_refresh_token', refreshToken)
}

function clearTokens() {
  wx.removeStorageSync('tz_biz_token')
  wx.removeStorageSync('tz_refresh_token')
  wx.removeStorageSync('tz_user_info')
}

// ============ 请求封装 ============

let isRefreshing = false
let refreshPromise = null

/**
 * 通用请求方法
 * @param {string} url - API路径（不含域名）
 * @param {object} options - 请求选项
 * @param {string} options.method - 请求方法，默认 GET
 * @param {object} options.data - 请求数据
 * @param {object} options.header - 额外请求头
 * @param {boolean} options.noAuth - 是否跳过认证头
 * @returns {Promise<object>} 响应数据
 */
function request(url, options = {}) {
  const { method = 'GET', data, header = {}, noAuth = false } = options

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

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: headers,
      success(res) {
        const responseData = res.data

        // Token过期处理
        if (responseData.code === 401 || responseData.code === 10001) {
          if (!isRefreshing) {
            isRefreshing = true
            refreshPromise = tryRefreshToken().finally(() => {
              isRefreshing = false
              refreshPromise = null
            })
          }

          const waitRefresh = refreshPromise || tryRefreshToken()
          waitRefresh.then(refreshed => {
            if (refreshed) {
              // 重试原请求
              headers['Authorization'] = `Bearer ${getToken()}`
              wx.request({
                url: `${BASE_URL}${url}`,
                method,
                data,
                header: headers,
                success(retryRes) {
                  resolve(retryRes.data)
                },
                fail(err) {
                  reject(err)
                }
              })
            } else {
              clearTokens()
              // 跳转登录页
              wx.navigateTo({ url: '/pages/login/login' })
              reject(new Error('AUTH_EXPIRED'))
            }
          })
          return
        }

        resolve(responseData)
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

/**
 * 尝试刷新Token
 */
function tryRefreshToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return Promise.resolve(false)

  return new Promise((resolve) => {
    wx.request({
      url: `${BASE_URL}/api/v1/auth/refresh-token`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'X-App-Key': APP_KEY
      },
      data: { refresh_token: refreshToken },
      success(res) {
        if (res.data && res.data.code === 200) {
          setTokens(res.data.data.biz_token, res.data.data.refresh_token)
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail() {
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

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}${url}`,
      filePath,
      name,
      formData,
      header: headers,
      success(res) {
        try {
          const data = JSON.parse(res.data)
          resolve(data)
        } catch (e) {
          reject(new Error('解析响应失败'))
        }
      },
      fail(err) {
        reject(err)
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
