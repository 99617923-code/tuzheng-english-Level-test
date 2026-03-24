/**
 * 途正英语AI分级测评 - 登录页
 * 手机号 + 短信验证码登录
 */
const app = getApp()
const { sendSmsCode, smsLogin } = require('../../utils/api')
const { showToast, showError, showSuccess } = require('../../utils/util')

Page({
  data: {
    logoUrl: '',
    aiAvatarUrl: '',
    phone: '',
    smsCode: '',
    loading: false,
    sendingCode: false,
    countdown: 0
  },

  _countdownTimer: null,

  onLoad() {
    this.setData({
      logoUrl: app.globalData.logoUrl,
      aiAvatarUrl: app.globalData.aiAvatarUrl
    })
  },

  onUnload() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
    }
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

  /** 登录 */
  handleLogin() {
    const { phone, smsCode, loading } = this.data
    if (loading) return

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
        // 更新全局状态
        app.globalData.userInfo = data.user_info
        app.globalData.isAuthenticated = true

        if (data.is_new_user) {
          showSuccess('注册成功，已自动登录')
        } else {
          showSuccess('登录成功')
        }

        // 返回上一页
        setTimeout(() => {
          wx.navigateBack({ fail: () => {
            wx.redirectTo({ url: '/pages/home/home' })
          }})
        }, 1000)
      })
      .catch(err => {
        showError(err.message || '登录失败')
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  }
})
