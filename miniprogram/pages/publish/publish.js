/**
 * 发布车位页（用户版）
 * 优化：支持全周时段选择、全天候时间范围、开始/结束时间校验
 */
const { post, uploadFile } = require('../../utils/api')
const app = getApp()

Page({
  data: {
    isAuth: false,
    priceInput: '',
    weekdayMap: { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' },
    form: {
      communityName: '',
      locationDetail: '',
      address: '',
      longitude: null,
      latitude: null,
      photos: [],
      schedules: [
        { weekday: 1, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 2, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 3, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 4, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 5, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 6, startTime: '', endTime: '', pricePerHour: 0, enabled: false },
        { weekday: 7, startTime: '', endTime: '', pricePerHour: 0, enabled: false }
      ]
    },
    canSubmit: false
  },

  onShow() {
    const { isAuth } = app.globalData
    this.setData({ isAuth })
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({ [`form.${field}`]: value }, () => this._checkCanSubmit())
  },

  onPriceInput(e) {
    const price = parseFloat(e.detail.value) || 0
    if (price <= 0) {
      this.setData({ priceInput: e.detail.value, canSubmit: false })
      return
    }
    if (price > 100) {
      wx.showToast({ title: '价格不能超过100元/小时', icon: 'none' })
      return
    }
    this.setData({ priceInput: e.detail.value }, () => {
      const schedules = this.data.form.schedules.map(s => ({ ...s, pricePerHour: price }))
      this.setData({ 'form.schedules': schedules }, () => this._checkCanSubmit())
    })
  },

  /** 地图选址 */
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.address': res.address || res.name,
          'form.longitude': res.longitude,
          'form.latitude': res.latitude
        }, () => this._checkCanSubmit())
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({
          title: '地图选址失败，请检查定位权限',
          icon: 'none',
          duration: 3000
        })
      }
    })
  },

  /** 切换某天是否启用 */
  onToggleDay(e) {
    const { index } = e.currentTarget.dataset
    const enabled = !this.data.form.schedules[index].enabled
    this.setData({
      [`form.schedules[${index}].enabled`]: enabled,
      [`form.schedules[${index}].startTime`]: enabled ? this.data.form.schedules[index].startTime : '',
      [`form.schedules[${index}].endTime`]: enabled ? this.data.form.schedules[index].endTime : ''
    }, () => this._checkCanSubmit())
  },

  /** 时段选择变更 */
  onScheduleChange(e) {
    const { index, field } = e.currentTarget.dataset
    const value = e.detail.value
    const schedule = this.data.form.schedules[index]

    // 验证结束时间大于开始时间
    if (field === 'endTime' && schedule.startTime && value <= schedule.startTime) {
      wx.showToast({ title: '结束时间必须大于开始时间', icon: 'none' })
      return
    }
    if (field === 'startTime' && schedule.endTime && value >= schedule.endTime) {
      wx.showToast({ title: '开始时间必须小于结束时间', icon: 'none' })
      return
    }

    this.setData({ [`form.schedules[${index}].${field}`]: value }, () => this._checkCanSubmit())
  },

  /** 批量设置：将所有启用天设为同一时段 */
  onBatchSetTime(e) {
    const { start, end } = e.currentTarget.dataset
    const schedules = this.data.form.schedules.map(s => {
      if (s.enabled) {
        return { ...s, startTime: start, endTime: end }
      }
      return s
    })
    this.setData({ 'form.schedules': schedules }, () => this._checkCanSubmit())
  },

  /** 选择图片 */
  onChooseImage() {
    const remaining = 6 - this.data.form.photos.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传6张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' })
        const urls = [...this.data.form.photos]
        for (const file of res.tempFiles) {
          try {
            const data = await uploadFile({ filePath: file.tempFilePath })
            urls.push(data.url)
          } catch (e) {
            urls.push(file.tempFilePath)
          }
        }
        wx.hideLoading()
        this.setData({ 'form.photos': urls }, () => this._checkCanSubmit())
      },
      fail: () => {
        wx.chooseImage({
          count: remaining,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: async (res) => {
            wx.showLoading({ title: '上传中...' })
            const urls = [...this.data.form.photos]
            for (const path of res.tempFilePaths) {
              try {
                const data = await uploadFile({ filePath: path })
                urls.push(data.url)
              } catch (e) {
                urls.push(path)
              }
            }
            wx.hideLoading()
            this.setData({ 'form.photos': urls }, () => this._checkCanSubmit())
          }
        })
      }
    })
  },

  /** 提交发布 */
  async onSubmit() {
    if (!this.data.canSubmit) return

    // 最终校验：确保所有启用天有时段
    const invalidDay = this.data.form.schedules.find(s => s.enabled && (!s.startTime || !s.endTime))
    if (invalidDay) {
      const dayName = this.data.weekdayMap[invalidDay.weekday]
      wx.showToast({ title: `${dayName}时段不完整`, icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...' })
    try {
      // 只提交启用的时段
      const submitData = {
        ...this.data.form,
        schedules: this.data.form.schedules.filter(s => s.enabled && s.startTime && s.endTime)
      }
      const res = await post('/parking/publish', submitData)
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '提交成功，等待审核', icon: 'success', duration: 2000 })
        setTimeout(() => {
          this.setData({
            form: {
              communityName: '', locationDetail: '', address: '', longitude: null, latitude: null, photos: [],
              schedules: this._resetSchedules()
            },
            priceInput: ''
          })
        }, 2000)
      }
    } catch (e) {
      wx.hideLoading()
    }
  },

  _resetSchedules() {
    return [1,2,3,4,5,6,7].map(w => ({ weekday: w, startTime: '', endTime: '', pricePerHour: 0, enabled: false }))
  },

  _checkCanSubmit() {
    const { form } = this.data
    const hasPhoto = form.photos.length > 0
    const hasSchedule = form.schedules.some(s => s.enabled && s.startTime && s.endTime)
    const hasPrice = form.schedules.some(s => s.pricePerHour > 0)
    const hasLocation = form.longitude && form.latitude
    this.setData({
      canSubmit: !!(form.communityName && form.locationDetail && form.address && hasPhoto && hasSchedule && hasPrice && hasLocation)
    })
  },

  onGoAuth() {
    wx.navigateTo({ url: '/pages/auth/auth' })
  },

  onPreviewImage(e) {
    wx.previewImage({ urls: [e.currentTarget.dataset.url] })
  },

  /** 阻止冒泡 */
  onStopPropagation() {}
})
