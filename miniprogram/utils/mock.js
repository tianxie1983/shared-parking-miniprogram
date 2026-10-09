/**
 * Mock 数据层（用户纯享版）
 * 模拟后端 Spring Boot API 响应
 *
 * 本版本不含任何示例/演示数据，所有列表初始为空。
 * 开发模式下用户操作产生的数据通过 wx.setStorageSync 持久化。
 * 上线后将 USE_MOCK 设为 false，切换到真实后端接口。
 *
 * 数据库表结构参考：
 *   users: user_id / openid / phone / real_name / id_card / credit_score / status
 *   parking_spaces: space_id / owner_id / community_name / location_detail / lng/lat / photos / property_cert / audit_status
 *   sharing_schedules: schedule_id / space_id / weekday / start_time / end_time / price_per_hour
 *   orders: order_id / lessee_id / space_id / start_time / end_time / amount / penalty_amount / order_status / pay_status
 *   credit_records: record_id / user_id / event_type / score_change / order_id / description
 */

// ==================== 持久化存储（模拟数据库） ====================
// 使用 wx.setStorageSync 持久化，确保 app 重启 / 重新登录后数据不丢失
const STORAGE_KEYS = {
  APPROVED_SPACES: 'mock_approved_spaces',    // 审核通过的车位（首页可见）
  PENDING_SPACES: 'mock_pending_spaces',      // 待审核的车位
  PENDING_COMPLAINTS: 'mock_pending_complaints', // 待处理投诉
  ORDERS: 'mock_runtime_orders',              // 运行时创建的订单
  CREDIT_RECORDS: 'mock_credit_records',      // 信用记录
  USER: 'mock_user'                           // 用户信息（realName/isAuth 等）
}

/** 从本地存储读取数组 */
function loadList(key) {
  try { return wx.getStorageSync(key) || [] } catch (e) { return [] }
}

/** 写入数组到本地存储 */
function saveList(key, list) {
  try { wx.setStorageSync(key, list) } catch (e) { console.error('Storage save failed:', key, e) }
}

/** 从本地存储读取对象 */
function loadObj(key, fallback) {
  try { return wx.getStorageSync(key) || fallback } catch (e) { return fallback }
}

/** 写入对象到本地存储 */
function saveObj(key, obj) {
  try { wx.setStorageSync(key, obj) } catch (e) { console.error('Storage save failed:', key, e) }
}

const WEEKDAY_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }

// ==================== 模拟用户数据 ====================
// 初始为未认证状态，实名认证后持久化
const _persistedUser = loadObj(STORAGE_KEYS.USER, {})
const MOCK_USER = {
  userId: 10001,
  openid: '',
  phone: '',
  realName: '',
  idCard: '',
  creditScore: 100,
  isAuth: false,
  status: 0,
  ..._persistedUser   // 用持久化数据覆盖默认值
}

// ==================== 空数据（无示例） ====================
// 所有列表初始为空，仅由用户实际操作产生数据
const MOCK_SPACES = []
const MOCK_ORDERS = []
const MOCK_CREDIT_RECORDS = []

// ==================== Mock API 入口 ====================

/**
 * 模拟延迟
 */
function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Mock API 响应包装
 */
function success(data) {
  return { code: 0, msg: 'success', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

/** 格式化当前时间为 YYYY-MM-DD HH:mm */
function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Haversine 公式计算两点间距离（km） */
function calcDistance(lng1, lat1, lng2, lat2) {
  const R = 6371 // 地球半径 km
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 距离格式化：<1km 显示米，>=1km 显示公里 */
function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + 'm'
  return km.toFixed(1) + 'km'
}

/**
 * Mock 路由分发（仅保留用户端接口）
 */
const mockRoutes = {
  // ---- 车位 ----
  'GET:/parking/list': async (params) => {
    await delay(500)
    const userLng = Number(params.longitude) || 109.4918
    const userLat = Number(params.latitude) || 36.5854
    let allSpaces = [...loadList(STORAGE_KEYS.APPROVED_SPACES), ...MOCK_SPACES]

    // 过滤掉已下架的车位（status === 0）
    allSpaces = allSpaces.filter(s => s.status !== 0)

    // 计算真实距离 + 预格式化可用时段
    allSpaces = allSpaces.map(s => {
      const dist = calcDistance(userLng, userLat, s.longitude || userLng, s.latitude || userLat)
      // 找到第一个有效排期
      const validSchedule = (s.schedules || []).find(sc => sc.startTime && sc.endTime)
      return {
        ...s,
        _distanceKm: dist,
        distance: formatDistance(dist),
        availableTime: validSchedule
          ? `${WEEKDAY_MAP[validSchedule.weekday] || ''} ${validSchedule.startTime}-${validSchedule.endTime}`
          : '时段待定'
      }
    })

    // 筛选：仅看已认证
    if (params.certOnly === true || params.certOnly === 'true') {
      allSpaces = allSpaces.filter(s => s.auditStatus === 1)
    }

    // 排序：按价格
    if (params.priceOrder === 'asc') {
      allSpaces.sort((a, b) => a.pricePerHour - b.pricePerHour)
    } else if (params.priceOrder === 'desc') {
      allSpaces.sort((a, b) => b.pricePerHour - a.pricePerHour)
    }

    // 排序：按距离
    if (params.sortByDistance === true || params.sortByDistance === 'true') {
      allSpaces.sort((a, b) => a._distanceKm - b._distanceKm)
    }

    // 清理内部字段
    allSpaces = allSpaces.map(s => { delete s._distanceKm; return s })

    return success({ list: allSpaces, total: allSpaces.length })
  },

  'GET:/parking/search': async (params) => {
    await delay(300)
    const keyword = (params.keyword || '').trim()
    if (!keyword) return success({ list: [], total: 0 })
    const userLng = Number(params.longitude) || 109.4918
    const userLat = Number(params.latitude) || 36.5854
    const allSpaces = [...loadList(STORAGE_KEYS.APPROVED_SPACES), ...MOCK_SPACES]
    let list = allSpaces.filter(s =>
      s.communityName.includes(keyword) ||
      s.address.includes(keyword) ||
      s.locationDetail.includes(keyword) ||
      (s.tags && s.tags.some(t => t.includes(keyword)))
    )
    // 计算真实距离 + 预格式化可用时段
    list = list.map(s => {
      const dist = calcDistance(userLng, userLat, s.longitude || userLng, s.latitude || userLat)
      const validSchedule = (s.schedules || []).find(sc => sc.startTime && sc.endTime)
      return {
        ...s,
        distance: formatDistance(dist),
        availableTime: validSchedule
          ? `${WEEKDAY_MAP[validSchedule.weekday] || ''} ${validSchedule.startTime}-${validSchedule.endTime}`
          : '时段待定'
      }
    })
    return success({ list, total: list.length })
  },

  'GET:/parking/detail': async (params) => {
    await delay(300)
    const allSpaces = [...loadList(STORAGE_KEYS.APPROVED_SPACES), ...MOCK_SPACES]
    const space = allSpaces.find(s => s.spaceId === Number(params.spaceId))
    if (!space) return fail('车位不存在')
    return success(space)
  },

  // ---- 发布车位 ----
  'POST:/parking/publish': async (data) => {
    await delay(500)
    // 从排期中提取价格（取第一个有效排期的价格）
    const firstSchedule = (data.schedules || []).find(s => s.startTime && s.endTime) || {}
    const newSpace = {
      spaceId: Date.now(),
      ownerId: MOCK_USER.userId,
      ownerName: MOCK_USER.realName,
      ownerPhone: MOCK_USER.phone,
      auditStatus: 0,   // 待审核 — 需商家端审核通过后才在首页展示
      status: 0,        // 未上架（审核通过后自动上架）
      rating: 0,
      orderCount: 0,
      successRate: 0,
      distance: '0km',
      tags: [],
      photos: data.photos || [],
      propertyCert: '待上传',
      pricePerHour: firstSchedule.pricePerHour || 0,
      submitTime: formatNow(),
      ...data,
    }
    // 仅存入待审核列表 — 商家审核通过后才移入 APPROVED_SPACES
    const pending = loadList(STORAGE_KEYS.PENDING_SPACES)
    pending.unshift(newSpace)
    saveList(STORAGE_KEYS.PENDING_SPACES, pending)
    return success({ spaceId: newSpace.spaceId, auditStatus: 0 })
  },

  // ---- 我的车位 ----
  'GET:/parking/my-spaces': async () => {
    await delay(400)
    const pending = loadList(STORAGE_KEYS.PENDING_SPACES)
    const approved = loadList(STORAGE_KEYS.APPROVED_SPACES)
    // 合并去重：用户自己发布的车位
    const mySpaces = [...approved, ...pending].filter(
      s => s.ownerId === MOCK_USER.userId || s.ownerName === MOCK_USER.realName
    )
    // 去重（按 spaceId）
    const seen = new Set()
    const unique = mySpaces.filter(s => {
      if (seen.has(s.spaceId)) return false
      seen.add(s.spaceId)
      return true
    })
    return success({ list: unique, total: unique.length })
  },

  // ---- 上架/下架 ----
  'POST:/parking/toggle-status': async (data) => {
    await delay(300)
    // 更新审核通过列表中的车位状态
    const approved = loadList(STORAGE_KEYS.APPROVED_SPACES)
    const space = approved.find(s => s.spaceId === Number(data.spaceId))
    if (space) {
      space.status = Number(data.status)
      saveList(STORAGE_KEYS.APPROVED_SPACES, approved)
      // 同步更新待审核列表
      const pending = loadList(STORAGE_KEYS.PENDING_SPACES)
      const pendingSpace = pending.find(s => s.spaceId === Number(data.spaceId))
      if (pendingSpace) {
        pendingSpace.status = Number(data.status)
        saveList(STORAGE_KEYS.PENDING_SPACES, pending)
      }
      return success({ spaceId: data.spaceId, status: space.status, msg: space.status === 1 ? '已上架' : '已下架' })
    }
    return fail('车位不存在')
  },

  // ---- 订单 ----
  'POST:/order/create': async (data) => {
    await delay(500)
    const allSpaces = [...loadList(STORAGE_KEYS.APPROVED_SPACES), ...MOCK_SPACES]
    const space = allSpaces.find(s => s.spaceId === Number(data.spaceId))
    if (!space) return fail('车位不存在')

    // 时段冲突检测：检查同一车位是否有时间重叠的有效订单
    const allOrders = [...loadList(STORAGE_KEYS.ORDERS), ...MOCK_ORDERS]
    const newStart = new Date(data.startTime).getTime()
    const newEnd = new Date(data.endTime).getTime()
    const conflict = allOrders.find(o =>
      o.spaceId === Number(data.spaceId) &&
      o.orderStatus !== 4 && o.orderStatus !== 3 &&  // 排除已取消和已完成的
      (() => {
        const existStart = new Date(o.startTime).getTime()
        const existEnd = new Date(o.endTime).getTime()
        return newStart < existEnd && newEnd > existStart  // 时间重叠
      })()
    )
    if (conflict) return fail('该时段已被占用，请选择其他时间')

    const order = {
      orderId: Date.now(),
      lesseeId: MOCK_USER.userId,
      spaceId: data.spaceId,
      communityName: space.communityName,
      locationDetail: space.locationDetail,
      image: space.photos[0],
      startTime: data.startTime,
      endTime: data.endTime,
      actualStart: null,
      actualEnd: null,
      amount: data.amount,
      penaltyAmount: 0,
      orderStatus: 0,   // 待支付
      payStatus: 0,
      isOvertime: 0,
      complaintFlag: 0,
      ownerName: space.ownerName,
      ownerPhone: '1**',
      createdAt: new Date().toISOString()
    }
    // 存入持久化存储
    const orders = loadList(STORAGE_KEYS.ORDERS)
    orders.unshift(order)
    saveList(STORAGE_KEYS.ORDERS, orders)
    return success(order)
  },

  'POST:/order/pay': async (data) => {
    await delay(500)
    // mock 模式：模拟支付成功，更新订单状态
    const orders = loadList(STORAGE_KEYS.ORDERS)
    const order = orders.find(o => o.orderId === Number(data.orderId))
    if (order) {
      order.payStatus = 1
      order.orderStatus = 1  // 待入场
      saveList(STORAGE_KEYS.ORDERS, orders)
    }
    return success({
      mock: true,
      orderId: data.orderId,
      payStatus: 1,
      msg: '模拟支付成功'
    })
  },

  'GET:/order/list': async (params) => {
    await delay(400)
    const status = Number(params.status)
    let list = [...loadList(STORAGE_KEYS.ORDERS), ...MOCK_ORDERS]
    if (status >= 0) list = list.filter(o => o.orderStatus === status)
    return success({ list, total: list.length })
  },

  'GET:/order/detail': async (params) => {
    await delay(300)
    const allOrders = [...loadList(STORAGE_KEYS.ORDERS), ...MOCK_ORDERS]
    const order = allOrders.find(o => o.orderId === Number(params.orderId))
    if (!order) return fail('订单不存在')
    return success(order)
  },

  'POST:/order/enter': async (data) => {
    await delay(300)
    // 入场确认 -> 更新订单状态为"停车中"，记录实际入场时间
    const orders = loadList(STORAGE_KEYS.ORDERS)
    let order = orders.find(o => o.orderId === Number(data.orderId))
    if (!order) {
      // 可能是 mock 预置订单，复制到运行时存储
      const mockOrder = MOCK_ORDERS.find(o => o.orderId === Number(data.orderId))
      if (mockOrder) {
        order = { ...mockOrder }
        orders.unshift(order)
      }
    }
    if (order) {
      order.orderStatus = 2   // 停车中
      order.actualStart = formatNow()
      saveList(STORAGE_KEYS.ORDERS, orders)
    }
    return success({ gateStatus: 'opened', enterTime: order ? order.actualStart : new Date().toISOString() })
  },

  'POST:/order/exit': async (data) => {
    await delay(300)
    // 离场确认 -> 更新订单状态为"已完成"，记录实际离场时间
    const orders = loadList(STORAGE_KEYS.ORDERS)
    let order = orders.find(o => o.orderId === Number(data.orderId))
    if (!order) {
      // 可能是 mock 预置订单，复制到运行时存储
      const mockOrder = MOCK_ORDERS.find(o => o.orderId === Number(data.orderId))
      if (mockOrder) {
        order = { ...mockOrder }
        orders.unshift(order)
      }
    }
    let penalty = 0
    let isOvertime = 0
    if (order) {
      order.actualEnd = formatNow()
      // 检查是否超时（15分钟宽限期）
      const endTime = new Date(order.endTime).getTime()
      const now = Date.now()
      const overtimeMs = now - endTime - (15 * 60 * 1000)  // 15分钟宽限
      if (overtimeMs > 0) {
        const overtimeMin = Math.ceil(overtimeMs / 60000)
        // 超时按双倍时薪计费，30分钟为单位
        // 时薪 = 总金额 / 预约总小时数
        const durationMs = new Date(order.endTime).getTime() - new Date(order.startTime).getTime()
        const durationHours = durationMs / (1000 * 60 * 60)
        const hourlyRate = durationHours > 0 ? order.amount / durationHours : order.amount
        const overtimeUnits = Math.ceil(overtimeMin / 30)
        penalty = Math.round(overtimeUnits * hourlyRate * 0.5 * 2 * 100) / 100  // 双倍计费，保留2位小数
        isOvertime = 1
        order.isOvertime = 1
        order.penaltyAmount = penalty
        // 扣信用分
        MOCK_USER.creditScore = Math.max(0, MOCK_USER.creditScore - 10)
        saveObj(STORAGE_KEYS.USER, {
          realName: MOCK_USER.realName,
          isAuth: MOCK_USER.isAuth,
          creditScore: MOCK_USER.creditScore
        })
        // 记录信用扣分
        const creditRecords = loadList(STORAGE_KEYS.CREDIT_RECORDS)
        creditRecords.unshift({
          recordId: Date.now(),
          userId: MOCK_USER.userId,
          eventType: 1,       // 超时占用
          scoreChange: -10,
          orderId: order.orderId,
          description: `${formatNow()} 超时占用${overtimeMin}分钟`,
          createdAt: formatNow()
        })
        saveList(STORAGE_KEYS.CREDIT_RECORDS, creditRecords)
      }
      order.orderStatus = 3   // 已完成
      saveList(STORAGE_KEYS.ORDERS, orders)
    }
    return success({
      gateStatus: 'opened',
      isOvertime,
      penaltyAmount: penalty,
      totalAmount: (order?.amount || 0) + penalty
    })
  },

  'POST:/order/cancel': async (data) => {
    await delay(300)
    const orders = loadList(STORAGE_KEYS.ORDERS)
    let order = orders.find(o => o.orderId === Number(data.orderId))
    if (!order) {
      const mockOrder = MOCK_ORDERS.find(o => o.orderId === Number(data.orderId))
      if (mockOrder) {
        order = { ...mockOrder }
        orders.unshift(order)
      }
    }
    if (order) {
      order.orderStatus = 4   // 已取消
      saveList(STORAGE_KEYS.ORDERS, orders)
    }
    return success({ orderId: data.orderId, orderStatus: 4, msg: '已取消' })
  },

  // ---- 信用 ----
  'GET:/credit/info': async () => {
    await delay(300)
    return success({
      score: MOCK_USER.creditScore,
      records: [...loadList(STORAGE_KEYS.CREDIT_RECORDS), ...MOCK_CREDIT_RECORDS]
    })
  },

  // ---- 投诉 ----
  'POST:/complaint/submit': async (data) => {
    await delay(500)
    const complaintTypes = ['超时占用', '车辆损坏', '态度恶劣', '虚假信息', '其他']
    const newComplaint = {
      complaintId: Date.now(),
      orderId: data.orderId || null,
      type: data.type,
      typeName: complaintTypes[data.type] || '其他',
      description: data.description,
      photos: data.photos || [],
      status: 'pending',         // pending / resolved / rejected
      result: '',                // 处理结果说明（商家处理后填充）
      submitter: MOCK_USER.realName,
      submitTime: formatNow(),
      ownerName: data.ownerName || '待关联',
      communityName: data.communityName || '待关联',
      spaceId: data.spaceId || null
    }
    // 存入持久化存储（保留所有投诉记录，包括已处理的）
    const complaints = loadList(STORAGE_KEYS.PENDING_COMPLAINTS)
    complaints.unshift(newComplaint)
    saveList(STORAGE_KEYS.PENDING_COMPLAINTS, complaints)

    // 仅标记订单的投诉标记，不改变订单状态 — 订单流程正常继续
    if (data.orderId) {
      const orders = loadList(STORAGE_KEYS.ORDERS)
      let order = orders.find(o => o.orderId === Number(data.orderId))
      if (!order) {
        const mockOrder = MOCK_ORDERS.find(o => o.orderId === Number(data.orderId))
        if (mockOrder) {
          order = { ...mockOrder }
          orders.unshift(order)
        }
      }
      if (order) {
        order.complaintFlag = 1
        saveList(STORAGE_KEYS.ORDERS, orders)
      }
    }

    return success({ complaintId: newComplaint.complaintId, status: 'pending' })
  },

  'GET:/complaint/list': async () => {
    await delay(300)
    // 返回所有投诉记录（包含已处理的），按提交时间倒序
    const allComplaints = [...loadList(STORAGE_KEYS.PENDING_COMPLAINTS)]
    return success({ list: allComplaints, total: allComplaints.length })
  },

  // 用户查看自己的投诉记录和处理结果
  'GET:/complaint/my-list': async () => {
    await delay(300)
    const allComplaints = loadList(STORAGE_KEYS.PENDING_COMPLAINTS)
    // 筛选当前用户提交的投诉
    const myComplaints = allComplaints.filter(
      c => c.submitter === MOCK_USER.realName || !c.submitter
    )
    return success({ list: myComplaints, total: myComplaints.length })
  },

  // 商家处理投诉 — 标记为已处理，保留处理结果（不删除）
  'POST:/admin/resolve-complaint': async (data) => {
    await delay(400)
    const complaints = loadList(STORAGE_KEYS.PENDING_COMPLAINTS)
    const complaint = complaints.find(c => c.complaintId === Number(data.complaintId))
    if (complaint) {
      complaint.status = data.rejected ? 'rejected' : 'resolved'
      complaint.result = data.result || (data.rejected ? '投诉不成立' : '投诉已处理，已对相关方进行处理')
      complaint.resolveTime = formatNow()
      saveList(STORAGE_KEYS.PENDING_COMPLAINTS, complaints)
    }
    return success({ complaintId: data.complaintId, status: complaint ? complaint.status : 'resolved', msg: '已处理' })
  },

  // ---- 认证 ----
  'POST:/auth/login': async (data) => {
    await delay(500)
    if (!data.code) return fail('登录凭证不能为空')
    return success({
      token: 'mock_jwt_token_' + Date.now(),
      userId: MOCK_USER.userId,
      userInfo: {
        nickName: MOCK_USER.realName,
        avatarUrl: ''
      },
      isAuth: MOCK_USER.isAuth,
      creditScore: MOCK_USER.creditScore
    })
  },

  'GET:/auth/userinfo': async () => {
    await delay(200)
    return success(MOCK_USER)
  },

  'POST:/auth/verify': async (data) => {
    await delay(800)
    // 保存用户提交的实名信息到持久化存储
    if (data.realName) {
      MOCK_USER.realName = data.realName
      MOCK_USER.isAuth = true
      saveObj(STORAGE_KEYS.USER, {
        realName: MOCK_USER.realName,
        isAuth: MOCK_USER.isAuth
      })
    }
    return success({ verified: true, realName: MOCK_USER.realName })
  },

  'POST:/auth/bind-phone': async (data) => {
    await delay(500)
    if (!data.code) return fail('授权获取手机号失败')
    return success({ phone: '138****1234' })
  },

  // 上传
  'POST:/upload/image': async () => {
    await delay(1000)
    return success({ url: '/images/upload/mock_' + Date.now() + '.png' })
  },

  // ---- 商家端：车位审核（共享存储，商家端操作后用户端可见结果） ----
  'GET:/admin/pending-spaces': async () => {
    await delay(400)
    const allPending = loadList(STORAGE_KEYS.PENDING_SPACES)
    return success({ list: allPending, total: allPending.length })
  },

  'POST:/admin/approve-space': async (data) => {
    await delay(400)
    const pending = loadList(STORAGE_KEYS.PENDING_SPACES)
    const idx = pending.findIndex(s => s.spaceId === Number(data.spaceId))
    if (idx !== -1) {
      const space = pending.splice(idx, 1)[0]
      saveList(STORAGE_KEYS.PENDING_SPACES, pending)
      space.auditStatus = 1
      space.status = 1
      space.rating = 5.0
      space.orderCount = 0
      space.successRate = 1.0
      space.tags = ['新上架']
      if (!space.longitude) space.longitude = 109.4918
      if (!space.latitude) space.latitude = 36.5854
      const approved = loadList(STORAGE_KEYS.APPROVED_SPACES)
      approved.unshift(space)
      saveList(STORAGE_KEYS.APPROVED_SPACES, approved)
    }
    return success({ spaceId: data.spaceId, auditStatus: 1, msg: '已通过审核' })
  },

  'POST:/admin/reject-space': async (data) => {
    await delay(400)
    const pending = loadList(STORAGE_KEYS.PENDING_SPACES)
    const idx = pending.findIndex(s => s.spaceId === Number(data.spaceId))
    if (idx !== -1) {
      pending[idx].auditStatus = 2  // 标记为已驳回
      saveList(STORAGE_KEYS.PENDING_SPACES, pending)
    }
    return success({ spaceId: data.spaceId, auditStatus: 2, msg: '已驳回' })
  }
}

/**
 * Mock 请求拦截器
 * @param {string} url - 请求路径
 * @param {string} method - 请求方法
 * @param {Object} data - 请求参数
 */
async function mockRequest(url, method, data = {}) {
  const key = `${method}:${url.replace('/v1', '')}`
  const handler = mockRoutes[key]

  if (handler) {
    try {
      return await handler(data)
    } catch (e) {
      console.error(`Mock route [${key}] error:`, e)
      return fail('Mock接口异常')
    }
  }

  console.warn(`未注册的Mock接口: ${key}`)
  return fail(`接口 [${key}] 尚未实现`, 404)
}

module.exports = {
  mockRequest,
  MOCK_SPACES,
  MOCK_ORDERS,
  MOCK_USER,
  MOCK_CREDIT_RECORDS
}
