/**
 * 订单列表页
 * 支持按状态切换、刷新、加载更多
 */
const { get } = require('../../utils/api')

const STATUS_MAP = {
  0: '待支付',
  1: '待入场',
  2: '停车中',
  3: '已完成',
  4: '已取消',
  5: '争议中'
}

Page({
  data: {
    currentTab: -1,     // -1=全部
    orders: [],
    loading: true,
    refreshing: false,
    hasMore: true,
    page: 1,
    statusMap: STATUS_MAP,
    activeOrder: null
  },

  onLoad() {
    this.checkActiveOrder()
    this.loadOrders()
  },

  onShow() {
    this.checkActiveOrder()
    this.loadOrders()
  },

  /** 检查是否有活跃订单 */
  checkActiveOrder() {
    const active = wx.getStorageSync('active_order')
    if (active) {
      this.setData({ activeOrder: active })
    }
  },

  /** 加载订单 */
  async loadOrders(append = false) {
    if (!append) this.setData({ loading: true })
    try {
      const params = { page: this.data.page, pageSize: 10 }
      if (this.data.currentTab >= 0) params.status = this.data.currentTab

      const res = await get('/order/list', params)
      // WXML不支持.toFixed()方法调用，预先格式化金额
      const formattedList = (res.data.list || []).map(item => ({
        ...item,
        // 已完成订单用后端结算额（含多退少补）；其余回退"预付停车费+占座诚意金"
        totalAmount: (item.settledAmount != null
          ? item.settledAmount
          : ((item.amount || 0) + (item.reserveFee || 0))).toFixed(2)
      }))
      const list = append
        ? [...this.data.orders, ...formattedList]
        : formattedList

      this.setData({
        orders: list,
        loading: false,
        refreshing: false,
        hasMore: list.length < res.data.total
      })
    } catch (e) {
      this.setData({ loading: false, refreshing: false })
    }
  },

  /** 标签切换 */
  onTabChange(e) {
    const tab = Number(e.currentTarget.dataset.tab)
    this.setData({ currentTab: tab, page: 1, orders: [] })
    this.loadOrders()
  },

  /** 点击订单 */
  onOrderTap(e) {
    const { orderId } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/order/order?orderId=${orderId}` })
  },

  /** 快捷支付 */
  onQuickPay(e) {
    const { orderId } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/order/order?orderId=${orderId}` })
  },

  /** 活跃订单点击 */
  onActiveOrderTap() {
    const { orderId } = this.data.activeOrder
    if (orderId) {
      wx.navigateTo({ url: `/pages/order/order?orderId=${orderId}` })
    }
  },

  /** 下拉刷新 */
  onPullRefresh() {
    this.setData({ refreshing: true, page: 1 })
    this.loadOrders()
  },

  /** 上拉加载更多 */
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.loadOrders(true)
  }
})
