/**
 * 声明与免责说明确认页（启动页）
 * 仅在首次打开时显示：同意后将标记写入本地存储，之后直接进入首页。
 * 文案为共享停车场景标准模板，可随时在「我的-关于」中再次查看。
 */
const HOME_PAGE = '/pages/index/index'
const STORAGE_KEY = 'disclaimer_agreed'

Page({
  data: {
    agreed: false,
    sections: [
      {
        title: '一、平台定位',
        body: '本平台为车位供需信息撮合与在线预约工具，不直接拥有、运营或管理任何车位，亦非停车场经营管理者。平台仅提供信息发布、搜索匹配、在线预约及支付结算等技术服务。'
      },
      {
        title: '二、信息真实性',
        body: '车位的位置、价格、可预约时段、开放规则等信息由发布方（车位主/商户）自行填写并承担全部真实性与合法性责任。平台已尽合理审核义务，但不保证信息的绝对准确、完整、及时。您预约前请自行核实。'
      },
      {
        title: '三、停车安全与风险',
        body: '您停放车辆时须遵守小区/停车场管理规定，规范泊车。因车辆剐蹭、碰撞、被盗、车内物品遗失、自然灾害、第三方行为或车位主/物业管理原因造成的任何损失，平台不承担任何赔偿或连带责任，相关责任由侵权方或保险机构依法承担。'
      },
      {
        title: '四、入场与离场',
        body: '您须按预约时段出入场，配合门禁/道闸识别。超时占用将按平台规则双倍计费并扣减信用分；爽约（已支付但未到场）将扣除预订费并扣减信用分。具体以《计费规则说明》及订单约定为准。'
      },
      {
        title: '五、费用与支付',
        body: '预约费用、占座预付费、提前加价、超时违约金等以订单页面展示为准。支付即视为同意对应计费规则。如遇争议，可通过平台投诉通道申请处理。'
      },
      {
        title: '六、个人信息',
        body: '为提供预约与身份核验服务，平台将依据《隐私政策》收集并使用您的位置、手机号、实名信息等。您有权撤回授权，但可能影响部分功能使用。'
      },
      {
        title: '七、责任限制',
        body: '在法律允许的最大范围内，平台对因不可抗力、网络故障、第三方服务中断或您自身原因导致的损失不承担责任。平台保留对违规账号限制、封禁及追究法律责任的权利。'
      },
      {
        title: '八、法律适用',
        body: '本声明的解释、效力及争议解决均适用中华人民共和国大陆地区法律。如本声明部分条款无效，不影响其余条款效力。'
      }
    ]
  },

  onLoad() {
    // 已同意过则直接跳过，进入首页
    const agreed = wx.getStorageSync(STORAGE_KEY)
    if (agreed) {
      wx.reLaunch({ url: HOME_PAGE })
    }
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  onAgree() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先勾选同意', icon: 'none' })
      return
    }
    wx.setStorageSync(STORAGE_KEY, true)
    wx.reLaunch({ url: HOME_PAGE })
  },

  onDecline() {
    wx.showModal({
      title: '温馨提示',
      content: '需同意声明与免责条款后方可使用本小程序。是否退出？',
      confirmText: '退出',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          // 仅在通过特定场景打开时可用，失败时忽略并停留在当前页
          try { wx.exitMiniProgram({ success() {}, fail() {} }) } catch (e) {}
        }
      }
    })
  }
})
