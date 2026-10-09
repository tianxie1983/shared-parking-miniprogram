# 共享停车 - 零依赖后端服务（微信支付版）

零依赖（仅 Node.js 内置模块）的共享停车后端，数据存储在 `data.json`。
支持**真实微信登录**与**微信小程序虚拟支付（代币模式 short_series_coin）**。

## 启动

```bash
node server.js          # 默认 http://localhost:3000（可用 PORT 环境变量覆盖）
# 或双击 start.bat
```

启动成功输出：
```
========================================
  共享停车 - 本地后端服务器已启动
========================================
  地址: http://localhost:3000
  数据: ...\data.json
========================================
```

## 目录文件

| 文件 | 说明 |
|------|------|
| `server.js` | 主程序：HTTP 服务 + 路由 + 微信登录/虚拟支付签名 |
| `config.example.json` | 配置模板（微信登录 / 虚拟支付） |
| `data.example.json` | 示例数据（首次运行自动播种为 `data.json`） |
| `data.json` | 运行数据（自动生成，已 gitignore，删除即重置） |
| `Dockerfile` / `Procfile` / `package.json` | 部署脚手架（构建上下文 = 本目录） |
| `.github/workflows/deploy.yml` | 推送 main 自动 lint + 触发部署 |

## 双端联动

用户端与小程序前端通过本服务联动；通过 `X-Client-Type` 请求头区分：

- 用户端：`X-Client-Type: user`（userId: 10001）
- 商家端：`X-Client-Type: merchant`（userId: 20001）

认证 Token 通过 `Authorization: Bearer <token>` 传递。

## 微信小程序虚拟支付（代币模式 short_series_coin）

停车费属于「高频、多次、小额消费」，按微信官方指引采用**代币模式**：用户先充值
「停车币」（固定单价代币道具），再用工夫余额抵扣每笔订单的可变金额。这样充值金额
固定（匹配米大师代币兑换比例），规避了「道具直购要求价格固定、但订单金额动态」的冲突。

### 接口

| 接口 | 说明 |
|------|------|
| `POST /wallet/balance` | 查余额 + 充值记录 |
| `POST /wallet/recharge` | 发起充值：返回 `signData/paySig/signature`（真实模式）或直接入账（演示模式） |
| `POST /wallet/client-confirm` | 前端支付 success 后主动确认入账（幂等兜底） |
| `POST /order/pay` | 从钱包余额扣减订单金额（停车费 + 占座诚意金）；不足返回 `code:-2` |
| `POST /order/virtual-pay-notify` | 微信异步回调：处理 `CR...` 充值单入账（幂等） |

### 配置（config.json 或环境变量）

| config.json 字段 | 环境变量 | 说明 |
|------------------|----------|------|
| `vpay.offerId` | `VPAY_OFFER_ID` | 米大师 OfferID |
| `vpay.appKeyProd` | `VPAY_APPKEY_PROD` | 现网 AppKey（仅服务端） |
| `vpay.appKeySandbox` | `VPAY_APPKEY_SANDBOX` | 沙箱 AppKey |
| `vpay.coinProductId` | `VPAY_COIN_PRODUCT_ID` | 「停车币」代币道具 ID |
| `vpay.coinUnitPriceFen` | `VPAY_COIN_UNIT_PRICE_FEN` | 每枚单价（分），默认 100（¥1/枚） |
| `vpay.env` | `VPAY_ENV` | 0=正式 / 1=沙箱 |

> 未配置密钥时，充值以**演示模式**直接入账（无真实微信回调），可端到端联调。
> 完整开通/类目/回调/查单配置见 [`微信虚拟支付开通与配置指南.md`](微信虚拟支付开通与配置指南.md)。

### 签名算法（已内置）

```
paySig    = hex( hmac_sha256( appKey,     'requestVirtualPayment' + '&' + signData ) )
signature = hex( hmac_sha256( sessionKey, 'requestVirtualPayment' + '&' + signData ) )
```

## 经 GitHub 部署

零依赖 + `package.json` / `Dockerfile` / `Procfile` / `.github`，可一键部署到任意
Node PaaS。仓库根目录 `README.md` 的「经 GitHub 部署」一节有完整步骤（Render / Heroku / Railway）。

## 环境变量总览

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 监听端口 |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | 公网地址，生成虚拟支付回调 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 空 | 真实微信登录（空则演示） |
| `VPAY_*` | 空 | 见上表 |

## 重置数据

删除 `data.json` 即重置为 `data.example.json` 示例数据。
