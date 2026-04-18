/**
 * 途正英语AI分级测评 - 登录页
 * 小程序原生适配：微信手机号快捷登录 + 短信验证码登录
 */
const app = getApp()
const { sendSmsCode, smsLogin, wxPhoneLogin } = require('../../utils/api')
const { showToast, showError, showSuccess } = require('../../utils/util')

Page({
  data: {
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    aiAvatarUrl: '',
    logoUrl: '',

    // 短信登录表单
    showSmsForm: false,
    phone: '',
    smsCode: '',
    loading: false,
    sendingCode: false,
    countdown: 0,

    // 协议同意状态（默认未勾选，微信审核要求）
    agreedPolicy: false
  },

  _countdownTimer: null,

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight,
      aiAvatarUrl: app.globalData.aiAvatarUrl,
      logoUrl: app.globalData.logoUrl
    })
  },

  onUnload() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
    }
  },

  /** 返回上一页 */
  goBack() {
    wx.navigateBack({ fail: () => {
      wx.reLaunch({ url: '/pages/home/home' })
    }})
  },

  /** 切换协议勾选状态 */
  toggleAgreement() {
    this.setData({ agreedPolicy: !this.data.agreedPolicy })
  },

  /** 查看用户服务协议 */
  viewUserAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=user' })
  },

  /** 查看隐私政策 */
  viewPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=privacy' })
  },

  /** 检查是否已同意协议 */
  _checkAgreement() {
    if (!this.data.agreedPolicy) {
      showToast('请先阅读并同意用户服务协议和隐私政策')
      return false
    }
    return true
  },

  /** 微信手机号快捷登录 */
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      // 用户拒绝授权，提示使用短信登录
      showToast('您已取消授权，可使用短信验证码登录')
      this.setData({ showSmsForm: true })
      return
    }

    // 检查协议同意状态
    if (!this._checkAgreement()) return

    const code = e.detail.code
    if (!code) {
      showError('获取手机号失败，请重试')
      return
    }

    this.setData({ loading: true })

    // 先调用 wx.login 获取登录凭证
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          showError('微信登录失败，请重试')
          this.setData({ loading: false })
          return
        }

        // 将 phoneCode 和 loginCode 发送给后端
        wxPhoneLogin(code, loginRes.code)
          .then(data => {
            app.globalData.userInfo = data.user_info
            app.globalData.isAuthenticated = true

            if (data.is_new_user) {
              showSuccess('注册成功，已自动登录')
            } else {
              showSuccess('登录成功')
            }

            setTimeout(() => {
              wx.navigateBack({ fail: () => {
                wx.redirectTo({ url: '/pages/home/home' })
              }})
            }, 800)
          })
          .catch(err => {
            showError(err.message || '登录失败，请重试')
          })
          .finally(() => {
            this.setData({ loading: false })
          })
      },
      fail: () => {
        showError('微信登录失败，请重试')
        this.setData({ loading: false })
      }
    })
  },

  /** 切换显示短信登录表单 */
  toggleSmsForm() {
    this.setData({ showSmsForm: true })
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.replace(/\D/g, '') })
  },

  onCodeInput(e) {
    this.setData({ smsCode: e.detail.value.replace(/\D/g, '') })
  },

  /** 发送验证码 */
  handleSendCode() {
    const { phone, sendingCode, countdown } = this.data
    if (sendingCode || countdown > 0) return

    if (!phone.trim()) {
      showToast('请输入手机号')
      return
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      showToast('请输入正确的11位手机号')
      return
    }

    this.setData({ sendingCode: true })

    sendSmsCode(phone.trim(), 'login')
      .then(() => {
        showSuccess('验证码已发送')
        this.startCountdown()
      })
      .catch(err => {
        showError(err.message || '发送验证码失败')
      })
      .finally(() => {
        this.setData({ sendingCode: false })
      })
  },

  /** 开始倒计时 */
  startCountdown() {
    this.setData({ countdown: 60 })
    this._countdownTimer = setInterval(() => {
      const { countdown } = this.data
      if (countdown <= 1) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
        this.setData({ countdown: 0 })
      } else {
        this.setData({ countdown: countdown - 1 })
      }
    }, 1000)
  },

  /** 短信验证码登录 */
  handleSmsLogin() {
    const { phone, smsCode, loading } = this.data
    if (loading) return

    // 检查协议同意状态
    if (!this._checkAgreement()) return

    if (!phone.trim()) {
      showToast('请输入手机号')
      return
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      showToast('请输入正确的11位手机号')
      return
    }
    if (!smsCode.trim()) {
      showToast('请输入短信验证码')
      return
    }
    if (smsCode.trim().length < 4) {
      showToast('请输入完整的验证码')
      return
    }

    this.setData({ loading: true })

    smsLogin(phone.trim(), smsCode.trim())
      .then(data => {
        app.globalData.userInfo = data.user_info
        app.globalData.isAuthenticated = true

        if (data.is_new_user) {
          showSuccess('注册成功，已自动登录')
        } else {
          showSuccess('登录成功')
        }

        setTimeout(() => {
          wx.navigateBack({ fail: () => {
            wx.redirectTo({ url: '/pages/home/home' })
          }})
        }, 800)
      })
      .catch(err => {
        showError(err.message || '登录失败')
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  }
})
