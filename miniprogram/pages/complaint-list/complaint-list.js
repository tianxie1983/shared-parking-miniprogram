/**
 * 投诉记录页
 * 用户查看自己提交的投诉及处理结果
 */
const { get } = require('../../utils/api')

Page({
  data: {
    list: [],
    loading: true
  },

  onLoad() { this.loadList() },
  onShow() { this.loadList() },

  async loadList() {
    try {
      const res = await get('/complaint/my-list')
      const list = res.data.list || []
      // 预格式化状态
      list.forEach(item => {
        if (item.status === 'pending') {
          item.statusText = '处理中'
          item.statusClass = 'tag-yellow'
        } else if (item.status === 'resolved') {
          item.statusText = '已处理'
          item.statusClass = 'tag-green'
        } else if (item.status === 'rejected') {
          item.statusText = '已驳回'
          item.statusClass = 'tag-red'
        }
      })
      this.setData({ list, loading: false })
    } catch (e) {
      this.setData({ loading: false })
    }
  },

  /** 预览图片 */
  onPreviewPhoto(e) {
    const { url, urls } = e.currentTarget.dataset
    wx.previewImage({ urls, current: url })
  }
})
