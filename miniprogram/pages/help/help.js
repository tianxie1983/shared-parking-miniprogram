/**
 * 帮助与反馈
 */
Page({
  data: {
    faqList: [
      { id: 1, question: '如何预约车位？', answer: '在首页找到合适车位，点击进入详情页，选择需要的时段后点击"立即预约"即可。车位按"时段窗口"占用：你预约的时段会被锁定，其余时段仍可被他人预约；该时段确认离场后自动释放。', open: false },
      { id: 2, question: '超时了怎么办？', answer: '超过预约结束时间15分钟后开始计超时费，按双倍时价计算，并扣信用分10分/次。请尽量按时离场。', open: false },
      { id: 3, question: '到场后发现车位被占怎么办？', answer: '请在订单页点击"投诉"，上传现场照片并描述情况。平台核实后会全额退款，并对车位主人扣除信用分。', open: false },
      { id: 4, question: '如何发布自己的车位？', answer: '点击底部"发布"Tab，填写车位信息（小区、位置、照片、产权证明），设置共享时段和价格，提交后等待平台审核（通常1-2个工作日）。', open: false },
      { id: 5, question: '预订费和信用分是什么？', answer: '预约需支付"占座预付费"与"预约时段计费"两笔合计费用，占座预付费为独立费用（不抵扣停车费）。若爽约（预约开始后取消或未到场）则占座预付费不退，并扣信用分20分/次。信用分初始100分，超时扣10分/次，爽约扣20分/次；低于60分限制预约，低于40分冻结账号。', open: false },
      { id: 6, question: '收益怎么提现？', answer: '车位出租收益实时到账，可在"我的-我的收益"中查看。点击提现按钮，金额将转入您的微信钱包（需实名认证）。', open: false }
    ],
    feedbackType: 'suggest',
    feedbackContent: ''
  },

  onToggleFaq(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.faqList.map(item => {
      if (item.id === id) item.open = !item.open
      return item
    })
    this.setData({ faqList: list })
  },

  onSelectType(e) {
    this.setData({ feedbackType: e.currentTarget.dataset.type })
  },

  onFeedbackInput(e) {
    this.setData({ feedbackContent: e.detail.value })
  },

  onSubmitFeedback() {
    const content = this.data.feedbackContent.trim()
    if (content.length < 10) {
      wx.showToast({ title: '请至少输入10字', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中...' })
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({ title: '反馈已提交，感谢！', icon: 'success' })
      this.setData({ feedbackContent: '' })
    }, 800)
  },

  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-000-0000\n\n您也可以通过微信公众平台留言，我们会在24小时内回复。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
