const { post, get } = require('../../utils/api')

Page({
  data: {
    orderId: null,
    orderInfo: null,
    complaintTypes: ['超时占用', '车辆损坏', '态度恶劣', '虚假信息', '其他'],
    selectedType: 0,
    description: '',
    photos: [],
    canSubmit: false,
    remaining: 10
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId })
      this.loadOrderInfo(options.orderId)
    }
  },

  /** 加载订单信息，关联车位主 */
  async loadOrderInfo(orderId) {
    try {
      const res = await get('/order/detail', { orderId })
      if (res.code === 0) {
        this.setData({ orderInfo: res.data })
      }
    } catch (e) { /* silent */ }
  },

  onTypeChange(e) { this.setData({ selectedType: Number(e.detail.value) }) },

  onDescInput(e) {
    const val = e.detail.value
    const canSubmit = val.length >= 10
    const remaining = Math.max(0, 10 - val.length)
    this.setData({ description: val, canSubmit, remaining })
  },

  /** 选择图片凭证 */
  onChooseImage() {
    const remaining = 3 - this.data.photos.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const newPhotos = res.tempFiles.map(f => f.tempFilePath)
        this.setData({ photos: [...this.data.photos, ...newPhotos] })
      },
      fail: () => {
        // 降级使用旧API
        wx.chooseImage({
          count: remaining,
          sizeType: ['compressed'],
          success: (res) => {
            this.setData({ photos: [...this.data.photos, ...res.tempFilePaths] })
          }
        })
      }
    })
  },

  /** 删除图片 */
  onDeletePhoto(e) {
    const idx = e.currentTarget.dataset.index
    const photos = [...this.data.photos]
    photos.splice(idx, 1)
    this.setData({ photos })
  },

  /** 预览图片 */
  onPreviewPhoto(e) {
    const { url } = e.currentTarget.dataset
    wx.previewImage({ urls: this.data.photos, current: url })
  },

  async onSubmit() {
    if (!this.data.canSubmit) return
    wx.showLoading({ title: '提交中...' })
    try {
      const { orderInfo } = this.data
      const res = await post('/complaint/submit', {
        orderId: this.data.orderId,
        type: this.data.selectedType,
        description: this.data.description,
        photos: this.data.photos,
        // 关联订单信息
        ownerName: orderInfo ? orderInfo.ownerName : '未知',
        communityName: orderInfo ? orderInfo.communityName : '未知',
        spaceId: orderInfo ? orderInfo.spaceId : null
      })
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '投诉已提交，等待处理', icon: 'success', duration: 2000 })
        // 跳转到投诉记录页，不返回订单流程
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/complaint-list/complaint-list' })
        }, 2000)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    }
  }
})
