/**
 * 共享停车 - 本地后端服务器（零依赖）
 *
 * 用户端和商家端小程序通过 HTTP 请求与此服务器通信，
 * 数据存储在 data.json 中，实现双端数据联动。
 *
 * 启动方式：node server.js
 * 默认端口：3000
 *
 * 小程序配置：
 *   - BASE_URL = 'http://localhost:3000'
 *   - urlCheck = false（在 project.config.json 中设置）
 *   - X-Client-Type 请求头区分用户端(user)/商家端(merchant)
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const url = require('url')
const querystring = require('querystring')
const crypto = require('crypto')

// 端口 / 公网地址：部署到 GitHub + PaaS（如 Render / Heroku / Railway）时由环境变量注入；本地默认 3000
const PORT = process.env.PORT || 3000
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`
const DATA_FILE = path.join(__dirname, 'data.json')
const DATA_EXAMPLE = path.join(__dirname, 'data.example.json')

// ==================== 微信登录配置 ====================
// 真实微信登录需要小程序的 AppID 和 AppSecret（在微信公众平台「开发管理 → 开发设置」获取）。
// 配置方式二选一：
//   1) 环境变量：WECHAT_APPID / WECHAT_SECRET
//   2) 同目录配置文件：config.json 里写 { "appid": "...", "secret": "..." }
// 若两者都未配置，则登录接口进入「演示模式」：用 code 派生一个稳定伪 openid，
//   保证本地联调链路能跑通，但那不是真实微信身份（进阶页会明确提示）。
let WECHAT_APPID = process.env.WECHAT_APPID || ''
let WECHAT_SECRET = process.env.WECHAT_SECRET || ''
try {
  const cfgPath = path.join(__dirname, 'config.json')
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    WECHAT_APPID = WECHAT_APPID || cfg.appid || ''
    WECHAT_SECRET = WECHAT_SECRET || cfg.secret || ''
  }
} catch (e) {
  console.warn('[auth] 读取 config.json 失败，使用演示模式:', e.message)
}
const REAL_WECHAT = !!(WECHAT_APPID && WECHAT_SECRET)
if (!REAL_WECHAT) console.warn('[auth] 未配置 WECHAT_APPID/WECHAT_SECRET，登录将以「演示模式」运行（非真实微信身份）')

// ==================== 微信小程序虚拟支付（米大师）配置 ====================
// 微信小程序「虚拟支付」用于安卓端虚拟商品/服务支付，个人主体小程序也可在
// MP 后台「虚拟支付 → 基本配置」开通后使用。需先在米大师发布道具(productId)。
// 停车费属于「高频、多次、小额消费」，按微信官方接入指引应优先采用「代币模式(short_series_coin)」：
//   用户先充值「停车币」（固定单价的代币道具），再用工夫余额抵扣每笔订单的可变金额。
//   这样每笔充值金额固定（匹配米大师代币兑换比例），规避了「道具直购(goods)要求道具价格固定、
//   但每笔订单金额动态」导致的真实接入失败。
// 配置方式二选一：
//   1) 环境变量：VPAY_OFFER_ID / VPAY_APPKEY_PROD / VPAY_APPKEY_SANDBOX / VPAY_COIN_PRODUCT_ID / VPAY_COIN_UNIT_PRICE_FEN / VPAY_ENV
//   2) 同目录 config.json 的 vpay 字段：{ "offerId","appKeyProd","appKeySandbox","coinProductId","coinUnitPriceFen","env" }
// 未配置时钱包充值将以「演示模式」直接入账（无真实微信回调），可端到端联调。
let VPAY_OFFER_ID = process.env.VPAY_OFFER_ID || ''
let VPAY_APPKEY_PROD = process.env.VPAY_APPKEY_PROD || ''
let VPAY_APPKEY_SANDBOX = process.env.VPAY_APPKEY_SANDBOX || ''
let VPAY_COIN_PRODUCT_ID = process.env.VPAY_COIN_PRODUCT_ID || ''            // 停车币代币道具ID（米大师「代币配置」发布，固定兑换比例）
let VPAY_COIN_UNIT_PRICE_FEN = Number(process.env.VPAY_COIN_UNIT_PRICE_FEN || 100) // 每枚停车币单价(分)，须与米大师代币兑换比例一致
let VPAY_ENV = Number(process.env.VPAY_ENV || 0) // 0=正式环境 1=沙箱环境
const VPAY_CURRENCY = 'CNY'
try {
  const cfgPath = path.join(__dirname, 'config.json')
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    const v = cfg.vpay || {}
    VPAY_OFFER_ID = VPAY_OFFER_ID || v.offerId || ''
    VPAY_APPKEY_PROD = VPAY_APPKEY_PROD || v.appKeyProd || ''
    VPAY_APPKEY_SANDBOX = VPAY_APPKEY_SANDBOX || v.appKeySandbox || ''
    VPAY_COIN_PRODUCT_ID = VPAY_COIN_PRODUCT_ID || v.coinProductId || ''
    if (v.coinUnitPriceFen != null) VPAY_COIN_UNIT_PRICE_FEN = Number(v.coinUnitPriceFen)
    if (v.env != null) VPAY_ENV = Number(v.env)
  }
} catch (e) {
  console.warn('[vpay] 读取 config.json 的 vpay 字段失败:', e.message)
}
// 真实虚拟支付开关：需配置 offerId + 至少一套 appKey + 停车币代币道具ID
const VPAY_REAL = !!(VPAY_OFFER_ID && (VPAY_APPKEY_PROD || VPAY_APPKEY_SANDBOX) && VPAY_COIN_PRODUCT_ID)
if (!VPAY_REAL) console.warn('[vpay] 未配置虚拟支付密钥（需在 config.json 的 vpay 或环境变量设置 offerId/appKey/coinProductId），钱包充值将以「演示模式」直接入账，可端到端联调。')

// ==================== 数据存储 ====================

const DEFAULT_DATA = {
  users: {
    user: { userId: 10001, realName: '', idCard: '', phone: '', isAuth: false, creditScore: 100, status: 0 },
    merchant: { userId: 20001, realName: '', idCard: '', phone: '', isAuth: false, creditScore: 100, status: 0 }
  },
  tokens: {},            // token -> 'user' | 'merchant' | { type:'wechat', openid }
  openidUsers: {},       // openid -> 微信登录用户对象（真实身份）
  pendingSpaces: [],     // 待审核车位
  approvedSpaces: [],    // 审核通过的车位
  orders: [],            // 所有订单
  complaints: [],        // 所有投诉记录（含已处理）
  creditRecords: []      // 信用记录
}

function loadData() {
  try {
    // 首次运行：无 data.json 时，从示例数据(data.example.json)播种（含示例车位），并落盘为 data.json
    if (!fs.existsSync(DATA_FILE) && fs.existsSync(DATA_EXAMPLE)) {
      const seed = JSON.parse(fs.readFileSync(DATA_EXAMPLE, 'utf-8'))
      const merged = { ...DEFAULT_DATA, ...seed, users: { ...DEFAULT_DATA.users, ...(seed.users || {}) } }
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2), 'utf-8') } catch (e) { /* ignore */ }
      console.log('[data] 已从 data.example.json 初始化 data.json（示例车位已就绪）')
      return merged
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const data = JSON.parse(raw)
      // 合并默认值，防止字段缺失
      return { ...DEFAULT_DATA, ...data, users: { ...DEFAULT_DATA.users, ...(data.users || {}) } }
    }
  } catch (e) {
    console.error('读取数据文件失败:', e.message)
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA))
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('写入数据文件失败:', e.message)
  }
}

// 全局数据实例
let DB = loadData()

// 车位状态：0=未上架(待审核/已下架) 1=已上架可预约
// 占用不再用"整车位 status"表达，而是按"订单时段窗口"派生（见 getOccupiedSlots / /booking/availability）
// 仅预约了某个时段的订单会占用该时段；其余时段仍可被预约。
const EARLY_PREMIUM_K = 1 // 提前到达溢价系数：默认 1（不加价），可选 1.5

// 启动时归一化：清除历史遗留的 status=2（旧"整车位锁定"模型），统一回到可预约
DB.approvedSpaces.forEach(sp => { if (sp.status === 2) sp.status = 1 })
// 归一化：补齐钱包余额字段与充值订单数组（老数据兼容）
Object.values(DB.users).forEach(u => { if (u && u.balanceFen == null) u.balanceFen = 0 })
if (!Array.isArray(DB.coinOrders)) DB.coinOrders = []

// ==================== 工具函数 ====================

function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function success(data) {
  return { code: 0, msg: 'success', data }
}

function fail(msg, code = -1) {
  return { code, msg }
}

function formatNow() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAY_MAP = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }

function getWeekday(dateStr) {
  const d = new Date(dateStr)
  let w = d.getDay() // 0=周日, 1=周一...
  return w === 0 ? 7 : w
}

function calcDistance(lng1, lat1, lng2, lat2) {
  const R = 6371
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + 'm'
  return km.toFixed(1) + 'km'
}

// ==================== 微信小程序虚拟支付签名 ====================
// 官方算法：
//   paySig    = hex(hmac_sha256(appKey,   'requestVirtualPayment' + '&' + signData))
//   signature = hex(hmac_sha256(sessionKey,'requestVirtualPayment' + '&' + signData))  // 用户态签名
// 其中 signData 为前端 wx.requestVirtualPayment 入参中 signData 字段的「同一个 JSON 字符串」。
function hmacSha256Hex(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex')
}

function calcVirtualPaySign(signDataStr, sessionKey, env) {
  const appKey = env === 1 ? VPAY_APPKEY_SANDBOX : VPAY_APPKEY_PROD
  const uri = 'requestVirtualPayment'
  const needSign = uri + '&' + signDataStr
  return {
    paySig: hmacSha256Hex(appKey || '', needSign),
    signature: hmacSha256Hex(sessionKey || '', needSign)
  }
}

/** 根据请求头获取客户端类型 */
function getClientType(req) {
  return req.headers['x-client-type'] || 'user'
}

/** 根据请求头获取当前用户 */
function getCurrentUser(req) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.replace('Bearer ', '')
  const clientType = getClientType(req)

  // 优先用 token 查找
  if (token && DB.tokens[token]) {
    const t = DB.tokens[token]
    // 微信登录写入的是对象 { type:'wechat', openid }
    if (typeof t === 'object' && t.type === 'wechat') {
      return DB.openidUsers[t.openid] || null
    }
    // 旧 clientType 模式：'user' | 'merchant'
    return DB.users[t] || null
  }
  // 退而用 client type
  return DB.users[clientType] || DB.users.user
}

/**
 * 调用微信 jscode2session，用登录 code 换取 openid 与 session_key
 * @param {string} code wx.login() 返回的临时登录凭证
 * @returns {Promise<{openid?:string, session_key?:string, errcode?:number, errmsg?:string}>}
 */
function wxCode2Session(code) {
  return new Promise((resolve, reject) => {
    const qs = querystring.stringify({
      appid: WECHAT_APPID,
      secret: WECHAT_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    })
    const reqUrl = `https://api.weixin.qq.com/sns/jscode2session?${qs}`
    https.get(reqUrl, res => {
      let raw = ''
      res.on('data', c => { raw += c })
      res.on('end', () => {
        try {
          const json = JSON.parse(raw)
          if (json.errcode) {
            console.warn('[auth] jscode2session 返回错误:', json.errcode, json.errmsg)
            resolve({ errcode: json.errcode, errmsg: json.errmsg })
          } else {
            resolve({ openid: json.openid, session_key: json.session_key })
          }
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

/** 按 userId 查找用户（订单的租客/车位主可能是不同角色，需按订单字段定位） */
function findUserByUserId(userId) {
  if (userId == null) return null
  return Object.values(DB.users).find(u => u && u.userId === Number(userId)) || null
}

// ==================== 时段占用工具（按订单窗口派生，而非整车位锁定） ====================

function toMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

// 返回某车位在某日期已被占用的时段 [["HH:MM","HH:MM"], ...]
// 占用定义：未取消(4)/未完成(3) 的订单，其 [startTime,endTime] 与日期相交的部分
function getOccupiedSlots(spaceId, dateStr) {
  const occupied = []
  DB.orders.forEach(o => {
    if (Number(o.spaceId) !== Number(spaceId)) return
    if (o.orderStatus === 3 || o.orderStatus === 4) return // 已完成/已取消不占用
    const os = o.startTime
    const oe = o.endTime
    if (!os || !oe) return
    const osDate = os.slice(0, 10)
    const oeDate = oe.slice(0, 10)
    if (osDate > dateStr || oeDate < dateStr) return // 与该日期无交集
    occupied.push([os.slice(11, 16), oe.slice(11, 16)])
  })
  return occupied
}

// 在 [open, close] 窗口内，扣除已占用时段，返回剩余可预约时段
function computeFreeSlots(open, close, occupied) {
  let cur = toMin(open)
  const end = toMin(close)
  const ivals = occupied
    .map(([s, e]) => [toMin(s), toMin(e)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const free = []
  for (const [s, e] of ivals) {
    if (s > cur) free.push([toTime(cur), toTime(Math.min(s, end))])
    cur = Math.max(cur, e)
    if (cur >= end) break
  }
  if (cur < end) free.push([toTime(cur), toTime(end)])
  return free.filter(([s, e]) => toMin(e) > toMin(s))
}

// ==================== API 路由处理 ====================

const routes = {
  // ---- 认证 ----
  'POST:/auth/login': async (req, body, query) => {
    await delay(300)
    const { code } = body || {}
    if (!code) return fail('缺少登录凭证 code（请先调用 wx.login）', 401)

    let openid = ''
    let sessionKey = ''
    let mockMode = !REAL_WECHAT // 未配置 AppID/Secret 即演示模式

    if (REAL_WECHAT) {
      try {
        const r = await wxCode2Session(code)
        if (r.openid) {
          openid = r.openid
          sessionKey = r.session_key || ''
        } else {
          // 微信侧报错（如 code 无效），降级演示模式，保证联调不中断
          mockMode = true
          console.warn('[auth] jscode2session 未返回 openid，降级演示模式:', r.errmsg)
        }
      } catch (e) {
        mockMode = true
        console.warn('[auth] 调用微信接口失败，降级演示模式:', e.message)
      }
    }

    if (mockMode) {
      // 演示模式：用 code 派生一个稳定（同一 code 固定）的伪 openid，便于本地联调
      openid = 'demo_openid_' + Buffer.from(String(code)).toString('base64').replace(/=|\/|\+/g, '').slice(0, 16)
    }

    // 查找或创建该 openid 对应的用户对象
    if (!DB.openidUsers[openid]) {
      const userId = 30000 + Object.keys(DB.openidUsers).length + 1
      DB.openidUsers[openid] = {
        openid,
        userId,
        nickName: mockMode ? '演示用户' : '微信用户',
        avatarUrl: '',
        creditScore: 100,
        isAuth: false,
        phone: '',
        realName: '',
        sessionKey: sessionKey || '' // 用于虚拟支付用户态签名 signature
      }
      saveData(DB)
    }
    const user = DB.openidUsers[openid]

    // 生成登录态 token（JWT 风格仅作演示，生产应加密签名 + 过期）
    const token = `wx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    DB.tokens[token] = { type: 'wechat', openid }
    saveData(DB)

    return success({
      token,
      userId: user.userId,
      openid,
      userInfo: { nickName: user.nickName, avatarUrl: user.avatarUrl },
      isAuth: user.isAuth,
      creditScore: user.creditScore,
      mockMode, // 前端据此提示「当前为演示模式，非真实微信身份」
      sessionKeyHint: mockMode ? '' : (sessionKey ? '已获取' : '')
    })
  },

  'GET:/auth/userinfo': async (req) => {
    await delay(200)
    const user = getCurrentUser(req)
    return success(user)
  },

  'POST:/auth/verify': async (req, body) => {
    await delay(800)
    const clientType = getClientType(req)
    const user = DB.users[clientType] || DB.users.user
    if (body.realName) {
      user.realName = body.realName
      user.isAuth = true
      saveData(DB)
    }
    return success({ verified: true, realName: user.realName })
  },

  'POST:/auth/bind-phone': async (req, body) => {
    await delay(500)
    if (!body.code) return fail('授权获取手机号失败')
    const clientType = getClientType(req)
    const user = DB.users[clientType] || DB.users.user
    const phone = clientType === 'merchant' ? '139****8888' : '138****1234'
    user.phone = phone
    saveData(DB)
    return success({ phone })
  },

  // ---- 车位列表 ----
  'GET:/parking/list': async (req, body, query) => {
    await delay(500)
    const userLng = Number(query.longitude) || 109.4918
    const userLat = Number(query.latitude) || 36.5854
    let allSpaces = [...DB.approvedSpaces]

    // 仅展示已上架(status=1)的车位；占用由订单时段窗口决定，不在列表层隐藏车位
    allSpaces = allSpaces.filter(s => s.status === 1)

    // 计算距离 + 预格式化时段
    allSpaces = allSpaces.map(s => {
      const dist = calcDistance(userLng, userLat, s.longitude || userLng, s.latitude || userLat)
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

    // 筛选
    if (query.certOnly === 'true' || query.certOnly === true) {
      allSpaces = allSpaces.filter(s => s.auditStatus === 1)
    }

    // 排序
    if (query.priceOrder === 'asc') {
      allSpaces.sort((a, b) => a.pricePerHour - b.pricePerHour)
    } else if (query.priceOrder === 'desc') {
      allSpaces.sort((a, b) => b.pricePerHour - a.pricePerHour)
    }
    if (query.sortByDistance === 'true' || query.sortByDistance === true) {
      allSpaces.sort((a, b) => a._distanceKm - b._distanceKm)
    }

    // 清理内部字段
    allSpaces = allSpaces.map(s => { const { _distanceKm, ...rest } = s; return rest })

    return success({ list: allSpaces, total: allSpaces.length })
  },

  'GET:/parking/search': async (req, body, query) => {
    await delay(300)
    const keyword = (query.keyword || '').trim()
    if (!keyword) return success({ list: [], total: 0 })
    const userLng = Number(query.longitude) || 109.4918
    const userLat = Number(query.latitude) || 36.5854
    let list = DB.approvedSpaces.filter(s =>
      s.status === 1 && (
      (s.communityName || '').includes(keyword) ||
      (s.address || '').includes(keyword) ||
      (s.locationDetail || '').includes(keyword) ||
      (s.tags || []).some(t => t.includes(keyword))
      )
    )
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

  'GET:/parking/detail': async (req, body, query) => {
    await delay(300)
    const space = DB.approvedSpaces.find(s => s.spaceId === Number(query.spaceId))
    if (!space) return fail('车位不存在')
    return success(space)
  },

  // ---- 预约时段可用性：按订单窗口派生，自动算出可预约/已预约时段 ----
  'GET:/booking/availability': async (req, body, query) => {
    await delay(200)
    const space = DB.approvedSpaces.find(s => s.spaceId === Number(query.spaceId))
    if (!space) return fail('车位不存在')
    const dateStr = query.date
    if (!dateStr) return fail('缺少日期参数')
    const wk = getWeekday(dateStr + ' 00:00')
    const sched = (space.schedules || []).find(s => s.weekday === wk && s.enabled !== false)
    if (!sched) return success({ schedule: null, bookedSlots: [], freeSlots: [] })
    const occupied = getOccupiedSlots(query.spaceId, dateStr)
    const free = computeFreeSlots(sched.startTime, sched.endTime, occupied)
    return success({
      schedule: {
        weekday: wk,
        startTime: sched.startTime,
        endTime: sched.endTime,
        pricePerHour: sched.pricePerHour != null ? sched.pricePerHour : space.pricePerHour
      },
      bookedSlots: occupied,
      freeSlots: free
    })
  },

  // ---- 发布车位 ----
  'POST:/parking/publish': async (req, body) => {
    await delay(500)
    const user = getCurrentUser(req)
    const firstSchedule = (body.schedules || []).find(s => s.startTime && s.endTime) || {}
    const newSpace = {
      spaceId: Date.now(),
      ownerId: user.userId,
      ownerName: user.realName,
      ownerPhone: user.phone,
      auditStatus: 0,     // 待审核
      status: 0,          // 未上架
      rating: 0,
      orderCount: 0,
      successRate: 0,
      distance: '0km',
      tags: [],
      photos: body.photos || [],
      propertyCert: '待上传',
      pricePerHour: firstSchedule.pricePerHour || 0,
      submitTime: formatNow(),
      ...body,
    }
    DB.pendingSpaces.unshift(newSpace)
    saveData(DB)
    return success({ spaceId: newSpace.spaceId, auditStatus: 0 })
  },

  // ---- 我的车位 ----
  'GET:/parking/my-spaces': async (req) => {
    await delay(400)
    const user = getCurrentUser(req)
    const mySpaces = [...DB.approvedSpaces, ...DB.pendingSpaces].filter(
      s => s.ownerId === user.userId || s.ownerName === user.realName
    )
    // 去重
    const seen = new Set()
    const unique = mySpaces.filter(s => {
      if (seen.has(s.spaceId)) return false
      seen.add(s.spaceId)
      return true
    })
    return success({ list: unique, total: unique.length })
  },

  // ---- 上架/下架 ----
  'POST:/parking/toggle-status': async (req, body) => {
    await delay(300)
    const space = DB.approvedSpaces.find(s => s.spaceId === Number(body.spaceId))
    if (space) {
      space.status = Number(body.status)
      saveData(DB)
      // 同步待审核列表
      const pendingSpace = DB.pendingSpaces.find(s => s.spaceId === Number(body.spaceId))
      if (pendingSpace) {
        pendingSpace.status = Number(body.status)
      }
      return success({ spaceId: body.spaceId, status: space.status, msg: space.status === 1 ? '已上架' : '已下架' })
    }
    return fail('车位不存在')
  },

  // ---- 订单 ----
  'POST:/order/create': async (req, body) => {
    await delay(500)
    const user = getCurrentUser(req)
    const space = DB.approvedSpaces.find(s => s.spaceId === Number(body.spaceId))
    if (!space) return fail('车位不存在')

    // 车位必须已上架(status=1)才可下单
    if (space.status !== 1) {
      return fail('该车位暂不可预约')
    }

    // 时段冲突检测：与其它未完成订单的时间窗口重叠则拒绝（按订单窗口派生占用）
    const newStart = new Date(body.startTime).getTime()
    const newEnd = new Date(body.endTime).getTime()
    const conflict = DB.orders.find(o =>
      Number(o.spaceId) === Number(body.spaceId) &&
      o.orderStatus !== 4 && o.orderStatus !== 3 &&
      (() => {
        const existStart = new Date(o.startTime).getTime()
        const existEnd = new Date(o.endTime).getTime()
        return newStart < existEnd && newEnd > existStart
      })()
    )
    if (conflict) return fail('该时段已被占用，请选择其他时间')

    // 校验预约时段落在车位当日开放时段内（按星期几匹配 schedule）
    const wk = getWeekday(body.startTime)
    const sched = (space.schedules || []).find(s => s.weekday === wk && s.enabled !== false)
    if (sched) {
      const open = toMin(sched.startTime)
      const close = toMin(sched.endTime)
      const ns = toMin(body.startTime.slice(11, 16))
      const ne = toMin(body.endTime.slice(11, 16))
      if (ns < open || ne > close) return fail('预约时间超出车位开放时段')
    }

    const order = {
      orderId: Date.now(),
      lesseeId: user.userId,
      ownerId: space.ownerId, // 车位主ID，用于商家端按"我的车位"筛选订单
      spaceId: Number(body.spaceId),
      communityName: space.communityName,
      locationDetail: space.locationDetail,
      image: (space.photos || [])[0],
      startTime: body.startTime,
      endTime: body.endTime,
      actualStart: null,
      actualEnd: null,
      amount: body.amount,
      penaltyAmount: 0,
      // 预订费（占座诚意金）：首30分钟费用，爽约不退、到场抵扣停车费
      reserveFee: body.reserveFee != null ? Number(body.reserveFee) : Math.max(2, Math.round(Number(space.pricePerHour) * 0.5 * 100) / 100),
      earlyPremiumK: EARLY_PREMIUM_K, // 提前到达溢价系数
      earlyFee: 0,
      creditDeduct: 0,
      orderStatus: 0,
      payStatus: 0,
      isOvertime: 0,
      complaintFlag: 0,
      ownerName: space.ownerName,
      ownerPhone: '1**',
      createdAt: new Date().toISOString()
    }
    DB.orders.unshift(order)
    saveData(DB)
    return success(order)
  },

  'POST:/order/pay': async (req, body) => {
    await delay(300)
    const user = getCurrentUser(req)
    const order = DB.orders.find(o => o.orderId === Number(body.orderId))
    if (!order) return fail('订单不存在')
    // 已支付则直接返回（幂等）
    if (order.payStatus === 1) {
      return success({ payStatus: 1, balanceFen: user.balanceFen || 0, msg: '已支付' })
    }
    // 采用「代币模式」：从用户钱包余额(分)扣减（停车费 + 占座诚意金）
    const needFen = Math.round(((order.amount || 0) + (order.reserveFee || 0)) * 100)
    if ((user.balanceFen || 0) < needFen) {
      return fail('钱包余额不足，请先充值', -2)
    }
    user.balanceFen = (user.balanceFen || 0) - needFen
    order.payStatus = 1
    order.orderStatus = 1 // 待入场
    order.paidFen = needFen
    saveData(DB)
    return success({ payStatus: 1, balanceFen: user.balanceFen, paidFen: needFen, msg: '支付成功' })
  },

  'GET:/order/list': async (req, body, query) => {
    await delay(400)
    const user = getCurrentUser(req)
    const clientType = getClientType(req)
    let list = [...DB.orders]
    // 角色隔离，杜绝串台：
    // - 用户端(userId=10001)：只看自己作为租客下的单(lesseeId)
    // - 商家端(userId=20001)：看自己车位的订单(ownerId) + 自己作为租客下的单(lesseeId)
    if (clientType === 'merchant') {
      list = list.filter(o => o.ownerId === user.userId || o.lesseeId === user.userId)
    } else {
      list = list.filter(o => o.lesseeId === user.userId)
    }
    const status = Number(query.status)
    if (!isNaN(status) && status >= 0) list = list.filter(o => o.orderStatus === status)
    // 商家端"我的车位"按单车位查看订单
    if (query.spaceId) list = list.filter(o => Number(o.spaceId) === Number(query.spaceId))
    return success({ list, total: list.length })
  },

  'GET:/order/detail': async (req, body, query) => {
    await delay(300)
    const order = DB.orders.find(o => o.orderId === Number(query.orderId))
    if (!order) return fail('订单不存在')
    return success(order)
  },

  'POST:/order/enter': async (req, body) => {
    await delay(300)
    const order = DB.orders.find(o => o.orderId === Number(body.orderId))
    if (order) {
      order.orderStatus = 2 // 停车中
      order.actualStart = formatNow()
      saveData(DB)
    }
    return success({ gateStatus: 'opened', enterTime: order ? order.actualStart : new Date().toISOString() })
  },

  'POST:/order/exit': async (req, body) => {
    await delay(300)
    const order = DB.orders.find(o => o.orderId === Number(body.orderId))
    let penalty = 0
    let isOvertime = 0
    let earlyFee = 0
    let normalFee = 0
    let actualParkingFee = 0
    let refundAmount = 0   // 多退：实际停车费 < 预付停车费
    let extraAmount = 0    // 少补：实际停车费 > 预付停车费（含超时双倍部分）
    let settledAmount = 0  // 车位主实际应收 = 实际停车费（占座诚意金已退还租客）
    if (order) {
      order.actualEnd = formatNow()
      const startT = new Date(order.startTime).getTime()
      const endT = new Date(order.endTime).getTime()
      const now = Date.now()

      // 计费单价（每30分钟单位）：以预付停车费为基准反推，保证与原版/用户版预估口径一致
      const windowMin = Math.max(1, (endT - startT) / 60000)
      const totalUnits = Math.max(1, Math.ceil(windowMin / 30))
      const unitRate = Math.round((order.amount / totalUnits) * 100) / 100

      // 实际占用窗口：从 max(实际入场, 预约开始) 到 min(实际离场, 预约结束)
      const actualStartT = order.actualStart ? new Date(order.actualStart).getTime() : startT
      const occStart = Math.max(actualStartT, startT)
      const occEnd = Math.min(now, endT)
      const normalMin = Math.max(0, (occEnd - occStart) / 60000)
      const normalUnits = normalMin > 0 ? Math.ceil(normalMin / 30) : 0
      normalFee = Math.round(normalUnits * unitRate * 100) / 100

      // 提前到达溢价：实际入场早于预约开始时间，提前段按系数 k 加收（k=1 即按正常单价计）
      const k = Number(order.earlyPremiumK) || EARLY_PREMIUM_K
      if (actualStartT < startT) {
        const earlyMin = Math.ceil((startT - actualStartT) / 60000)
        const earlyUnits = Math.ceil(earlyMin / 30)
        earlyFee = Math.round(earlyUnits * unitRate * k * 100) / 100
      }

      // 超时双倍计费：超过"预约结束 + 15分钟宽限期"后，超时部分按双倍单价计
      const graceMs = 15 * 60 * 1000
      const overtimeMs = now - endT - graceMs
      if (overtimeMs > 0) {
        const overtimeMin = Math.ceil(overtimeMs / 60000)
        const overtimeUnits = Math.ceil(overtimeMin / 30)
        penalty = Math.round(overtimeUnits * unitRate * 2 * 100) / 100
        isOvertime = 1
        order.isOvertime = 1
        order.penaltyAmount = penalty
        // 超时信用扣分（-10），扣分对象为订单租客（实际超停方）
        const user = findUserByUserId(order.lesseeId) || getCurrentUser(req)
        user.creditScore = Math.max(0, (user.creditScore || 100) - 10)
        DB.creditRecords.unshift({
          recordId: Date.now(),
          userId: user.userId,
          eventType: 1,
          scoreChange: -10,
          orderId: order.orderId,
          description: `${formatNow()} 超时占用${overtimeMin}分钟`,
          createdAt: formatNow()
        })
      }

      // 实际停车费 = 正常时段费 + 提前加价 + 超时违约金
      actualParkingFee = Math.round((normalFee + earlyFee + penalty) * 100) / 100

      // 多退少补：与预付停车费（order.amount）比对
      if (actualParkingFee > order.amount) {
        extraAmount = Math.round((actualParkingFee - order.amount) * 100) / 100
      } else if (actualParkingFee < order.amount) {
        refundAmount = Math.round((order.amount - actualParkingFee) * 100) / 100
      }

      // 占座诚意金为可退押金：正常离场原路退还租客，不计入车位主实收
      const reserveFee = order.reserveFee || 0
      if (reserveFee > 0) {
        refundAmount = Math.round((refundAmount + reserveFee) * 100) / 100
      }

      // 结算总额（车位主实际应收）= 实际停车费（占座诚意金已原路退还租客）
      settledAmount = Math.round(actualParkingFee * 100) / 100

      order.normalFee = normalFee
      order.earlyFee = earlyFee
      order.actualParkingFee = actualParkingFee
      order.refundAmount = refundAmount
      order.extraAmount = extraAmount
      order.settledAmount = settledAmount
      order.reserveFeeRefunded = reserveFee > 0
      order.orderStatus = 3 // 已完成（占用由订单窗口自动解除，无需改车位状态）
      saveData(DB)
    }
    return success({
      gateStatus: 'opened',
      isOvertime,
      penaltyAmount: penalty,
      earlyFee,
      normalFee,
      reserveFee: order ? (order.reserveFee || 0) : 0,
      prepaidAmount: order ? (order.amount || 0) : 0,
      actualParkingFee,
      refundAmount,
      extraAmount,
      settledAmount
    })
  },

  'POST:/order/cancel': async (req, body) => {
    await delay(300)
    const order = DB.orders.find(o => o.orderId === Number(body.orderId))
    if (order) {
      // 已支付的预约被取消
      if (order.payStatus === 1) {
        const now = Date.now()
        const startT = new Date(order.startTime).getTime()
        if (now >= startT) {
          // 预约已开始却未到场 → 爽约：扣信用分 + 占座诚意金不退（归车位主，计入收益）
          const user = findUserByUserId(order.lesseeId) || getCurrentUser(req)
          user.creditScore = Math.max(0, (user.creditScore || 100) - 20)
          order.creditDeduct = 20
          order.forfeited = true
          order.forfeitedAmount = order.reserveFee || 0
          DB.creditRecords.unshift({
            recordId: Date.now(),
            userId: user.userId,
            eventType: 2,
            scoreChange: -20,
            orderId: order.orderId,
            description: `${formatNow()} 爽约（取消已开始的预约），占座诚意金不退`,
            createdAt: formatNow()
          })
        } else {
          // 预约尚未开始的正常退订：占座诚意金 + 预付停车费原路退还租客，不扣分不罚没
          order.refunded = true
          order.refundAmount = Math.round(((order.reserveFee || 0) + (order.amount || 0)) * 100) / 100
          order.refundedAmount = order.refundAmount
          DB.creditRecords.unshift({
            recordId: Date.now(),
            userId: order.lesseeId,
            eventType: 3,
            scoreChange: 0,
            orderId: order.orderId,
            description: `${formatNow()} 预约开始前退订，占座诚意金与预付停车费已原路退还`,
            createdAt: formatNow()
          })
        }
      }
      order.orderStatus = 4
      saveData(DB)
    }
    return success({
      orderId: body.orderId,
      orderStatus: 4,
      msg: '已取消',
      refunded: order.refunded || false,
      refundAmount: order.refundAmount || 0
    })
  },

  // ---- 信用 ----
  'GET:/credit/info': async (req) => {
    await delay(300)
    const user = getCurrentUser(req)
    return success({
      score: user.creditScore,
      records: [...DB.creditRecords].filter(r => r.userId === user.userId)
    })
  },

  // ---- 投诉 ----
  'POST:/complaint/submit': async (req, body) => {
    await delay(500)
    const user = getCurrentUser(req)
    const complaintTypes = ['超时占用', '车辆损坏', '态度恶劣', '虚假信息', '其他']
    const newComplaint = {
      complaintId: Date.now(),
      orderId: body.orderId || null,
      type: body.type,
      typeName: complaintTypes[body.type] || '其他',
      description: body.description,
      photos: body.photos || [],
      status: 'pending',
      result: '',
      submitter: user.realName,
      submitterId: user.userId,
      submitTime: formatNow(),
      ownerName: body.ownerName || '待关联',
      communityName: body.communityName || '待关联',
      spaceId: body.spaceId || null
    }
    DB.complaints.unshift(newComplaint)
    // 仅标记订单投诉标记，不改变订单状态
    if (body.orderId) {
      const order = DB.orders.find(o => o.orderId === Number(body.orderId))
      if (order) {
        order.complaintFlag = 1
      }
    }
    saveData(DB)
    return success({ complaintId: newComplaint.complaintId, status: 'pending' })
  },

  'GET:/complaint/list': async () => {
    await delay(300)
    return success({ list: [...DB.complaints], total: DB.complaints.length })
  },

  'GET:/complaint/my-list': async (req) => {
    await delay(300)
    const user = getCurrentUser(req)
    const myComplaints = DB.complaints.filter(c => c.submitterId === user.userId || c.submitter === user.realName || !c.submitter)
    return success({ list: myComplaints, total: myComplaints.length })
  },

  'POST:/admin/resolve-complaint': async (req, body) => {
    await delay(400)
    const complaint = DB.complaints.find(c => c.complaintId === Number(body.complaintId))
    if (complaint) {
      complaint.status = body.rejected ? 'rejected' : 'resolved'
      complaint.result = body.result || (body.rejected ? '投诉不成立' : '投诉已处理，已对相关方进行处理')
      complaint.resolveTime = formatNow()
      saveData(DB)
    }
    return success({ complaintId: body.complaintId, status: complaint ? complaint.status : 'resolved', msg: '已处理' })
  },

  // ---- 商家端：车位审核 ----
  'GET:/admin/pending-spaces': async () => {
    await delay(400)
    return success({ list: [...DB.pendingSpaces], total: DB.pendingSpaces.length })
  },

  'POST:/admin/approve-space': async (req, body) => {
    await delay(400)
    const idx = DB.pendingSpaces.findIndex(s => s.spaceId === Number(body.spaceId))
    if (idx !== -1) {
      const space = DB.pendingSpaces.splice(idx, 1)[0]
      space.auditStatus = 1
      space.status = 1
      space.rating = 5.0
      space.orderCount = 0
      space.successRate = 1.0
      space.tags = ['新上架']
      if (!space.longitude) space.longitude = 109.4918
      if (!space.latitude) space.latitude = 36.5854
      DB.approvedSpaces.unshift(space)
      saveData(DB)
    }
    return success({ spaceId: body.spaceId, auditStatus: 1, msg: '已通过审核' })
  },

  'POST:/admin/reject-space': async (req, body) => {
    await delay(400)
    const idx = DB.pendingSpaces.findIndex(s => s.spaceId === Number(body.spaceId))
    if (idx !== -1) {
      DB.pendingSpaces[idx].auditStatus = 2
      saveData(DB)
    }
    return success({ spaceId: body.spaceId, auditStatus: 2, msg: '已驳回' })
  },

  // ---- 收益 ----
  'GET:/earnings/summary': async () => {
    await delay(300)
    const completedOrders = DB.orders.filter(o => o.orderStatus === 3)
    const forfeitedOrders = DB.orders.filter(o => o.forfeited)
    // 实际收入 = 已完成订单结算额(settledAmount) + 爽约罚没的占座费(forfeitedAmount)
    const totalIncome = completedOrders.reduce((sum, o) => sum + (o.settledAmount || (o.amount || 0) + (o.reserveFee || 0)), 0)
                         + forfeitedOrders.reduce((sum, o) => sum + (o.forfeitedAmount || 0), 0)
    const thisMonthStr = formatNow().slice(0, 7)
    const thisMonth = completedOrders
      .filter(o => (o.actualEnd || '').slice(0, 7) === thisMonthStr)
      .reduce((sum, o) => sum + (o.settledAmount || (o.amount || 0) + (o.reserveFee || 0)), 0)
    const incomeList = completedOrders.map(o => ({
      date: (o.actualEnd || o.createdAt || '').split(' ')[0],
      orderId: o.orderId,
      communityName: o.communityName,
      amount: (o.settledAmount || (o.amount || 0) + (o.reserveFee || 0)).toFixed(2),
      refund: (o.refundAmount || 0),
      extra: (o.extraAmount || 0),
      status: '已到账'
    })).concat(forfeitedOrders.map(o => ({
      date: (o.createdAt || '').split(' ')[0],
      orderId: o.orderId,
      communityName: o.communityName,
      amount: (o.forfeitedAmount || 0).toFixed(2),
      refund: 0,
      extra: 0,
      status: '爽约扣款'
    })))
    return success({
      totalIncome: totalIncome.toFixed(2),
      withdrawable: totalIncome.toFixed(2),
      withdrawn: 0,
      thisMonth: thisMonth.toFixed(2),
      lastMonth: 0,
      incomeList
    })
  },

  // ---- 上传 ----
  'POST:/upload/image': async () => {
    await delay(1000)
    return success({ url: '/images/upload/mock_' + Date.now() + '.png' })
  },

  // ==================== 钱包（停车币 · 代币模式 short_series_coin） ====================
  // 代币模式：用户先充值「停车币」（固定单价的代币道具），再用余额抵扣每笔订单。
  // 充值走微信小程序虚拟支付 short_series_coin（单价固定，真实可接入）；
  // 下单只扣余额，不再逐笔调微信，彻底规避「道具价格固定 vs 订单金额动态」的冲突。

  // ---- 钱包余额 + 充值记录 ----
  'POST:/wallet/balance': async (req) => {
    const user = getCurrentUser(req)
    const list = (DB.coinOrders || [])
      .filter(c => c.userId === user.userId)
      .slice(0, 20)
      .map(c => ({
        orderId: c.orderId,
        coinCount: c.coinCount,
        amountFen: c.amountFen,
        status: c.status,
        createdAt: c.createdAt
      }))
    return success({ balanceFen: user.balanceFen || 0, coinOrders: list })
  },

  // ---- 发起充值：创建停车币充值单并返回微信虚拟支付签名参数 ----
  'POST:/wallet/recharge': async (req, body) => {
    await delay(300)
    const user = getCurrentUser(req)
    let amountFen = Math.round(Number(body.amountFen) || 0)
    if (amountFen <= 0) return fail('充值金额无效')
    const unit = VPAY_COIN_UNIT_PRICE_FEN || 100
    const coinCount = Math.max(1, Math.ceil(amountFen / unit)) // 向上取整到整枚
    const chargedFen = coinCount * unit                        // 实际扣款（仅整枚）
    const outTradeNo = 'CR' + Date.now()
    const coinOrder = {
      orderId: outTradeNo,
      userId: user.userId,
      coinCount,
      amountFen: chargedFen,
      status: 0,
      outTradeNo,
      createdAt: new Date().toISOString()
    }
    DB.coinOrders.unshift(coinOrder)
    saveData(DB)

    // 演示模式：未配置真实虚拟支付密钥，直接入账（无真实微信回调）
    if (!VPAY_REAL) {
      user.balanceFen = (user.balanceFen || 0) + chargedFen
      coinOrder.status = 1
      saveData(DB)
      return success({ mock: true, balanceFen: user.balanceFen, chargedFen, coinCount, outTradeNo, orderId: outTradeNo, msg: '充值成功（演示）' })
    }

    // 真实模式：组装 short_series_coin 签名参数（代币模式无 goodsPrice 字段）
    const signDataObj = {
      offerId: VPAY_OFFER_ID,
      buyQuantity: coinCount,
      env: VPAY_ENV,
      currencyType: VPAY_CURRENCY,
      outTradeNo,
      attach: JSON.stringify({ type: 'coin', userId: user.userId, coinCount, amountFen: chargedFen })
    }
    const signDataStr = JSON.stringify(signDataObj)
    const sessionKey = (user && user.sessionKey) || ''
    const { paySig, signature } = calcVirtualPaySign(signDataStr, sessionKey, VPAY_ENV)
    return success({
      mock: false,
      mode: 'short_series_coin',
      signData: signDataStr,
      paySig,
      signature,
      outTradeNo,
      orderId: outTradeNo,
      coinCount,
      chargedFen
    })
  },

  // ---- 充值结果客户端确认（幂等入账） ----
  // 微信异步回调(/order/virtual-pay-notify) 会入账；此处用于前端支付 success 后主动确认，兜底回调延迟。
  // 重复调用不会重复入账。
  'POST:/wallet/client-confirm': async (req, body) => {
    await delay(100)
    const user = getCurrentUser(req)
    const outTradeNo = body.outTradeNo || ''
    const co = (DB.coinOrders || []).find(c => c.outTradeNo === outTradeNo)
    if (!co) return fail('充值订单不存在')
    if (co.status === 1) return success({ already: true, balanceFen: user.balanceFen || 0 })
    co.status = 1
    user.balanceFen = (user.balanceFen || 0) + co.amountFen
    saveData(DB)
    return success({ balanceFen: user.balanceFen, chargedFen: co.amountFen })
  },

  // ---- 微信小程序虚拟支付：异步回调（米大师通知） ----
  // 生产环境需在 MP 后台「虚拟支付 → 基本配置」配置本回调地址（PUBLIC_BASE_URL + /order/virtual-pay-notify）。
  // 同时处理「停车币充值(CR...)」与「历史订单支付(VP...)」两类通知。微信要求返回 code 0 否则会重试。
  'POST:/order/virtual-pay-notify': async (req, body) => {
    await delay(100)
    const outTradeNo = body.outTradeNo || (body.order_info && body.order_info.out_trade_no) || ''
    // 停车币充值回调
    if (String(outTradeNo).startsWith('CR')) {
      const co = (DB.coinOrders || []).find(c => c.outTradeNo === outTradeNo)
      if (co && co.status !== 1) {
        const u = findUserByUserId(co.userId)
        co.status = 1
        if (u) u.balanceFen = (u.balanceFen || 0) + co.amountFen
        saveData(DB)
      }
      return success({ received: true, type: 'coin', outTradeNo })
    }
    // 历史订单支付回调（道具模式遗留，当前主流程已走余额，仅作兼容）
    const orderId = Number(String(outTradeNo).replace(/^VP/, ''))
    const order = DB.orders.find(o => o.orderId === orderId)
    if (order && order.payStatus !== 1) {
      order.payStatus = 1
      order.orderStatus = 1 // 待入场
      saveData(DB)
    }
    return success({ received: true, orderId })
  }
}

// ==================== HTTP 服务器 ====================

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Type'
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        // 可能是 multipart/form-data（文件上传），直接返回空对象
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return sendJson(res, {}, 204)
  }

  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/' // 去掉尾部斜杠
  const query = parsedUrl.query
  const method = req.method

  // 文件上传特殊处理
  if (pathname === '/upload/image' && method === 'POST') {
    await delay(1000)
    return sendJson(res, success({ url: '/images/upload/mock_' + Date.now() + '.png' }))
  }

  const routeKey = `${method}:${pathname}`
  const handler = routes[routeKey]

  if (!handler) {
    console.warn(`[404] 未找到路由: ${routeKey}`)
    return sendJson(res, fail(`接口 [${routeKey}] 尚未实现`, 404))
  }

  try {
    const body = method === 'POST' ? await readBody(req) : {}
    const result = await handler(req, body, query)
    return sendJson(res, result)
  } catch (e) {
    console.error(`[ERROR] 路由 ${routeKey} 异常:`, e)
    return sendJson(res, fail('服务器内部错误'))
  }
})

server.listen(PORT, () => {
  console.log('========================================')
  console.log('  共享停车 - 本地后端服务器已启动')
  console.log('========================================')
  console.log(`  地址: http://localhost:${PORT}`)
  console.log(`  数据: ${DATA_FILE}`)
  console.log('')
  console.log('  用户端请求头: X-Client-Type: user')
  console.log('  商家端请求头: X-Client-Type: merchant')
  console.log('')
  console.log('  按 Ctrl+C 停止服务器')
  console.log('========================================')
})
