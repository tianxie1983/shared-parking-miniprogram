/**
 * 进阶页：真实微信登录 + 地图选点
 * 教学演示页面，集中展示两项进阶能力：
 *   1) 真实微信登录：wx.login 拿 code → 后端用 jscode2session 换 openid
 *   2) 地图选点：wx.chooseLocation 原生选址 + 点击地图打点 + Haversine 距离
 */
const { post } = require('../../utils/api')
const app = getApp()

// 示例参照车位：用于演示「选中点到车位的距离」。真实场景应替换为后端返回的车位坐标。
const REFERENCE = { lng: 109.4918, lat: 36.5833, name: '阳光花园（示例参照车位）' }

Page({
  data: {
    // —— 登录状态 ——
    loggedIn: false,
    openidMasked: '',
    tokenMasked: '',
    nickName: '',
    avatarUrl: '',
    mockMode: false,
    loginTime: '',

    // —— 地图选点 ——
    map: {
      latitude: REFERENCE.lat,
      longitude: REFERENCE.lng,
      markers: [{
        id: 0,
        latitude: REFERENCE.lat,
        longitude: REFERENCE.lng,
        title: REFERENCE.name,
        width: 32,
        height: 32
      }],
      address: '',
      distanceText: ''
    }
  },

  onLoad() {
    // 恢复上一次本机登录态（本地缓存，仅演示用）
    const loginInfo = wx.getStorageSync('advance_login')
    if (loginInfo && loginInfo.openid) {
      this._applyLoginInfo(loginInfo)
    }
  },

  /** 真实微信登录：wx.login -> 后端 jscode2session 换 openid */
  async onWechatLogin() {
    wx.showLoading({ title: '登录中...' })
    try {
      const { code } = await wx.login()
      const res = await post('/auth/login', { code }, { noAuth: true })
      if (res.code === 0) {
        const d = res.data
        // 写入全局与本地，供其它接口鉴权
        app.globalData.token = d.token
        app.globalData.userId = d.userId
        wx.setStorageSync('token', d.token)

        const info = {
          openid: d.openid,
          token: d.token,
          nickName: (d.userInfo && d.userInfo.nickName) || '',
          avatarUrl: (d.userInfo && d.userInfo.avatarUrl) || '',
          mockMode: !!d.mockMode,
          loginTime: this._now()
        }
        wx.setStorageSync('advance_login', info)
        this._applyLoginInfo(info)
        wx.showToast({ title: d.mockMode ? '演示模式登录' : '微信登录成功', icon: 'none' })
      } else {
        wx.showToast({ title: res.msg || '登录失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '登录失败：' + (e.msg || '请先启动后端'), icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  _applyLoginInfo(info) {
    const openid = info.openid || ''
    const token = info.token || ''
    this.setData({
      loggedIn: true,
      openidMasked: openid ? openid.slice(0, 6) + '****' + openid.slice(-4) : '',
      tokenMasked: token ? token.slice(0, 12) + '…' : '',
      nickName: info.nickName || '',
      avatarUrl: info.avatarUrl || '',
      mockMode: info.mockMode,
      loginTime: info.loginTime || ''
    })
  },

  _now() {
    const d = new Date()
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },

  onLogout() {
    wx.removeStorageSync('advance_login')
    wx.removeStorageSync('token')
    app.globalData.token = null
    this.setData({
      loggedIn: false,
      openidMasked: '',
      tokenMasked: '',
      nickName: '',
      avatarUrl: '',
      mockMode: false,
      loginTime: ''
    })
  },

  // —— 头像昵称（微信推荐的新版做法：button open-type + input type=nickname）——
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({ avatarUrl })
    this._mergeLoginInfo({ avatarUrl })
  },

  onNicknameInput(e) {
    const nickName = e.detail.value
    this.setData({ nickName })
    this._mergeLoginInfo({ nickName })
  },

  _mergeLoginInfo(patch) {
    const info = wx.getStorageSync('advance_login') || {}
    Object.assign(info, patch)
    wx.setStorageSync('advance_login', info)
  },

  // —— 地图选点 ——
  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this._setPickedPoint(res.longitude, res.latitude, res.address || res.name)
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return
        wx.showToast({ title: '选址失败，请检查定位权限', icon: 'none' })
      }
    })
  },

  // 直接点击地图打点
  onMapTap(e) {
    const { longitude, latitude } = e.detail
    if (longitude == null || latitude == null) return
    this._setPickedPoint(longitude, latitude, '地图手动选点')
  },

  _setPickedPoint(lng, lat, address) {
    const distance = this.calcDistance(lng, lat, REFERENCE.lng, REFERENCE.lat)
    const distanceText = distance < 1
      ? Math.round(distance * 1000) + ' 米'
      : distance.toFixed(2) + ' 公里'
    this.setData({
      'map.longitude': lng,
      'map.latitude': lat,
      'map.address': address,
      'map.distanceText': `距${REFERENCE.name} 约 ${distanceText}`,
      'map.markers': [{
        id: 1,
        latitude: lat,
        longitude: lng,
        title: address || '已选点',
        width: 32,
        height: 32,
        callout: {
          content: address || '已选点',
          color: '#07C160',
          fontSize: 12,
          bgColor: '#ffffff',
          padding: 6,
          borderRadius: 4,
          display: 'ALWAYS'
        }
      }]
    })
  },

  // Haversine 球面距离（与后端 calcDistance 同算法）
  calcDistance(lng1, lat1, lng2, lat2) {
    const R = 6371
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
})
