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
// headers 包含: x-s, x-s-common, x-t, x-b3-traceid, x-xray-traceid
```

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
| `signXs(method, uri, a1Value, xsecAppid?, payload?, timestamp?)` | 通用签名 |
| `signXsGet(uri, a1Value, xsecAppid?, params?, timestamp?)` | GET 请求签名 |
| `signXsPost(uri, a1Value, xsecAppid?, payload?, timestamp?)` | POST 请求签名 |
| `signXsc(cookieDict)` | 生成 x-s-common 签名 |

### 请求头生成

| 方法 | 说明 |
|------|------|
| `signHeaders(method, uri, cookies, ...)` | 生成完整请求头 |
| `signHeadersGet(uri, cookies, ...)` | GET 请求头 |
| `signHeadersPost(uri, cookies, ...)` | POST 请求头 |

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

## 类型定义

```typescript
type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null

interface Xhshow {
  signXs(method: Method, uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number): string
  signXsGet(uri: string, a1Value: string, xsecAppid?: string, params?: Payload, timestamp?: number): string
  signXsPost(uri: string, a1Value: string, xsecAppid?: string, payload?: Payload, timestamp?: number): string
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

## 开发

```bash
# 克隆项目
git clone https://github.com/ikenxuan/xhshow-ts
cd xhshow-ts

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

### 项目结构

```
src/
├── client.ts          # 主客户端类
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
