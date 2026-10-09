/**
 * 个人中心（用户纯享版）
 * 仅用户功能，无商户管理入口
 */
const app = getApp()
const { post } = require('../../utils/api')

Page({
  data: {
    userInfo: {},
    creditScore: 100,
    isAuth: false,
    balanceText: '0.00'
  },

  onShow() {
    const { userInfo, creditScore, isAuth } = app.globalData
    this.setData({
      userInfo: userInfo || {},
      creditScore: creditScore || 100,
      isAuth: isAuth || false
    })
    this.loadBalance()
  },

  async loadBalance() {
    try {
      const res = await post('/wallet/balance')
      this.setData({ balanceText: ((res.data.balanceFen || 0) / 100).toFixed(2) })
    } catch (e) { /* silent */ }
  },

  onGoAuth() {
    wx.navigateTo({ url: '/pages/auth/auth' })
  },

  onGoWallet() {
    wx.navigateTo({ url: '/pages/wallet/wallet' })
  },

  onGoCredit() {
    wx.navigateTo({ url: '/pages/credit/credit' })
  },

  onTapMenuItem(e) {
    const { page } = e.currentTarget.dataset
    // tabBar 页面必须用 switchTab，普通页面用 navigateTo
    const tabBarRoutes = ['/pages/orders/orders']
    const routes = {
      'wallet': '/pages/wallet/wallet',
      'my-spaces': '/pages/my-spaces/my-spaces',
      'my-parked': '/pages/orders/orders',
      'complaint-list': '/pages/complaint-list/complaint-list',
      'credit': '/pages/credit/credit',
      'billing': '/pages/billing/billing',
      'advance': '/pages/advance/advance',
      'help': '/pages/help/help',
      'about': '/pages/about/about'
    }
    if (routes[page]) {
      const url = routes[page]
      if (tabBarRoutes.includes(url)) {
        wx.switchTab({ url })
      } else {
        wx.navigateTo({ url })
      }
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' })
    }
  }
})
