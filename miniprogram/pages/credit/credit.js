const { get } = require('../../utils/api')

Page({
  data: {
    creditData: { score: 100, records: [] },
    scoreLevel: { text: '优秀', color: '#07C160' },
    penaltyRules: [
      { label: '超时占用（首次）', score: 10 },
      { label: '超时占用（第2次）', score: 20 },
      { label: '爽约（未到场）', score: 15 },
      { label: '投诉成立', score: 30 }
    ]
  },

  onLoad() { this.loadCredit() },

  async loadCredit() {
    try {
      const res = await get('/credit/info')
      const data = res.data
      this.setData({
        creditData: data,
        scoreLevel: this._getScoreLevel(data.score)
      })
    } catch (e) { /* silent */ }
  },

  _getScoreLevel(score) {
    if (score >= 80) return { text: '优秀', color: '#07C160' }
    if (score >= 60) return { text: '良好', color: '#FFC300' }
    return { text: '受限', color: '#FA5151' }
  }
})
