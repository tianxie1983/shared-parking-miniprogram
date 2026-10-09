/**
 * 邻里共享停车 小程序（用户纯享版）
 * 全局入口
 */
const { login, checkAuth } = require('./utils/auth')

App({
  globalData: {
    userInfo: null,
    isAuth: false,
    creditScore: 100,
    baseUrl: 'https://YOUR-BACKEND-ONRENDER.com', // 部署后端后替换为你的公网地址（见项目根 README）
    userId: null,
    token: null
  },

  onLaunch() {
    // 登录
    this._doLogin()
  },

  onShow() {
    // 检查是否有待处理订单提醒
    this._checkPendingOrder()
  },

  /** 静默登录 */
  async _doLogin() {
    try {
      const { code } = await wx.login()
      const res = await login(code)
      if (res.code === 0) {
        this.globalData.token = res.data.token
        this.globalData.userId = res.data.userId
        this.globalData.userInfo = res.data.userInfo
        this.globalData.isAuth = res.data.isAuth
        this.globalData.creditScore = res.data.creditScore || 100
        wx.setStorageSync('token', res.data.token)
      }
    } catch (e) {
      console.error('Login failed:', e)
    }
  },

  /** 检查待处理订单 */
  _checkPendingOrder() {
    // 从缓存检查是否有未完成订单
    const activeOrder = wx.getStorageSync('active_order')
    if (activeOrder) {
      this._showOrderReminder(activeOrder)
    }
  },

  _showOrderReminder(order) {
    // 停车中超时预警
    if (order.orderStatus === 2) {
      const endTime = new Date(order.endTime).getTime()
      const now = Date.now()
      const timeLeft = endTime - now
      if (timeLeft < 15 * 60 * 1000 && timeLeft > 0) {
        wx.showToast({ title: '停车即将超时，请注意', icon: 'none', duration: 3000 })
      }
    }
  }
})
