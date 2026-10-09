# 共享停车小程序（微信支付版）

一个基于**微信小程序虚拟支付（米大师）**的真实可收款共享停车项目，配套一个**零依赖、可经 GitHub 一键部署**的 Node.js 后端。

- 小程序端：原生微信小程序（`miniprogram/`），含找车位、预约下单、钱包充值、订单、发布车位、个人中心。
- 后端：`server/`，纯 Node.js 内置模块（**无任何第三方依赖**），JSON 文件持久化，支持真实微信登录与虚拟支付签名。
- 部署：零依赖 + `package.json` / `Dockerfile` / `Procfile` / GitHub Actions，一键部署到 Render / Heroku / Railway / 任意 Node PaaS。

> 💡 本项目已内置「**代币模式（short_series_coin）**」：用户先充值「停车币」（固定单价代币道具），预约时用**钱包余额**抵扣每笔订单的可变金额。这是微信官方推荐的「高频、多次、小额消费」接入方式，规避了「道具直购要求道具价格固定、但每笔订单金额动态」导致的真实接入失败。详见 [`server/微信虚拟支付开通与配置指南.md`](server/微信虚拟支付开通与配置指南.md)。

---

## 一、目录结构

```
共享停车小程序-微信支付版/
├── README.md                     # 本文件（项目总说明 + 部署指南）
├── miniprogram/                  # 微信小程序前端（用微信开发者工具打开此目录）
│   ├── app.js / app.json         # 全局配置（含 baseUrl 占位符）
│   ├── utils/api.js              # 请求封装（BASE_URL 指向后端公网地址）
│   ├── pages/
│   │   ├── index/                # 找车位（首页，地图/距离/筛选）
│   │   ├── booking/              # 预约下单 + 余额支付
│   │   ├── wallet/               # 我的钱包（停车币充值，真实虚拟支付）
│   │   ├── orders/               # 我的订单
│   │   ├── publish/              # 发布车位（地图选址）
│   │   ├── mine/                 # 个人中心（含钱包入口、信用分）
│   │   └── ...                   # 投诉、认证、详情等
│   └── ...
└── server/                       # 零依赖 Node.js 后端（可独立部署）
    ├── server.js                 # 主程序（HTTP + 路由 + 微信登录/虚拟支付签名）
    ├── package.json              # 仅声明 start 脚本与 engines，无依赖
    ├── Dockerfile                # 容器镜像（构建上下文 = server/）
    ├── Procfile                  # Heroku/Railway 启动命令
    ├── config.example.json       # 配置模板（微信登录 / 虚拟支付密钥）
    ├── data.example.json         # 示例数据（首次运行自动播种为 data.json）
    ├── .gitignore                # 忽略 data.json / config.json / *.log
    ├── 微信虚拟支付开通与配置指南.md
    └── .github/workflows/        # 推送 main 时自动 lint + 触发部署
```

> 后端配置与接口细节见 [`server/README.md`](server/README.md)；
> 微信虚拟支付的开通、类目、密钥、回调配置见 [`server/微信虚拟支付开通与配置指南.md`](server/微信虚拟支付开通与配置指南.md)。

---

## 二、本地快速体验（不部署也能跑）

### 1. 启动后端

```bash
cd server
node server.js            # 默认 http://localhost:3000
```

> 首次运行会自动用 `data.example.json` 生成 `data.json`（含 3 个示例车位）。
> 未配置微信密钥时，登录与钱包充值自动进入**演示模式**，可完整体验「找车位 → 预约 → 充值 → 支付 → 入场 → 离场」闭环。

### 2. 配置小程序前端

用**微信开发者工具**打开本仓库的 `miniprogram/` 目录，然后把后端地址填进两处：

- `miniprogram/utils/api.js` 的 `BASE_URL`
- `miniprogram/app.js` 的 `globalData.baseUrl`

本地调试时填 `http://localhost:3000`，开发期可在开发者工具勾选「不校验合法域名」。

### 3. 真机 / 上线前

- 把后端部署到公网（见第三节），拿到 `https://你的后端地址`。
- 将 `BASE_URL` / `baseUrl` 改为该公网地址。
- 在微信公众平台把该域名加入**「request 合法域名」**；虚拟支付回调地址填 `https://你的后端地址/order/virtual-pay-notify`。

---

## 三、经 GitHub 部署（让后端公网可访问）

后端零依赖，已附带部署脚手架，推荐用 **Render**（免费额度够用，最简单）：

### 步骤 1：初始化 Git 并提交

```bash
git init
git add -A
git commit -m "共享停车小程序-微信支付版：零依赖后端 + 代币模式虚拟支付"
```

> `data.json` / `config.json` / `*.log` 已被 `.gitignore` 忽略，不会进入仓库（含密钥/用户数据，切勿提交）。

### 步骤 2：推送到 GitHub

```bash
git remote add origin https://github.com/<你的用户名>/shared-parking.git
git branch -M main
git push -u origin main
```

### 步骤 3：在 Render 部署

1. 登录 [render.com](https://render.com) → **New → Web Service** → 关联上面的 GitHub 仓库。
2. **Root Directory** 填 `server`（构建上下文指向后端目录）。
3. **Build Command** 留空（零依赖，无需安装）；**Start Command** 填 `node server.js`。
4. **Environment** 添加变量（见下表）。
5. 部署完成后拿到 `https://xxxx.onrender.com`，即后端公网地址。

> 其它平台同理：Heroku / Railway / Fly.io 选「连接 GitHub 仓库」并把构建根目录设为 `server/` 即可。
> 自有服务器：`git clone` 后 `cd server && npm start`，或用 `Dockerfile` 构建镜像运行。

### 步骤 4：配置持续部署（可选）

仓库已含 `.github/workflows/deploy.yml`：每次 push 到 `main` 会先做语法校验，
若仓库配置了 Secret `RENDER_DEPLOY_HOOK` 则自动触发 Render 重新部署。
在 GitHub 仓库 **Settings → Secrets** 添加该变量即可。

### 部署所需环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 监听端口（PaaS 通常自动注入） |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | 公网地址，用于生成虚拟支付回调地址 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 空 | 真实微信登录（不填则演示模式） |
| `VPAY_OFFER_ID` | 空 | 米大师 OfferID（虚拟支付应用 ID） |
| `VPAY_APPKEY_PROD` | 空 | 现网 AppKey（真实交易用，仅服务端） |
| `VPAY_APPKEY_SANDBOX` | 空 | 沙箱 AppKey（env=1 时用） |
| `VPAY_COIN_PRODUCT_ID` | 空 | 「停车币」代币道具 ID |
| `VPAY_COIN_UNIT_PRICE_FEN` | 100 | 每枚停车币单价（分），如 100=¥1/枚 |
| `VPAY_ENV` | 0 | 0=正式 / 1=沙箱 |

> 不上云也能本地跑：把上述 `vpay.*` 直接写进 `server/config.json`（参考 `config.example.json`）。

---

## 四、支付模型说明（代币模式 short_series_coin）

```
用户 ──充值停车币──▶ 微信虚拟支付(short_series_coin, 固定单价) ──▶ 后端钱包余额(+)
                                │
用户 ──预约下单──▶ 后端 /order/pay ──从钱包余额扣减(停车费+占座诚意金)──▶ 锁定车位
```

- **充值**：`POST /wallet/recharge` 创建充值单并返回 `signData/paySig/signature`，前端调起 `wx.requestVirtualPayment`；微信异步回调 `/order/virtual-pay-notify`（或前端 `success` 后 `/wallet/client-confirm`）入账。
- **消费**：`POST /order/pay` 从钱包余额扣减，余额不足返回 `code:-2` 提示去充值。
- **演示模式**：未配置密钥时 `/wallet/recharge` 直接入账，无需真实微信回调，可端到端联调。

---

## 五、技术要点

- **零依赖后端**：只用 Node 内置 `http` / `crypto` / `fs` / `path`，无需 `npm install`。
- **双端隔离**：通过 `X-Client-Type: user | merchant` 请求头区分用户端与（若接入）商家端，订单按角色隔离，杜绝串台。
- **真实微信登录**：`/auth/login` 用 `code2Session` 换 openid（配置 `WECHAT_APPID/SECRET` 后生效；否则演示模式）。
- **签名安全**：AppKey / sessionKey 仅在服务端使用，前端绝不持有；签名算法 `HMAC-SHA256`（已内置）。
- **数据重置**：删除 `server/data.json` 即恢复示例数据。

---

## 六、合规提醒

- 微信小程序虚拟支付**仅限虚拟商品/服务**，严禁实物/线下交易。
- 个人主体需满足：类目含「工具」（如工具-预约/报名）、完成个人认证、完成 ICP 备案；月限额 10 万元；Android 费率约 1%（限时优惠），iOS 约 12%（苹果税）。
- 更多开通与类目、回调、查单兜底细节见 [`server/微信虚拟支付开通与配置指南.md`](server/微信虚拟支付开通与配置指南.md)。
