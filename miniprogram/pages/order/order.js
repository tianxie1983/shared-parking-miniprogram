/**
 * 订单详情页
 * 状态机：0-待支付 1-待入场 2-停车中 3-已完成 4-已取消 5-争议中
 * 对应方案：四.4.4 orders表 + 六.6.1 状态机设计
 */
const { get, post } = require('../../utils/api')

// 订单状态映射
const ORDER_STATUS = {
  0: { icon: '⏳', text: '待支付', desc: '请在15分钟内完成支付' },
  1: { icon: '📋', text: '待入场', desc: '请在预约时间到达车位' },
  2: { icon: '🅿️', text: '停车中', desc: '请按时离场，超时将影响信用' },
  3: { icon: '✅', text: '已完成', desc: '感谢使用邻里共享停车' },
  4: { icon: '❌', text: '已取消', desc: '订单已取消' },
  5: { icon: '⚠️', text: '争议中', desc: '平台正在处理您的投诉' }
}

Page({
  data: {
    orderId: null,
    order: { amount: 0, penaltyAmount: 0, orderStatus: 0 },
    statusConfig: ORDER_STATUS[0],
    showActions: true,
    // 超时预警
    isNearOvertime: false,
    parkingDuration: '00:00:00'
  },

  // 非响应式属性（不放 data）
  _timerInterval: null,

  onLoad(options) {
    const { orderId } = options
    if (orderId) {
      this.setData({ orderId })
      this.loadOrder(orderId)
    }
  },

  onShow() {
    if (this.data.orderId) this.loadOrder(this.data.orderId)
  },

  onUnload() {
    if (this._timerInterval) clearInterval(this._timerInterval)
  },

  async loadOrder(orderId) {
    try {
      const res = await get('/order/detail', { orderId })
      const order = res.data
      // WXML不支持.toFixed()方法调用，预先格式化金额
      const settled = (order.settledAmount != null)
        ? order.settledAmount
        : Math.round(((order.amount || 0) + (order.reserveFee || 0) + (order.penaltyAmount || 0) + (order.earlyFee || 0)) * 100) / 100
      order.amountFixed = (order.amount || 0).toFixed(2)                // 预付停车费
      order.penaltyAmountFixed = (order.penaltyAmount || 0).toFixed(2)
      order.reserveFeeFixed = (order.reserveFee || 0).toFixed(2)
      order.earlyFeeFixed = (order.earlyFee || 0).toFixed(2)
      order.actualParkingFeeFixed = (order.actualParkingFee || 0).toFixed(2)
      order.refundAmountFixed = (order.refundAmount || 0).toFixed(2)    // 多退
      order.extraAmountFixed = (order.extraAmount || 0).toFixed(2)      // 少补
      order.settledAmountFixed = settled.toFixed(2)                      // 结算合计（车位主实收）
      this.setData({
        order,
        statusConfig: ORDER_STATUS[order.orderStatus] || ORDER_STATUS[0],
        isNearOvertime: this._checkOvertime(order)
      })
      // 停车中 -> 启动计时器
      if (order.orderStatus === 2) this._startTimer(order)
    } catch (e) { /* silent */ }
  },

  /** 检查是否临近超时（距结束<15分钟进行预警）—— 方案6.1核心设计 */
  _checkOvertime(order) {
    if (order.orderStatus !== 2 || !order.endTime) return false
    const endTime = new Date(order.endTime).getTime()
    const now = Date.now()
    const left = (endTime - now) / 1000 / 60  // 剩余分钟
    return left < 15 && left > 0
  },

  /** 启动停车计时器 */
  _startTimer(order) {
    if (this._timerInterval) clearInterval(this._timerInterval)
    const startTime = order.actualStart ? new Date(order.actualStart).getTime() : Date.now()
    const update = () => {
      const now = Date.now()
      const diff = Math.max(0, now - startTime)
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      this.setData({
        parkingDuration: [h, m, s].map(v => String(v).padStart(2, '0')).join(':'),
        isNearOvertime: this._checkOvertime(order)
      })
    }
    update()
    this._timerInterval = setInterval(update, 1000)
  },

  /** 支付（待支付状态）—— 从钱包余额抵扣 */
  async onPay() {
    wx.showLoading({ title: '支付中...' })
    try {
      const res = await post('/order/pay', { orderId: this.data.orderId })
      wx.hideLoading()
      if (res.code === -2) {
        wx.showModal({
          title: '余额不足',
          content: '钱包余额不足，是否去充值？',
          confirmText: '去充值',
          success: (r) => { if (r.confirm) wx.navigateTo({ url: '/pages/wallet/wallet' }) }
        })
        return
      }
      if (res.code !== 0) {
        wx.showToast({ title: res.msg || '支付失败', icon: 'none' })
        return
      }
      wx.showToast({ title: '支付成功', icon: 'success' })
      setTimeout(() => this.loadOrder(this.data.orderId), 1200)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '支付失败，请重试', icon: 'none' })
    }
  },

  /** 确认入场（远程开闸）—— 方案6.3硬件适配层 */
  async onConfirmEnter() {
    wx.showLoading({ title: '开闸中...' })
    try {
      const res = await post('/order/enter', { orderId: this.data.orderId })
      wx.hideLoading()
      if (res.code === 0) {
        wx.showToast({ title: '开闸成功，请入场', icon: 'success' })
        setTimeout(() => this.loadOrder(this.data.orderId), 1500)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '开闸失败，请重试', icon: 'none' })
    }
  },

  /** 确认离场（远程开闸）—— 方案6.2支付-离场闭环 */
  async onConfirmExit() {
    wx.showLoading({ title: '处理中...' })
    try {
      const res = await post('/order/exit', { orderId: this.data.orderId })
      wx.hideLoading()
      const { isOvertime, penaltyAmount } = res.data
      if (isOvertime) {
        wx.showModal({
          title: '超时提醒',
          content: `您已超时停车，需支付违约金 ¥${penaltyAmount.toFixed(2)}。系统将自动扣款，信用分将扣减。`,
          showCancel: false,
          success: () => {
            this.loadOrder(this.data.orderId)
          }
        })
      } else {
        wx.showToast({ title: '开闸成功，请离场', icon: 'success' })
        setTimeout(() => this.loadOrder(this.data.orderId), 1500)
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },

  /** 投诉 */
  onComplaint() {
    wx.navigateTo({
      url: `/pages/complaint/complaint?orderId=${this.data.orderId}`
    })
  },

  /** 查看投诉记录 */
  onViewComplaints() {
    wx.navigateTo({
      url: '/pages/complaint-list/complaint-list'
    })
  },

  /** 取消订单 */
  onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '取消后不可恢复，确定取消吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await post('/order/cancel', { orderId: this.data.orderId })
            wx.showToast({ title: '已取消', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 1500)
          } catch (e) {
            wx.showToast({ title: '取消失败，请重试', icon: 'none' })
          }
        }
      }
    })
  }
})
