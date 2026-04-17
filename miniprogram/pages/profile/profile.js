/**
 * 途正英语 - 用户资料完善页
 * 
 * 流程：
 * 1. 登录成功后检查 profile_completed
 * 2. 未完善则跳转到此页面
 * 3. 用户填写邮寄地址 + 上传付款截图
 * 4. 提交成功后自动跳转到测评首页
 */
const app = getApp()
const { getProfileStatus, uploadPaymentScreenshot, completeProfile } = require('../../utils/api')

Page({
  data: {
    logoUrl: '',
    navBarHeight: 0,
    navContentTop: 0,
    navContentHeight: 0,
    // 地址字段
    recipientName: '',
    recipientPhone: '',
    region: '',       // 省市区文本
    regionArray: [],  // [省, 市, 区]
    detailAddress: '',
    // 付款截图
    paymentImagePath: '',  // 本地临时路径
    paymentImageUrl: '',   // 上传后的OSS URL
    // 状态
    submitting: false,
    canSubmit: false,
    uploadingImage: false
  },

  onLoad() {
    const navLayout = app.getNavLayout()
    this.setData({
      logoUrl: app.globalData.logoUrl,
      navBarHeight: navLayout.navBarHeight,
      navContentTop: navLayout.navContentTop,
      navContentHeight: navLayout.navContentHeight
    })
  },

  // ============ 地址输入 ============

  onRecipientNameInput(e) {
    this.setData({ recipientName: e.detail.value.trim() })
    this._checkCanSubmit()
  },

  onRecipientPhoneInput(e) {
    this.setData({ recipientPhone: e.detail.value.trim() })
    this._checkCanSubmit()
  },

  onRegionChange(e) {
    const regionArray = e.detail.value
    const regionText = regionArray.join(' ')
    this.setData({
      region: regionText,
      regionArray: regionArray
    })
    this._checkCanSubmit()
  },

  onDetailAddressInput(e) {
    this.setData({ detailAddress: e.detail.value.trim() })
    this._checkCanSubmit()
  },

  // ============ 图片上传 ============

  handleChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFile = res.tempFiles[0]
        // 检查文件大小（限制10MB）
        if (tempFile.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' })
          return
        }
        this.setData({
          paymentImagePath: tempFile.tempFilePath,
          paymentImageUrl: '' // 清空之前上传的URL，需要重新上传
        })
        this._checkCanSubmit()
      }
    })
  },

  // ============ 表单验证 ============

  _checkCanSubmit() {
    const { recipientName, recipientPhone, region, detailAddress, paymentImagePath } = this.data
    const canSubmit = !!(
      recipientName &&
      recipientPhone && recipientPhone.length === 11 &&
      region &&
      detailAddress &&
      paymentImagePath
    )
    if (this.data.canSubmit !== canSubmit) {
      this.setData({ canSubmit })
    }
  },

  // ============ 提交 ============

  async handleSubmit() {
    if (this.data.submitting) return

    // 表单验证
    const { recipientName, recipientPhone, region, detailAddress, paymentImagePath } = this.data

    if (!recipientName) {
      wx.showToast({ title: '请输入收件人姓名', icon: 'none' })
      return
    }
    if (!recipientPhone || recipientPhone.length !== 11) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (!region) {
      wx.showToast({ title: '请选择所在地区', icon: 'none' })
      return
    }
    if (!detailAddress) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' })
      return
    }
    if (!paymentImagePath) {
      wx.showToast({ title: '请上传付款截图', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      // 第一步：上传付款截图到OSS
      let screenshotUrl = this.data.paymentImageUrl
      if (!screenshotUrl) {
        wx.showLoading({ title: '上传截图中...', mask: true })
        try {
          const uploadRes = await uploadPaymentScreenshot(paymentImagePath)
          screenshotUrl = uploadRes.url || uploadRes.screenshotUrl || uploadRes.screenshot_url || ''
          if (!screenshotUrl) {
            throw new Error('上传返回URL为空')
          }
          this.setData({ paymentImageUrl: screenshotUrl })
        } catch (uploadErr) {
          wx.hideLoading()
          console.error('[Profile] Upload screenshot failed:', uploadErr)
          wx.showToast({ title: '截图上传失败，请重试', icon: 'none' })
          this.setData({ submitting: false })
          return
        }
        wx.hideLoading()
      }

      // 第二步：提交完整资料
      wx.showLoading({ title: '提交资料中...', mask: true })

      // 拼接完整地址
      const fullAddress = `${region} ${detailAddress}`

      await completeProfile({
        recipientName,
        recipientPhone,
        address: fullAddress,
        region: this.data.regionArray.join(','),
        detailAddress,
        paymentScreenshotUrl: screenshotUrl
      })

      wx.hideLoading()

      // 更新本地缓存的用户信息
      try {
        const userInfo = wx.getStorageSync('tz_user_info') || {}
        userInfo.profile_completed = true
        userInfo.profileCompleted = true
        wx.setStorageSync('tz_user_info', userInfo)
      } catch (e) {}

      // 成功提示
      wx.showToast({
        title: '资料提交成功',
        icon: 'success',
        duration: 1500
      })

      // 跳转到首页
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/home/home' })
      }, 1500)

    } catch (err) {
      wx.hideLoading()
      console.error('[Profile] Submit failed:', err)
      wx.showToast({
        title: err.message || '提交失败，请重试',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
