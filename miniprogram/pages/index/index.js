/**
 * 首页 - 车位浏览
 * LBS定位 + 车位列表/地图切换 + 筛选
 * 对应方案：三.MVP核心功能清单 - 3.1 用户端
 */
const { get } = require('../../utils/api')

Page({
  data: {
    // 定位
    longitude: 109.4918,  // 默认延安市中心
    latitude: 36.5854,
    // 视图模式
    viewMode: 'list',     // list | map
    // 车位列表
    parkingList: [],
    loading: true,
    refreshing: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    // 筛选
    filterType: '',
    priceOrder: '',       // asc | desc | ''
    sortByDistance: false,
    certOnly: false,
    // 地图标记
    markers: []
  },

  onLoad() {
    this._firstLoad = true
    this.getLocation()
  },

  onShow() {
    // 首次加载由 getLocation 回调触发，避免重复请求
    if (this._firstLoad) {
      this._firstLoad = false
      return
    }
    // 每次返回首页时刷新，确保审核通过的车位及时展示
    this.loadParkingList()
  },

  /** 获取用户定位 */
  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          longitude: res.longitude,
          latitude: res.latitude
        })
        this.loadParkingList()
      },
      fail: () => {
        console.log('定位失败，使用默认位置')
        this.loadParkingList()
      }
    })
  },

  /** 加载车位列表 */
  async loadParkingList(append = false) {
    if (!append) this.setData({ loading: true })
    try {
      const res = await get('/parking/list', {
        longitude: this.data.longitude,
        latitude: this.data.latitude,
        page: this.data.page,
        pageSize: this.data.pageSize,
        priceOrder: this.data.priceOrder,
        sortByDistance: this.data.sortByDistance,
        certOnly: this.data.certOnly
      })
      const list = append
        ? [...this.data.parkingList, ...res.data.list]
        : res.data.list
      this.setData({
        parkingList: list,
        loading: false,
        refreshing: false,
        hasMore: list.length < res.data.total,
        markers: this._buildMarkers(list)
      })
    } catch (e) {
      this.setData({ loading: false, refreshing: false })
    }
  },

  /** 构建地图标记 */
  _buildMarkers(list) {
    return list.map(space => ({
      id: space.spaceId,
      longitude: space.longitude,
      latitude: space.latitude,
      iconPath: '/images/marker-parking.png',
      width: 36,
      height: 36,
      callout: {
        content: `${space.communityName}\n¥${space.pricePerHour}/h`,
        color: '#333',
        fontSize: 12,
        borderRadius: 8,
        padding: 8,
        display: 'BYCLICK'
      }
    }))
  },

  /** 切换列表/地图模式 */
  onToggleView() {
    const newMode = this.data.viewMode === 'list' ? 'map' : 'list'
    this.setData({ viewMode: newMode })
  },

  /** 筛选点击 */
  onFilterTap(e) {
    const type = e.currentTarget.dataset.type
    let { priceOrder, sortByDistance, certOnly } = this.data
    const filterType = this.data.filterType === type ? '' : type

    if (type === 'price') {
      priceOrder = priceOrder === '' ? 'asc' : priceOrder === 'asc' ? 'desc' : ''
      sortByDistance = false  // 互斥：价格和距离排序不能同时生效
    } else if (type === 'distance') {
      sortByDistance = !sortByDistance
      if (sortByDistance) priceOrder = ''  // 互斥
    } else if (type === 'cert') {
      certOnly = !certOnly
    }

    this.setData({
      filterType,
      priceOrder,
      sortByDistance,
      certOnly
    }, () => this.loadParkingList())
  },

  /** 点击车位卡片 -> 跳转详情 */
  onSpaceTap(e) {
    const { spaceId } = e.detail
    wx.navigateTo({ url: `/pages/parking-detail/parking-detail?spaceId=${spaceId}` })
  },

  /** 地图标记点击 */
  onMarkerTap(e) {
    const spaceId = e.detail.markerId
    wx.navigateTo({ url: `/pages/parking-detail/parking-detail?spaceId=${spaceId}` })
  },

  /** 地图区域变化 */
  onMapRegionChange(e) {
    if (e.type === 'end') {
      // 防抖：地图移动停止500ms后才重新搜索
      if (this._mapDebounce) clearTimeout(this._mapDebounce)
      this._mapDebounce = setTimeout(() => {
        this.loadParkingList()
      }, 500)
    }
  },

  /** 下拉刷新 */
  onPullRefresh() {
    this.setData({ refreshing: true, page: 1 })
    this.loadParkingList()
  },

  /** 上拉加载更多 */
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ page: this.data.page + 1 })
    this.loadParkingList(true)
  },

  /** 搜索栏点击 */
  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onRefresh() {
    this.loadParkingList()
  }
})
