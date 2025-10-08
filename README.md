# xhshow-ts

<div align="center">

小红书请求签名生成库的 TypeScript 版本，支持 GET 和 POST 请求的 x-s 签名生成。

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

#### `signXs(method, uri, a1Value, xsecAppid?, payload?)`

通用签名方法

- `method`: `'GET' | 'POST'` - 请求方法
- `uri`: `string` - 请求URI（去除域名和查询参数）
- `a1Value`: `string` - cookie中的a1值
- `xsecAppid`: `string` - 应用标识符，默认为 `'xhs-pc-web'`
- `payload`: `Record<string, any> | null` - 请求参数

#### `signXsGet(uri, a1Value, xsecAppid?, params?)`

GET请求专用签名方法

- `uri`: `string` - 请求URI
- `a1Value`: `string` - cookie中的a1值  
- `xsecAppid`: `string` - 应用标识符，默认为 `'xhs-pc-web'`
- `params`: `Record<string, any> | null` - GET请求参数

#### `signXsPost(uri, a1Value, xsecAppid?, payload?)`

POST请求专用签名方法

- `uri`: `string` - 请求URI
- `a1Value`: `string` - cookie中的a1值
- `xsecAppid`: `string` - 应用标识符，默认为 `'xhs-pc-web'`
- `payload`: `Record<string, any> | null` - POST请求体数据

## 类型定义

```typescript
type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null

class Xhshow {
  signXs(method: Method, uri: string, a1Value: string, xsecAppid?: string, payload?: Payload): string
  signXsGet(uri: string, a1Value: string, xsecAppid?: string, params?: Payload): string
  signXsPost(uri: string, a1Value: string, xsecAppid?: string, payload?: Payload): string
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

# 运行测试（如果有）
npm test
```

### 项目结构

```
src/
├── client.ts          # 主要客户端类
├── core/              # 核心加密处理
├── config/            # 配置文件
├── utils/             # 工具函数
├── validators.ts      # 参数验证
└── index.ts          # 入口文件
```

## License

[MIT](LICENSE)