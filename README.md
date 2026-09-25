# xhshow-ts

<div align="center">

小红书请求签名生成库的 TypeScript 实现，支持 GET/POST 请求的 x-s 和 x-s-common 签名。

本项目基于 [Cloxl/xhshow](https://github.com/Cloxl/xhshow) 的 Python 实现移植而来，感谢原作者的无私奉献！

[![npm version](https://img.shields.io/npm/v/@ikenxuan/xhshow-ts.svg)](https://www.npmjs.com/package/@ikenxuan/xhshow-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

> ⚠️ **声明**：本 Fork 代码由 AI 辅助生成，仅供学习研究使用，不保证与上游仓库行为完全一致。

## 致谢

特别感谢 [Cloxl](https://github.com/Cloxl) 开源的 [xhshow](https://github.com/Cloxl/xhshow) 项目，本项目的核心算法逻辑均来源于此。

## 系统要求

- Node.js 16+
- TypeScript 5.0+（可选，用于开发）

## 安装

```bash
npm install @ikenxuan/xhshow-ts
```

或使用其他包管理器：

```bash
# yarn
yarn add @ikenxuan/xhshow-ts

# pnpm
pnpm add @ikenxuan/xhshow-ts
```

## 快速开始

### ESM（推荐）

```typescript
import { Xhshow } from '@ikenxuan/xhshow-ts'

const client = new Xhshow()

// GET 请求签名
const getSignature = client.signXsGet(
  '/api/sns/web/v1/user_posted',
  'your_a1_cookie_value',
  'xhs-pc-web',
  { num: '30', cursor: '', user_id: '123' }
)

// POST 请求签名
const postSignature = client.signXsPost(
  '/api/sns/web/v1/login',
  'your_a1_cookie_value',
  'xhs-pc-web',
  { username: 'test', password: '123456' }
)

// x-s-common 签名
const xsCommon = client.signXsc({
  a1: 'your_a1_cookie_value',
  web_session: 'your_web_session'
})

// 一次性生成所有请求头
const headers = client.signHeadersGet(
  '/api/sns/web/v1/user_posted',
  { a1: 'your_a1_cookie_value', web_session: '...' },
  'xhs-pc-web',
  { num: '30' }
)
// headers 包含: x-s, x-s-common, x-t, x-b3-traceid, x-xray-traceid, x-mns, xy-direction
```

### XYW 签名格式（数据接口绕过 HTTP 406）

自 2026 年 3 月起，数据获取类接口（如 `user_posted`、`user/otherinfo` 等）会以
HTTP 406 拒绝传统的 XYS_ 格式签名，需改用基于 AES-128-CBC 的 XYW_ 格式。通过
`signFormat: 'xyw'` 启用：

```typescript
// 直接生成 XYW_ 签名
const xyw = client.signXyw(
  'GET',
  '/api/sns/web/v1/user_posted',
  'your_a1_cookie_value',
  'xhs-pc-web',
  { num: '30', cursor: '' }
)

// 或在请求头中通过 signFormat 启用（第 7 个参数）
const headers = client.signHeadersGet(
  '/api/sns/web/v1/user_posted',
  { a1: 'your_a1_cookie_value', web_session: '...' },
  'xhs-pc-web',
  { num: '30' },
  undefined,   // timestamp
  undefined,   // session
  'xyw'        // signFormat: 'xys'（默认）| 'xyw'
)
// 此时 headers['x-s'] 以 XYW_ 开头
```

### x-rap-param（feed / 搜索 / 发布类接口）

feed、搜索、笔记发布等接口需要额外的 `x-rap-param` 请求头，通过 `xRap: true` 启用：

```typescript
const headers = client.signHeadersPost(
  '/api/sns/web/v1/feed',
  { a1: 'your_a1_cookie_value', web_session: '...' },
  'xhs-pc-web',
  { source_note_id: '...' },
  undefined,   // timestamp
  undefined,   // session
  'xys',       // signFormat
  '你的_user_id', // userId（用于 xy-direction 分片，可选）
  true         // xRap：生成 x-rap-param
)
// headers 额外包含 x-rap-param
```

### 签名默认值与会话时间

根据 2026-09-25 的浏览器抓包记录，默认 `x-s-common` 使用 `x1=4.4.3`、
`x4=6.56.3`（Cookie 里有 `webBuild` 时以 Cookie 为准），`x-rap-param` 使用 SDK 协议版本 `10301`。

`x-s-common` 的 `x12` 格式为 `请求时间戳;会话起始时间戳`（毫秒）。第一段在每次
生成签名时刷新；第二段默认使用模块加载时间，同一模块的多个客户端实例共享此值。
这是无法获知 Cookie 实际创建时间时的回退值，与 `SessionManager` 的状态独立。

如需使用调用方管理的会话起始时间，可保留动态 getter 覆盖模板。只展开模板会把
`x12` 求值为当前字符串，因此自定义模板时应重新定义 getter，避免冻结请求时间：

```typescript
import { CryptoConfig, Xhshow } from '@ikenxuan/xhshow-ts'

const defaults = new CryptoConfig()
const sessionStartMs = Date.now() // 替换为调用方保存的会话起始时间
const config = defaults.withOverrides({
  SIGNATURE_XSCOMMON_TEMPLATE: {
    ...defaults.SIGNATURE_XSCOMMON_TEMPLATE,
    get x12 () {
      return `${Date.now()};${sessionStartMs}`
    }
  }
})
const client = new Xhshow(config)
```

直接调用 `xRapParam(api, data, { sdkVersion })` 仍可覆盖 XRAP 协议版本。签名默认值
更新后需重新执行 `pnpm build`；包的 ESM/CJS 入口均从 `dist` 加载构建产物。

### 生成 Cookie 与辅助参数

```typescript
// 生成 a1 与 web_id
const a1 = Xhshow.generateA1()          // 52 字符
const webId = Xhshow.generateWebId(a1)  // 32 字符 hex

// 搜索接口参数
const searchId = client.getSearchId()             // base36
const requestId = client.getSearchRequestId()     // "{random}-{timestamp_ms}"
```

### 使用会话管理（推荐）

会话管理器可以模拟真实用户在同一页面中的连续操作，生成更真实的签名，提高长期稳定性：

```typescript
import { Xhshow, SessionManager } from '@ikenxuan/xhshow-ts'

const client = new Xhshow()
const session = new SessionManager()

// 使用会话管理器进行多次请求
const headers1 = client.signHeadersGet(
  '/api/sns/web/v1/user_posted',
  { a1: 'your_a1_cookie_value', web_session: '...' },
  'xhs-pc-web',
  { num: '30' },
  undefined,
  session  // 传入会话管理器
)

// 第二次请求，会话状态会自动更新
const headers2 = client.signHeadersGet(
  '/api/sns/web/v1/user_posted',
  { a1: 'your_a1_cookie_value', web_session: '...' },
  'xhs-pc-web',
  { num: '30', cursor: 'next_page' },
  undefined,
  session  // 使用同一个会话管理器
)

// 会话管理器的工作原理：
// - 无 Session：每次请求生成随机参数，可能被识别为机器人
// - 有 Session：维护固定的页面加载时间戳和单调递增的计数器，模拟真实用户行为
```

### XYS 字段（x4~x7）与会话 SSK

`signXs` 按前端 `seccore_signv2` 输出 `x0~x5`，会话带 webSsk 时再加 `x6/x7`：

| 字段 | 含义 |
|------|------|
| `x0` / `x1` / `x2` | 签名版本 `4.4.3` / 应用 ID / 平台名（随 `forUserAgent` 变） |
| `x3` | mnsv2 签名（`mns0301_` 档位，明文布局见下） |
| `x4` | 请求体类型：POST 为 `'object'`，GET 为 `''` |
| `x5` | 签名内容串（URI + 查询串或 JSON 请求体）的 MD5 |
| `x6` / `x7` | 会话 SSK 证明，按 appId 分键：`x7 = nonce(4) ‖ sha1(ssk ‖ nonce) ‖ ssk[32:]`，`x6 = sha1(md5 ‖ x7)` |

x4~x7 已与页面自己签出的 21 条 `XYS_` 逐字节核对一致；登录态下
homefeed、评论翻页、子评论在带与不带 x4~x7 时均正常返回。服务端目前不强制 x6/x7。

x3 解密后是 144 字节明文，2026-09-26 与页面签出的 20 条 x3 逐字段核对：内容 MD5 段为
`md5(内容)[0:8]`，a3 段为 `dsf(le64(时间戳) ‖ md5(URI))`，两者都逐字节异或版本字段的低字节；
env 尾部取页面稳定后的值。页面刚加载的约 1 秒里会先用 `mns0201_` / `mns0101_` 档位，
这里只生成稳定后的 `mns0301_`。

SSK 可以直接从浏览器 `localStorage.getItem('webSsk')` 复制：

```typescript
import { SessionManager, Xhshow } from '@ikenxuan/xhshow-ts'

const session = new SessionManager(undefined, { webSsk: '{"xhs-pc-web":"..."}' })
const headers = client.signHeadersPost('/api/sns/web/v1/homefeed', cookies, 'xhs-pc-web', body, undefined, session)
```

也可以在登录时自己换一份。前端只在登录类接口（`SSK_ISSUE_APIS`：扫码状态、验证码登录等）
的请求里带上客户端公钥，游客会话和已登录会话调 `login/activate` 都不会下发：

```typescript
import { CryptoConfig, createWebSskExchange, extractEncryptedSsk } from '@ikenxuan/xhshow-ts'

const exchange = createWebSskExchange(new CryptoConfig().SSK_SERVER_PUBLIC_KEY)
// POST 放进请求体，GET 放进同名 query 参数
const res = await post('/api/sns/web/v1/login/qrcode/status', { ...body, clientPublicKeyBase64: exchange.clientPublicKeyBase64 })
const encrypted = extractEncryptedSsk(res)
if (encrypted) session.setWebSsk({ 'xhs-pc-web': exchange.acceptEncryptedSsk(encrypted) })
```

### 浏览器搜索网关（bws）

`bws.xiaohongshu.com` 上的浏览器搜索与加密 ID 解密接口**不需要签名和 Cookie**，
但有两个必填、缺了只会报笼统错误的字段，这里提供请求体构造：

```typescript
import {
  BWS_BASE_URL, BWS_SEARCH_PATH, BWS_RESOURCE_DECRYPT_PATH,
  buildBrowserSearchBody, buildBrowserSearchHeaders, buildResourceDecryptBody
} from '@ikenxuan/xhshow-ts'

// 请求体自动带上 xhsBrowserChannel（缺了回 code -1「内部错误」）
const body = buildBrowserSearchBody({ keyword: '咖啡', page: 1 })
const res = await fetch(BWS_BASE_URL + BWS_SEARCH_PATH, {
  method: 'POST', headers: { ...buildBrowserSearchHeaders(), 'user-agent': ua }, body: JSON.stringify(body)
})

// 搜索结果里的 note.id / note.user.userid 是 46 位加密串，解开后是 24 位 hex；
// 请求体必须带 resourceType（缺了回 HTTP 400），取值不影响结果
const decryptBody = buildResourceDecryptBody(encryptedId)
```

注意 user-agent 不能是空串（HTTP 461），可用 `isBlockedByBwsGateway(ua)` 自查。

### CommonJS

```javascript
const { Xhshow } = require('@ikenxuan/xhshow-ts')

const client = new Xhshow()

const getSignature = client.signXsGet(
  '/api/sns/web/v1/user_posted',
  'your_a1_cookie_value',
  'xhs-pc-web',
  { num: '30', cursor: '', user_id: '123' }
)
```

## API 参考

### 签名方法

| 方法 | 说明 |
|------|------|
| `signXs(method, uri, a1Value, xsecAppid?, payload?, timestamp?, session?)` | 通用签名（XYS_ 格式） |
| `signXsGet(uri, a1Value, xsecAppid?, params?, timestamp?, session?)` | GET 请求签名 |
| `signXsPost(uri, a1Value, xsecAppid?, payload?, timestamp?, session?)` | POST 请求签名 |
| `signXyw(method, uri, a1Value, xsecAppid?, payload?, timestamp?)` | XYW_ 格式签名（AES-128-CBC，绕过数据接口 406） |
| `signXsc(cookieDict)` | 生成 x-s-common 签名 |

### 请求头生成

| 方法 | 说明 |
|------|------|
| `signHeaders(method, uri, cookies, xsecAppid?, params?, payload?, timestamp?, session?, signFormat?, userId?, xRap?)` | 生成完整请求头 |
| `signHeadersGet(uri, cookies, xsecAppid?, params?, timestamp?, session?, signFormat?, userId?, xRap?)` | GET 请求头 |
| `signHeadersPost(uri, cookies, xsecAppid?, payload?, timestamp?, session?, signFormat?, userId?, xRap?)` | POST 请求头 |

参数说明：
- `signFormat`：`'xys'`（默认）或 `'xyw'`（数据接口需用，绕过 HTTP 406）
- `userId`：可选，提供后按 user_id 计算 `xy-direction` 分片值，否则随机
- `xRap`：是否生成 `x-rap-param` 请求头（feed、搜索、发布类接口需要）

生成的请求头包含：`x-s`、`x-s-common`、`x-t`、`x-b3-traceid`、`x-xray-traceid`、`x-mns`、`xy-direction`（`xRap: true` 时额外包含 `x-rap-param`）。

### 会话管理

| 类/方法 | 说明 |
|------|------|
| `SessionManager` | 会话管理器类，`new SessionManager(config?, { webSsk? })` |
| `session.getCurrentState(content)` | 获取当前签名状态 |
| `session.updateState()` | 更新会话状态 |
| `session.setWebSsk(webSsk)` | 替换会话 SSK（JSON 字符串或映射，传空清除） |

### 会话 SSK 与浏览器搜索

| 方法 | 说明 |
|------|------|
| `buildSskProof(contentMd5, webSsk, nonce?)` | 计算 x6/x7，没有可用 SSK 时返回 `null` |
| `parseWebSsk(value)` | 把 localStorage 的 webSsk 统一成 appId → base64 映射 |
| `createWebSskExchange(serverPublicKey)` | 发起一次 X25519 交换，返回客户端公钥与解密函数 |
| `extractEncryptedSsk(response)` | 从登录类接口 / webprofile 响应里取 SSK 密文 |
| `buildBrowserSearchBody(params)` | bws 浏览器搜索请求体 |
| `buildResourceDecryptBody(resourceId, resourceType?)` | bws 加密 ID 解密请求体 |
| `buildBrowserSearchHeaders()` | bws 请求头 |
| `isBlockedByBwsGateway(ua)` | UA 是否会被 bws 网关拦截 |

### 工具方法

| 方法 | 说明 |
|------|------|
| `decodeXs(xsSignature)` | 解密 XYS 签名 |
| `decodeX3(x3Signature)` | 解密 x3 签名 |
| `buildUrl(baseUrl, params?)` | 构建带参数的 URL |
| `buildJsonBody(payload)` | 构建 JSON body |
| `getB3TraceId()` | 生成 x-b3-traceid |
| `getXrayTraceId(timestamp?, seq?)` | 生成 x-xray-traceid |
| `getXT(timestamp?)` | 生成 x-t 时间戳 |
| `getSearchId()` | 生成搜索接口 search_id（base36） |
| `getSearchRequestId()` | 生成搜索接口 request_id |
| `Xhshow.generateA1()` | 生成 a1 Cookie 值（52 字符，静态方法） |
| `Xhshow.generateWebId(a1)` | 由 a1 生成 web_id（32 字符 hex，静态方法） |

## 类型定义

```typescript
type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null
type SignFormat = 'xys' | 'xyw'

interface SignState {
  pageLoadTimestamp: number
  sequenceValue: number
  windowPropsLength: number
  uriLength: number
}

class SessionManager {
  constructor(config?: CryptoConfig)
  updateState(): void
  getCurrentState(content: string): SignState
}

interface Xhshow {
  signXs(method: Method, uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number, session?: SessionManager): string
  signXsGet(uri: string, a1Value: string, xsecAppid?: string, params?: Payload, timestamp?: number, session?: SessionManager): string
  signXsPost(uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number, session?: SessionManager): string
  signXyw(method: Method, uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number, session?: SessionManager): string
  signXsc(cookieDict: Record<string, any> | string): string
  signHeaders(method: Method, uri: string, cookies: Record<string, any> | string, xsecAppid?: string, params?: Payload, payload?: Payload, timestamp?: number, session?: SessionManager, signFormat?: SignFormat, userId?: string | null, xRap?: boolean): Record<string, string>
  signHeadersGet(uri: string, cookies: Record<string, any> | string, xsecAppid?: string, params?: Payload, timestamp?: number, session?: SessionManager, signFormat?: SignFormat, userId?: string | null, xRap?: boolean): Record<string, string>
  signHeadersPost(uri: string, cookies: Record<string, any> | string, xsecAppid?: string, payload?: Payload, timestamp?: number, session?: SessionManager, signFormat?: SignFormat, userId?: string | null, xRap?: boolean): Record<string, string>
  decodeXs(xsSignature: string): Record<string, any>
  decodeX3(x3Signature: string): Uint8Array
  buildUrl(baseUrl: string, params?: Record<string, any> | null): string
  buildJsonBody(payload: Record<string, any>): string
  getB3TraceId(): string
  getXrayTraceId(timestamp?: number, seq?: number): string
  getXT(timestamp?: number): number
  getSearchId(): string
  getSearchRequestId(): string
}

// 静态方法
Xhshow.generateA1(): string
Xhshow.generateWebId(a1: string): string
```

## 开发

```bash
# 克隆项目
git clone https://github.com/ikenxuan/xhshow-ts
cd xhshow-ts

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 回归测试
pnpm test

# 类型检查
pnpm exec tsc --noEmit

# 构建
pnpm build
```

### 项目结构

```
src/
├── client.ts          # 主客户端类
├── session.ts         # 会话管理器
├── core/              # 核心加密处理
├── config/            # 配置
├── data/              # 指纹数据
├── generators/        # 指纹生成器
├── utils/             # 工具函数
└── validators.ts      # 参数验证
```

## 相关项目

- [Cloxl/xhshow](https://github.com/Cloxl/xhshow) - 原版 Python 实现（本项目上游）

## License

[MIT](LICENSE)
