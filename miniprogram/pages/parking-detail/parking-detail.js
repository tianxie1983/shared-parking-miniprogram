/**
 * 车位详情页
 * 对应方案：三.MVP核心功能清单 - 3.1 用户端 - 车位详情
 */
const { get } = require('../../utils/api')

Page({
  data: {
    spaceId: null,
    space: {
      photos: [],
      tags: [],
      schedules: [],
      pricePerHour: 0,
      rating: 0,
      orderCount: 0,
      successRate: 0,
      auditStatus: 0
    },
    bookedToday: [], // 今日已被预约的时段（按订单窗口派生，不影响其它时段预约）
    weekdayMap: {
      1: '周一', 2: '周二', 3: '周三', 4: '周四',
      5: '周五', 6: '周六', 7: '周日'
    }
  },

  onLoad(options) {
    const { spaceId } = options
    if (spaceId) {
      this.setData({ spaceId })
      this.loadDetail(spaceId)
    }
  },

  onShow() {
    // 返回时刷新占用状态（预约/离场后时段窗口会变化）
    if (this.data.spaceId) this.loadDetail(this.data.spaceId)
  },

  async loadDetail(spaceId) {
    try {
      const res = await get('/parking/detail', { spaceId })
      const space = res.data
      // 预计算信用分（rating 5分制 → 100分制），避免WXML中运算超出100
      if (space.rating) {
        space.creditScore = Math.min(100, Math.round(space.rating * 20))
      } else {
        space.creditScore = 0
      }
      // 占用由订单时段窗口派生，车位始终可预约；这里仅展示今日已被占用的具体时段
      const today = this._formatToday()
      let bookedToday = []
      try {
        const av = await get('/booking/availability', { spaceId, date: today })
        bookedToday = (av.data && av.data.bookedSlots) || []
      } catch (e) { /* ignore */ }
      this.setData({ space, bookedToday })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  _formatToday() {
    const d = new Date()
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  },

  /** 点击预约 -> 跳转预约页 */
  onBookTap() {
    wx.navigateTo({
      url: `/pages/booking/booking?spaceId=${this.data.spaceId}`
    })
  },

  onShareAppMessage() {
    const { space } = this.data
    return {
      title: `${space.communityName} - ¥${space.pricePerHour}/小时共享车位`,
      path: `/pages/parking-detail/parking-detail?spaceId=${this.data.spaceId}`
    }
  }
})
