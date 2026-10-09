/**
 * 车位卡片组件
 */
Component({
  properties: {
    spaceId: { type: Number, value: 0 },
    image: { type: String, value: '' },
    communityName: { type: String, value: '' },
    locationDetail: { type: String, value: '' },
    distance: { type: String, value: '' },
    pricePerHour: { type: Number, value: 0 },
    rating: { type: Number, value: 0 },
    successRate: { type: Number, value: 0 },
    isCertified: { type: Boolean, value: false },
    tags: { type: Array, value: [] },
    availableTime: { type: String, value: '' },
    showRating: { type: Boolean, value: true },
    showCert: { type: Boolean, value: true },
    showSchedule: { type: Boolean, value: true }
  },

  methods: {
    onTapCard() {
      this.triggerEvent('tap', {
        spaceId: this.properties.spaceId
      })
    }
  }
})
