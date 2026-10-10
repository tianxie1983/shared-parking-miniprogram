/**
 * API 请求封装
 * 统一处理请求拦截、认证Token、错误处理
 * 通过本地后端服务器实现双端数据联动
 */
const { mockRequest } = require('./mock')
const app = getApp()

// 使用后端服务器（双端数据联动）。后端已改造为可经 GitHub 部署到公网（Render/Heroku 等）。
// 部署后，请将 app.js 的 globalData.baseUrl 替换为你的后端公网地址（如 https://your-app.onrender.com）。
const USE_MOCK = false

const BASE_URL = app?.globalData?.baseUrl || 'https://shared-parking-miniprogram-production.up.railway.app'

// 客户端类型：user / merchant
const CLIENT_TYPE = 'user'

/**
 * 统一请求方法
 * @param {Object} options
 * @param {string} options.url - 接口路径
 * @param {string} options.method - 请求方法
 * @param {Object} options.data - 请求参数
 * @param {boolean} options.noAuth - 是否需要跳过Token
 * @param {boolean} options.showLoading - 是否显示loading
 */
function request(options = {}) {
  const {
    url,
    method = 'GET',
    data = {},
    noAuth = false,
    showLoading = false,
    header = {}
  } = options

  if (showLoading) wx.showLoading({ title: '加载中...', mask: true })

  // Mock 拦截（开发模式）
  if (USE_MOCK) {
    return mockRequest(url, method, data)
      .then(res => {
        if (showLoading) wx.hideLoading()
        if (res.code === 0) return res
        wx.showToast({ title: res.msg || '请求失败', icon: 'none' })
        return Promise.reject(res)
      })
  }

  // 注入客户端类型标识
  header['X-Client-Type'] = CLIENT_TYPE

  // Token 注入
  if (!noAuth) {
    const token = wx.getStorageSync('token') || app?.globalData?.token
    if (token) header['Authorization'] = `Bearer ${token}`
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...header
      },
      success(res) {
        if (showLoading) wx.hideLoading()
        if (res.statusCode === 200) {
          const result = res.data
          if (result.code === 0) {
            resolve(result)
          } else if (result.code === 401) {
            wx.showToast({ title: '登录已过期，请重新授权', icon: 'none' })
            wx.removeStorageSync('token')
            reject(result)
          } else {
            wx.showToast({ title: result.msg || '请求失败', icon: 'none' })
            reject(result)
          }
        } else {
          wx.showToast({ title: `服务器异常(${res.statusCode})`, icon: 'none' })
          reject(res)
        }
      },
      fail(err) {
        if (showLoading) wx.hideLoading()
        wx.showToast({ title: '请先启动后端服务器', icon: 'none', duration: 3000 })
        reject(err)
      }
    })
  })
}

/**
 * GET 请求
 */
function get(url, data, options = {}) {
  return request({ url, method: 'GET', data, ...options })
}

/**
 * POST 请求
 */
function post(url, data, options = {}) {
  return request({ url, method: 'POST', data, ...options })
}

/**
 * PUT 请求
 */
function put(url, data, options = {}) {
  return request({ url, method: 'PUT', data, ...options })
}

/**
 * 上传文件（图片）
 */
function uploadFile({ filePath, formData = {} } = {}) {
  const token = wx.getStorageSync('token')
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/upload/image`,
      filePath,
      name: 'file',
      formData,
      header: {
        'Authorization': `Bearer ${token}`,
        'X-Client-Type': CLIENT_TYPE
      },
      success(res) {
        try {
          const data = JSON.parse(res.data)
          if (data.code === 0) resolve(data.data)
          else reject(data)
        } catch (e) {
          reject(res)
        }
      },
      fail: reject
    })
  })
}

module.exports = { request, get, post, put, uploadFile }
