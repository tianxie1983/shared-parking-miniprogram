/**
 * 我的车位管理页
 * 用户查看自己发布的车位（含审核中、已上架、已驳回）
 */
const { get, post } = require('../../utils/api')
const { MOCK_USER } = require('../../utils/mock')

Page({
  data: {
    spaces: [],
    loading: true,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0
  },

  onLoad() { this.loadSpaces() },
  onShow() { this.loadSpaces() },

  /** 加载我发布的车位 */
  async loadSpaces() {
    try {
      const res = await get('/parking/my-spaces')
      const allSpaces = res.data.list || []

      this.setData({
        spaces: allSpaces,
        loading: false,
        approvedCount: allSpaces.filter(s => s.auditStatus === 1).length,
        pendingCount: allSpaces.filter(s => s.auditStatus === 0).length,
        rejectedCount: allSpaces.filter(s => s.auditStatus === 2).length
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  /** 发布新车位 */
  onPublish() {
    wx.switchTab({ url: '/pages/publish/publish' })
  },

  /** 编辑车位 */
  onEditSpace(e) {
    const spaceId = e.currentTarget.dataset.id
    wx.showToast({ title: '编辑功能开发中', icon: 'none' })
  },

  /** 上架/下架 */
  async onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset
    const newStatus = Number(status) === 1 ? 0 : 1
    wx.showModal({
      title: '确认操作',
      content: newStatus === 0 ? '下架后用户将无法搜索到该车位，确认下架？' : '上架后用户可以搜索到该车位，确认上架？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            await post('/parking/toggle-status', { spaceId: id, status: newStatus })
            wx.hideLoading()
            wx.showToast({ title: newStatus === 1 ? '已上架' : '已下架', icon: 'success' })
            this.loadSpaces()
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  }
})
