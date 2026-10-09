/**
 * 认证工具模块
 * 微信授权登录、实名认证
 */
const { request } = require('./api')

/**
 * 静默登录
 */
async function login(code) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: { code },
    noAuth: true
  })
}

/**
 * 获取用户信息
 */
async function getUserInfo() {
  return request({ url: '/auth/userinfo' })
}

/**
 * 实名认证
 */
async function submitAuth(data) {
  return request({
    url: '/auth/verify',
    method: 'POST',
    data
  })
}

/**
 * 获取微信手机号
 */
async function getPhoneNumber(e) {
  if (!e.detail.code) {
    wx.showToast({ title: '授权获取手机号失败', icon: 'none' })
    return null
  }
  return request({
    url: '/auth/bind-phone',
    method: 'POST',
    data: { code: e.detail.code }
  })
}

/**
 * 检查是否已认证
 */
function checkAuth() {
  const app = getApp()
  return app.globalData.isAuth
}

module.exports = {
  login,
  getUserInfo,
  submitAuth,
  getPhoneNumber,
  checkAuth
}
