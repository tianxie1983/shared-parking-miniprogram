/**
 * 搜索页 - 按小区名/地址搜索车位
 */
const { get } = require('../../utils/api')

Page({
  data: {
    keyword: '',
    autoFocus: true,
    searched: false,
    resultList: [],
    historyList: [],
    hotKeywords: [],
    longitude: 109.4918,
    latitude: 36.5854
  },

  onLoad() {
    const history = wx.getStorageSync('search_history') || []
    this.setData({ historyList: history })
    // 获取用户定位用于距离计算
    wx.getLocation({
      type: 'gcj02',
      success: (res) => this.setData({ longitude: res.longitude, latitude: res.latitude }),
      fail: () => {}
    })
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    const keyword = (this.data.keyword || '').trim()
    if (!keyword) return
    this._saveHistory(keyword)
    this._doSearch(keyword)
  },

  onClear() {
    this.setData({ keyword: '', searched: false, resultList: [] })
  },

  onCancel() {
    wx.navigateBack()
  },

  onHistoryTap(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this._saveHistory(keyword)
    this._doSearch(keyword)
  },

  onClearHistory() {
    wx.removeStorageSync('search_history')
    this.setData({ historyList: [] })
    wx.showToast({ title: '已清空', icon: 'none' })
  },

  onReset() {
    this.setData({ keyword: '', searched: false, resultList: [] })
  },

  onSpaceTap(e) {
    const { spaceId } = e.detail
    wx.navigateTo({ url: `/pages/parking-detail/parking-detail?spaceId=${spaceId}` })
  },

  _saveHistory(keyword) {
    let history = wx.getStorageSync('search_history') || []
    history = history.filter(k => k !== keyword)
    history.unshift(keyword)
    if (history.length > 10) history = history.slice(0, 10)
    wx.setStorageSync('search_history', history)
    this.setData({ historyList: history })
  },

  async _doSearch(keyword) {
    wx.showLoading({ title: '搜索中...', mask: true })
    try {
      const res = await get('/parking/search', {
        keyword,
        longitude: this.data.longitude,
        latitude: this.data.latitude
      })
      this.setData({
        searched: true,
        resultList: res.data.list
      })
    } catch (e) {
      this.setData({ searched: true, resultList: [] })
    } finally {
      wx.hideLoading()
    }
  }
})
