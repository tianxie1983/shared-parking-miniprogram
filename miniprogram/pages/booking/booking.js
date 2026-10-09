/**
 * 预约支付页
 * 核心：订单创建 + 微信小程序虚拟支付(wx.requestVirtualPayment) + 双重确认轮询
 * 对应方案：六.针对七大风险的专项技术设计 - 6.2 支付-离场可靠性
 */
const { get, post } = require('../../utils/api')

Page({
  data: {
    spaceId: null,
    space: { photos: [], schedules: [], pricePerHour: 0, auditStatus: 0 },
    bookingDate: '',
    startTime: '',
    endTime: '',
    today: '',
    duration: 0,
    durationMin: 0,
    totalAmount: 0,
    reserveFee: 0,      // 占座预付费（独立费用，爽约不退）
    parkingFee: 0,      // 预约时段计费（停车费）
    canPay: false,
    paying: false,
    balanceText: '0.00', // 钱包余额（元）
    balanceFen: 0,       // 钱包余额（分）
    needText: '0.00',    // 本次应付（元）
    needFen: 0,          // 本次应付（分）
    insufficient: false, // 余额不足
    // 当前日期对应的可预约时段
    availableRange: '',
    availableStart: '00:00',
    availableEnd: '23:59',
    // 当日时段占用情况（由后端按订单窗口派生）
    bookedSlots: [],
    freeSlots: [],
    // 支付确认轮询
    pollingTimer: null,
    pollingCount: 0
  },

  onLoad(options) {
    const { spaceId } = options
    if (!spaceId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    this.setData({
      spaceId,
      today: this._formatDate(new Date())
    })
    this.loadSpaceInfo(spaceId)
    this.loadBalance()
  },

  onUnload() {
    this._clearPolling()
  },

  async loadSpaceInfo(spaceId) {
    try {
      const res = await get('/parking/detail', { spaceId })
      this.setData({ space: res.data })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /** 选择日期 — 根据星期几匹配可预约时段 */
  onDateChange(e) {
    const dateStr = e.detail.value
    const date = new Date(dateStr)
    // JS getDay(): 0=周日, 1=周一... 转换为 1=周一...7=周日
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    const schedules = this.data.space.schedules || []
    const matched = schedules.find(s => s.weekday === weekday)

    if (matched) {
      this.setData({
        bookingDate: dateStr,
        startTime: '',
        endTime: '',
        availableRange: `${matched.startTime}-${matched.endTime}`,
        availableStart: matched.startTime,
        availableEnd: matched.endTime,
        canPay: false,
        totalAmount: 0,
        duration: 0
      })
      this.loadAvailability(dateStr)
    } else {
      // 该日期没有可预约时段
      this.setData({
        bookingDate: dateStr,
        startTime: '',
        endTime: '',
        availableRange: '',
        canPay: false,
        totalAmount: 0,
        duration: 0,
        bookedSlots: [],
        freeSlots: []
      })
      const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      wx.showToast({ title: `${weekdayNames[date.getDay()]}不可预约`, icon: 'none' })
    }
  },

  /** 选择开始时间 */
  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value }, () => this._calcAmount())
  },

  /** 选择结束时间 */
  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value }, () => this._calcAmount())
  },

  /** 计算费用 — 30分钟为最小计费单位，同时验证时段范围 */
  _calcAmount() {
    const { bookingDate, startTime, endTime, space, availableStart, availableEnd } = this.data
    if (!bookingDate || !startTime || !endTime) return

    // 验证预约时间在可预约范围内
    if (availableStart && availableEnd) {
      if (startTime < availableStart || endTime > availableEnd) {
        wx.showToast({ title: `请在可预约时段 ${availableStart}-${availableEnd} 内选择`, icon: 'none', duration: 2500 })
        this.setData({ canPay: false, totalAmount: 0, duration: 0 })
        return
      }
    }

    const start = new Date(`${bookingDate} ${startTime}`)
    const end = new Date(`${bookingDate} ${endTime}`)
    if (end <= start) {
      wx.showToast({ title: '结束时间必须大于开始时间', icon: 'none' })
      this.setData({ canPay: false })
      return
    }

    // 验证：如果是今天，开始时间必须在未来
    const now = new Date()
    const todayStr = this._formatDate(now)
    if (bookingDate === todayStr && start.getTime() <= now.getTime()) {
      wx.showToast({ title: '开始时间已过，请选择未来时间', icon: 'none', duration: 2500 })
      this.setData({ canPay: false, totalAmount: 0, duration: 0 })
      return
    }

    const durationMs = end.getTime() - start.getTime()
    const durationMin = durationMs / (1000 * 60)
    // 30分钟为最小计费单位，不足30分钟按30分钟算
    const billingUnits = Math.ceil(durationMin / 30)
    const durationHours = billingUnits * 0.5
    const parkingFee = (billingUnits * space.pricePerHour * 0.5).toFixed(2)
    // 占座预付费：首30分钟费用，不低于2元（独立费用，不抵扣停车费）
    const reserveFee = Math.max(2, Math.round(space.pricePerHour * 0.5 * 100) / 100)

    // 校验：所选时段不得与已预约时段重叠（按订单窗口派生）
    if (this._overlapBooked(startTime, endTime)) {
      wx.showToast({ title: '该时段中已有被预约的部分，请重新选择', icon: 'none', duration: 2500 })
      this.setData({ canPay: false, totalAmount: 0, duration: 0 })
      return
    }

    // 合计 = 预约时段计费 + 占座预付费
    const totalAmount = Math.round((parseFloat(parkingFee) + reserveFee) * 100) / 100
    const needFen = Math.round(totalAmount * 100)
    const insufficient = this.data.balanceFen < needFen

    this.setData({
      duration: durationHours,
      durationMin: Math.round(durationMin),
      parkingFee: parseFloat(parkingFee),
      totalAmount,
      reserveFee,
      needFen,
      needText: totalAmount.toFixed(2),
      insufficient,
      canPay: true
    })
  },

  /** 拉取钱包余额（用于余额抵扣判断） */
  async loadBalance() {
    try {
      const res = await post('/wallet/balance')
      const balanceFen = res.data.balanceFen || 0
      this.setData({
        balanceFen,
        balanceText: (balanceFen / 100).toFixed(2),
        insufficient: this.data.needFen > 0 && balanceFen < this.data.needFen
      })
    } catch (e) { /* silent */ }
  },

  /** 余额不足，跳转充值 */
  onGoRecharge() {
    wx.navigateTo({ url: '/pages/wallet/wallet' })
  },

  /** 拉取当日时段占用情况（后端按订单窗口派生） */
  async loadAvailability(dateStr) {
    try {
      const res = await get('/booking/availability', { spaceId: this.data.spaceId, date: dateStr })
      const d = res.data || {}
      this.setData({ bookedSlots: d.bookedSlots || [], freeSlots: d.freeSlots || [] })
    } catch (e) {
      this.setData({ bookedSlots: [], freeSlots: [] })
    }
  },

  /** 点击可预约时段快速填充起止时间 */
  onFreeSlotTap(e) {
    const { start, end } = e.currentTarget.dataset
    this.setData({ startTime: start, endTime: end }, () => this._calcAmount())
  },

  /** 判断 [start,end] 是否与已预约时段重叠 */
  _overlapBooked(start, end) {
    const s = this._toMin(start)
    const e = this._toMin(end)
    return (this.data.bookedSlots || []).some(([bs, be]) => {
      const bS = this._toMin(bs)
      const bE = this._toMin(be)
      return s < bE && e > bS
    })
  },

  _toMin(t) {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  },

  /** 创建订单并支付 —— 核心流程（钱包余额抵扣） */
  async onPayTap() {
    if (this.data.paying) return
    this.setData({ paying: true })

    try {
      // 客户端前置校验：与已预约时段窗口重叠则直接拦截（服务端仍会二次校验）
      if (this._overlapBooked(this.data.startTime, this.data.endTime)) {
        wx.showToast({ title: '该时段已被占用，请重新选择', icon: 'none' })
        this.setData({ paying: false })
        return
      }
      // 步骤1：创建订单（服务端做冲突检测）
      const orderRes = await post('/order/create', {
        spaceId: this.data.spaceId,
        startTime: `${this.data.bookingDate} ${this.data.startTime}:00`,
        endTime: `${this.data.bookingDate} ${this.data.endTime}:00`,
        amount: this.data.parkingFee,
        reserveFee: this.data.reserveFee
      })

      const order = orderRes.data
      if (!order || order.orderStatus !== 0) {
        wx.showToast({ title: '预约冲突，该时段已被占用', icon: 'none' })
        this.setData({ paying: false })
        return
      }

      // 步骤2：从钱包余额扣减（停车费 + 占座诚意金）。支付走「代币模式」，充值时才调微信。
      const payRes = await post('/order/pay', { orderId: order.orderId })
      if (payRes.code === -2) {
        // 余额不足，提示并跳转充值
        wx.showModal({
          title: '余额不足',
          content: `本次需 ¥${this.data.needText}，钱包余额 ¥${this.data.balanceText}，是否去充值？`,
          confirmText: '去充值',
          success: (r) => {
            if (r.confirm) wx.navigateTo({ url: '/pages/wallet/wallet' })
          }
        })
        this.setData({ paying: false })
        return
      }
      if (payRes.code !== 0) {
        wx.showToast({ title: payRes.msg || '支付失败', icon: 'none' })
        this.setData({ paying: false })
        return
      }

      wx.showToast({ title: '支付成功', icon: 'success' })
      this._onPaySuccess(order.orderId)
    } catch (e) {
      // api.js 已对非0 code 弹出过 toast，这里只处理网络等异常
      if (!e || e.code === undefined) {
        wx.showToast({ title: '下单失败，请重试', icon: 'none' })
      }
      this.setData({ paying: false })
    }
  },

  /** 支付成功后的双重确认 —— 方案6.2核心设计 */
  _onPaySuccess(orderId) {
    // 缓存活跃订单（用于入场/离场提醒），字段名与全局一致
    wx.setStorageSync('active_order', {
      orderId,
      orderStatus: 1,
      startTime: `${this.data.bookingDate} ${this.data.startTime}:00`,
      endTime: `${this.data.bookingDate} ${this.data.endTime}:00`
    })

    wx.showToast({ title: '支付成功！', icon: 'success', duration: 2000 })

    // 双重确认机制：前端轮询 + 后端异步通知
    this._startPolling(orderId)
  },

  /** 前端轮询确认（每3秒一次，持续60秒）—— 方案6.2核心设计 */
  _startPolling(orderId) {
    this.setData({ pollingCount: 0 })
    const maxPolls = 20  // 3s * 20 = 60s

    const poll = async () => {
      this.data.pollingCount++
      try {
        const res = await get('/order/detail', { orderId })
        const order = res.data

        if (order.orderStatus >= 1) {
          // 订单已确认（待入场/停车中）
          this._clearPolling()
          wx.redirectTo({ url: `/pages/order/order?orderId=${orderId}` })
          return
        }

        if (this.data.pollingCount >= maxPolls) {
          // 轮询超时，不再轮询，但订单仍有效
          this._clearPolling()
          console.log('Polling timeout, redirect to order detail')
          wx.redirectTo({ url: `/pages/order/order?orderId=${orderId}` })
          return
        }

        // 继续轮询
        this.data.pollingTimer = setTimeout(poll, 3000)
      } catch (e) {
        this._clearPolling()
        wx.redirectTo({ url: `/pages/order/order?orderId=${orderId}` })
      }
    }

    this.data.pollingTimer = setTimeout(poll, 3000)
  },

  _clearPolling() {
    if (this.data.pollingTimer) {
      clearTimeout(this.data.pollingTimer)
      this.data.pollingTimer = null
    }
  },

  _formatDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
