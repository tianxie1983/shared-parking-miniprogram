const { post, uploadFile } = require('../../utils/api')
const app = getApp()

Page({
  data: {
    form: { realName: '', idCard: '', idCardFront: '', propertyCert: '' },
    canSubmit: false
  },
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value }, () => this._checkCanSubmit())
  },
  async onChooseIdCard() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      const tempPath = res.tempFiles[0].tempFilePath
      try {
        const data = await uploadFile({ filePath: tempPath })
        this.setData({ 'form.idCardFront': data.url || tempPath }, () => this._checkCanSubmit())
      } catch (e) {
        this.setData({ 'form.idCardFront': tempPath }, () => this._checkCanSubmit())
      }
    } catch (e) {
      // 用户取消选择
    }
  },
  async onChooseProperty() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      const tempPath = res.tempFiles[0].tempFilePath
      try {
        const data = await uploadFile({ filePath: tempPath })
        this.setData({ 'form.propertyCert': data.url || tempPath }, () => this._checkCanSubmit())
      } catch (e) {
        this.setData({ 'form.propertyCert': tempPath }, () => this._checkCanSubmit())
      }
    } catch (e) {
      // 用户取消选择
    }
  },
  async onSubmit() {
    wx.showLoading({ title: '提交中...' })
    try {
      const res = await post('/auth/verify', this.data.form)
      wx.hideLoading()
      if (res.code === 0) {
        app.globalData.isAuth = true
        // 更新用户信息中的姓名
        if (res.data.realName) {
          app.globalData.userInfo = app.globalData.userInfo || {}
          app.globalData.userInfo.nickName = res.data.realName
        }
        wx.showToast({ title: '提交成功，等待审核', icon: 'success', duration: 2000 })
        setTimeout(() => wx.navigateBack(), 2000)
      }
    } catch (e) { wx.hideLoading() }
  },
  _checkCanSubmit() {
    const { form } = this.data
    this.setData({ canSubmit: !!(form.realName && form.idCard && form.idCardFront && form.propertyCert) })
  }
})
