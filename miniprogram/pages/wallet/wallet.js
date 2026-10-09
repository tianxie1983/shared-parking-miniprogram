/**
 * 我的钱包（停车币 · 代币模式）
 * 充值：微信小程序虚拟支付 short_series_coin（固定单价代币，真实可接入）
 * 消费：预约下单时由后端从余额扣减，规避「道具价格固定 vs 订单金额动态」的冲突
 */
const { get, post } = require('../../utils/api')

const PRESETS = [1000, 3000, 5000, 10000, 20000, 50000] // 单位：分

Page({
  data: {
    balanceFen: 0,
    balanceText: '0.00',
    presets: PRESETS.map(f => ({ fen: f, yuan: (f / 100).toFixed(0) })),
    customYuan: '',
    coinOrders: [],
    paying: false
  },

  onShow() {
    this.loadBalance()
  },

  async loadBalance() {
    try {
      const res = await post('/wallet/balance')
      const balanceFen = res.data.balanceFen || 0
      const list = (res.data.coinOrders || []).map(c => ({
        orderId: c.orderId,
        amountText: (c.amountFen / 100).toFixed(2),
        timeText: this._fmt(c.createdAt),
        status: c.status,
        statusText: c.status === 1 ? '已到账' : '处理中'
      }))
      this.setData({ balanceFen, balanceText: (balanceFen / 100).toFixed(2), coinOrders: list })
    } catch (e) { /* silent */ }
  },

  onPresetTap(e) {
    const { fen } = e.currentTarget.dataset
    this.setData({ customYuan: (fen / 100).toFixed(2) })
  },

  onCustomInput(e) {
    this.setData({ customYuan: e.detail.value })
  },

  async onRecharge() {
    if (this.data.paying) return
    const yuan = parseFloat(this.data.customYuan)
    if (!yuan || yuan <= 0) {
      wx.showToast({ title: '请输入充值金额', icon: 'none' })
      return
    }
    const amountFen = Math.round(yuan * 100)
    this.setData({ paying: true })
    wx.showLoading({ title: '发起充值...' })
    try {
      const res = await post('/wallet/recharge', { amountFen })
      const vp = res.data
      // 演示模式：未配置真实虚拟支付密钥，后端直接入账
      if (vp.mock) {
        wx.hideLoading()
        wx.showToast({ title: '充值成功（演示）', icon: 'success' })
        this.loadBalance()
        return
      }
      wx.hideLoading()
      wx.requestVirtualPayment({
        mode: vp.mode || 'short_series_coin',
        signData: vp.signData,
        paySig: vp.paySig,
        signature: vp.signature,
        success: async () => {
          // 主动确认入账（兜底微信异步回调延迟），重复调用不会重复入账
          try { await post('/wallet/client-confirm', { outTradeNo: vp.outTradeNo }) } catch (e) { /* ignore */ }
          wx.showToast({ title: '充值成功', icon: 'success' })
          this.loadBalance()
        },
        fail: (err) => {
          const msg = (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) ? '已取消充值' : '充值失败'
          wx.showToast({ title: msg, icon: 'none' })
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '充值失败，请重试', icon: 'none' })
    } finally {
      this.setData({ paying: false })
    }
  },

  _fmt(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
})
