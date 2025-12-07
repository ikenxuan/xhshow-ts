# xhshow-ts

<div align="center">

小红书请求签名生成库的 TypeScript 实现，支持 GET/POST 请求的 x-s 和 x-s-common 签名。本 Fork 代码由 AI 生成，仅供个人使用，不保证与上游仓库行为一致。

</div>

## 系统要求

- Node.js 16+
- TypeScript 5.0+ (可选，用于开发)

## 安装

```bash
npm install @ikenxuan/xhshow-ts
```

或使用其他包管理器：

```bash
# 使用 yarn
yarn add @ikenxuan/xhshow-ts

# 使用 pnpm
pnpm add @ikenxuan/xhshow-ts
```

## 使用方法

### ESM (推荐)

```typescript
import { Xhshow } from '@ikenxuan/xhshow-ts'

const client = new Xhshow()

// GET请求签名
const getSignature = client.signXsGet(
  "/api/sns/web/v1/user_posted",
  "your_a1_cookie_value",
  "xhs-pc-web",
  { num: "30", cursor: "", user_id: "123" }
)

// POST请求签名
const postSignature = client.signXsPost(
  "/api/sns/web/v1/login",
  "your_a1_cookie_value", 
  "xhs-pc-web",
  { username: "test", password: "123456" }
)

// x-s-common 签名
const xsCommon = client.signXsc({
  a1: "your_a1_cookie_value",
  web_session: "your_web_session"
})

// 一次性生成所有请求头
const headers = client.signHeadersGet(
  "/api/sns/web/v1/user_posted",
  { a1: "your_a1_cookie_value", web_session: "..." },
  "xhs-pc-web",
  { num: "30" }
)
// headers 包含: x-s, x-s-common, x-t, x-b3-traceid, x-xray-traceid
```

### CommonJS

```javascript
const { Xhshow } = require('@ikenxuan/xhshow-ts')

const client = new Xhshow()

// GET请求签名
const getSignature = client.signXsGet(
  "/api/sns/web/v1/user_posted",
  "your_a1_cookie_value",
  "xhs-pc-web",
  { num: "30", cursor: "", user_id: "123" }
)
```

### 通用方法

```typescript
import { Xhshow } from '@ikenxuan/xhshow-ts'

const client = new Xhshow()

// 通用签名方法
const signature = client.signXs(
  "GET",  // 或 "POST"
  "/api/sns/web/v1/user_posted",
  "your_a1_cookie_value",
  "xhs-pc-web",
  { num: "30", cursor: "", user_id: "123" }
)
```

## API 参考

### Xhshow 类

#### `signXs(method, uri, a1Value, xsecAppid?, payload?, timestamp?)`

通用签名方法

- `method`: `'GET' | 'POST'` - 请求方法
- `uri`: `string` - 请求URI（支持完整URL或仅路径）
- `a1Value`: `string` - cookie中的a1值
- `xsecAppid`: `string` - 应用标识符，默认为 `'xhs-pc-web'`
- `payload`: `Record<string, any> | null` - 请求参数
- `timestamp`: `number` - Unix时间戳（秒），默认为当前时间

#### `signXsGet(uri, a1Value, xsecAppid?, params?, timestamp?)`

GET请求专用签名方法

#### `signXsPost(uri, a1Value, xsecAppid?, payload?, timestamp?)`

POST请求专用签名方法

#### `signXsCommon(cookieDict)` / `signXsc(cookieDict)`

生成 x-s-common 签名

- `cookieDict`: `Record<string, any> | string` - 完整的cookie字典或cookie字符串

#### `signHeaders(method, uri, cookies, xsecAppid?, params?, payload?, timestamp?)`

一次性生成完整的请求头

- 返回包含 `x-s`, `x-s-common`, `x-t`, `x-b3-traceid`, `x-xray-traceid` 的对象

#### `signHeadersGet(uri, cookies, xsecAppid?, params?, timestamp?)`

GET请求专用的完整请求头生成方法

#### `signHeadersPost(uri, cookies, xsecAppid?, payload?, timestamp?)`

POST请求专用的完整请求头生成方法

#### `decodeXs(xsSignature)`

解密完整的 XYS 签名

#### `decodeX3(x3Signature)`

解密 x3 签名

#### `buildUrl(baseUrl, params?)`

构建带查询参数的完整URL

#### `buildJsonBody(payload)`

构建POST请求的JSON body字符串

#### `getB3TraceId()`

生成 x-b3-traceid

#### `getXrayTraceId(timestamp?, seq?)`

生成 x-xray-traceid

#### `getXT(timestamp?)`

生成 x-t 头部值（毫秒时间戳）

## 类型定义

```typescript
type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null

class Xhshow {
  signXs(method: Method, uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number): string
  signXsGet(uri: string, a1Value: string, xsecAppid?: string, params?: Payload, timestamp?: number): string
  signXsPost(uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number): string
  signXsCommon(cookieDict: Record<string, any> | string): string
  signXsc(cookieDict: Record<string, any> | string): string
  signHeaders(method: Method, uri: string, cookies: Record<string, any> | string, xsecAppid?: string, params?: Payload, payload?: Payload, timestamp?: number): Record<string, string>
  signHeadersGet(uri: string, cookies: Record<string, any> | string, xsecAppid?: string, params?: Payload, timestamp?: number): Record<string, string>
  signHeadersPost(uri: string, cookies: Record<string, any> | string, xsecAppid?: string, payload?: Payload, timestamp?: number): Record<string, string>
  decodeXs(xsSignature: string): Record<string, any>
  decodeX3(x3Signature: string): Uint8Array
  buildUrl(baseUrl: string, params?: Record<string, any> | null): string
  buildJsonBody(payload: Record<string, any>): string
  getB3TraceId(): string
  getXrayTraceId(timestamp?: number, seq?: number): string
  getXT(timestamp?: number): number
}
```

## 开发环境

### 环境准备

```bash
# 克隆项目
git clone https://github.com/ikenxuan/xhshow-ts
cd xhshow-ts

# 安装依赖
npm install
```

### 开发流程

```bash
# 开发模式（监听文件变化）
npm run dev

# 构建项目
npm run build
```

### 项目结构

```
src/
├── client.ts          # 主要客户端类
├── core/              # 核心加密处理
│   ├── crypto.ts      # 加密处理器
│   ├── commonSign.ts  # x-s-common 签名
│   └── crc32.ts       # CRC32 实现
├── config/            # 配置文件
├── data/              # 指纹数据
├── generators/        # 指纹生成器
├── utils/             # 工具函数
├── validators.ts      # 参数验证
└── index.ts           # 入口文件
```

## License

[MIT](LICENSE)
