/**
 * XYS 签名的会话 SSK：x6/x7 证明，以及拿到 SSK 的 X25519 交换。
 *
 * 逆自前端 `vendor-dynamic.js` 的 `buildEncSskSign` / `createWebSskExchange`。
 * 2026-09-25 用页面自己签出的 21 条 XYS_（GET 16 / POST 5）逐字节核对，x6/x7 全部一致。
 */

import {
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes
} from 'node:crypto'

/**
 * 前端 localStorage `webSsk` 的内容：appId → SSK（标准 base64）。
 *
 * 页面里通常只有一项 `{ 'xhs-pc-web': '...' }`。
 */
export type WebSsk = Record<string, string>

/** 一次签名里的 x6 / x7，键与 {@link WebSsk} 相同。 */
export interface SskProof {
  /** x6：`sha1(md5(内容) ‖ x7)`，20 字节 */
  x6: Record<string, string>
  /** x7：`nonce(4) ‖ sha1(ssk ‖ nonce)(20) ‖ ssk[32:]` */
  x7: Record<string, string>
}

/** SSK 至少 32 字节；超出部分原样拼进 x7 尾部。 */
const SSK_MIN_LENGTH = 32
const NONCE_LENGTH = 4
/** AES-GCM 的 nonce 与 tag 长度，服务端下发的密文按 nonce ‖ 密文 ‖ tag 排列。 */
const GCM_NONCE_LENGTH = 12
const GCM_TAG_LENGTH = 16

const sha1 = (data: Buffer): Buffer => createHash('sha1').update(data).digest()

/**
 * 把 webSsk 统一成 appId → base64 映射。
 *
 * 可以直接传 `localStorage.getItem('webSsk')` 取出来的 JSON 字符串，也可以传对象。
 * 解析失败或结构不对时返回空映射，与前端 `getStoredSskMap` 的容错一致。
 * @param value - JSON 字符串或映射对象
 * @returns appId → SSK（base64）
 */
export function parseWebSsk (value: string | WebSsk | null | undefined): WebSsk {
  if (!value) return {}
  if (typeof value !== 'string') return { ...value }
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as WebSsk) } : {}
  } catch {
    return {}
  }
}

/**
 * 生成 x7 开头的 4 字节 nonce：`uint32LE((Date.now() >>> 0) + 随机 u32)`，与前端 `createEncSskNonce` 一致。
 */
function createNonce (): Buffer {
  const nonce = Buffer.alloc(NONCE_LENGTH)
  nonce.writeUInt32LE(((Date.now() >>> 0) + randomBytes(NONCE_LENGTH).readUInt32LE(0)) >>> 0)
  return nonce
}

/**
 * 计算 XYS 的 x6 / x7（会话 SSK 证明）。
 *
 * 对 webSsk 里的每个 appId 各算一份；SSK 解不开或不足 32 字节的项跳过。
 * 一项都没有时返回 `null`，此时 x-s 里不应出现 x6/x7（与前端一致）。
 * @param contentMd5 - x5，即签名内容串的 MD5（32 位 hex）
 * @param webSsk - appId → SSK 映射
 * @param nonce - 固定 4 字节 nonce，仅用于测试与复现；省略时每个 appId 各自随机
 * @returns x6 / x7，或 `null`
 */
export function buildSskProof (contentMd5: string, webSsk: WebSsk, nonce?: Uint8Array): SskProof | null {
  if (!/^[0-9a-f]{32}$/i.test(contentMd5)) {
    throw new Error('contentMd5 must be a 16-byte MD5 hex string')
  }
  const digest = Buffer.from(contentMd5, 'hex')
  if (nonce !== undefined && nonce.length !== NONCE_LENGTH) {
    throw new Error(`nonce must be ${NONCE_LENGTH} bytes`)
  }

  const x6: Record<string, string> = {}
  const x7: Record<string, string> = {}
  for (const [appId, value] of Object.entries(webSsk)) {
    const ssk = typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.alloc(0)
    if (!appId || ssk.length < SSK_MIN_LENGTH) continue

    const v = nonce ? Buffer.from(nonce) : createNonce()
    const encSsk = Buffer.concat([v, sha1(Buffer.concat([ssk, v])), ssk.subarray(SSK_MIN_LENGTH)])
    x6[appId] = sha1(Buffer.concat([digest, encSsk])).toString('base64')
    x7[appId] = encSsk.toString('base64')
  }
  return Object.keys(x6).length > 0 ? { x6, x7 } : null
}

/**
 * 前端会带上客户端公钥的登录类接口（前端 `sskInterceptor` 的白名单）。
 *
 * POST 放进请求体 `clientPublicKeyBase64`，GET 放进同名 query 参数；
 * 响应里的密文按 {@link extractEncryptedSsk} 的顺序查找。
 */
export const SSK_ISSUE_APIS: readonly string[] = [
  '/api/sns/web/v1/login/activate',
  '/api/sns/web/v1/login/code',
  '/api/sns/web/v2/login/code',
  '/api/sns/web/v1/login/social',
  '/api/sns/web/v1/login/qrcode/status',
  '/api/sns/web/v2/login/security_code'
]

/** 响应里可能放 SSK 密文的位置，顺序与前端 `extractSsk` 一致。 */
const SSK_RESPONSE_PATHS: readonly (readonly string[])[] = [
  ['ssk'],
  ['login_info', 'ssk'],
  ['loginInfo', 'ssk'],
  ['data', 'ssk'],
  ['data', 'login_info', 'ssk'],
  ['data', 'loginInfo', 'ssk'],
  // webprofile 上报（请求体带 `ext: { cpk }`）走这里
  ['data', 'ext', 'ssk']
]

/**
 * 从登录类接口或 webprofile 的响应体里取出 SSK 密文。
 * @param response - 已解析的响应 JSON
 * @returns 密文（标准 base64），没有时为 `undefined`
 */
export function extractEncryptedSsk (response: unknown): string | undefined {
  for (const path of SSK_RESPONSE_PATHS) {
    let node: unknown = response
    for (const key of path) {
      node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined
    }
    if (typeof node === 'string' && node.length > 0) return node
  }
  return undefined
}

/** {@link createWebSskExchange} 的返回值。 */
export interface WebSskExchange {
  /** 客户端 X25519 公钥（标准 base64），登录类接口放 `clientPublicKeyBase64`，webprofile 放 `ext.cpk` */
  clientPublicKeyBase64: string
  /**
   * 解开服务端下发的 SSK 密文（可用 {@link extractEncryptedSsk} 从响应里取）。
   * @param encryptedSsk - 服务端下发的密文（标准 base64）
   * @returns SSK（标准 base64），存进 webSsk[appId] 即可
   */
  acceptEncryptedSsk: (encryptedSsk: string) => string
}

/**
 * 发起一次 webSsk 交换。
 *
 * 前端有两个入口：一是 {@link SSK_ISSUE_APIS} 里的登录类接口，请求里带上
 * `clientPublicKeyBase64`；二是 webprofile 上报在本地没有 SSK 时带上
 * `ext: { cpk }`。密文是 `nonce(12) ‖ 密文 ‖ tag(16)`，用 X25519 共享密钥
 * 直接当 AES-256-GCM 密钥解开。
 *
 * 2026-09-25 真机：游客与已登录会话调 `login/activate`、webprofile 带 `ext.cpk`
 * 都只回 code 0、不下发 SSK（浏览器自己的 webprofile 也一样），SSK 只在真正的
 * 登录动作（扫码 / 验证码）里下发。服务端目前也不强制 x6/x7，不带照常 200。
 *
 * ```ts
 * const exchange = createWebSskExchange(config.SSK_SERVER_PUBLIC_KEY)
 * const res = await post('/api/sns/web/v1/login/qrcode/status', { ...body, clientPublicKeyBase64: exchange.clientPublicKeyBase64 })
 * const encrypted = extractEncryptedSsk(res)
 * if (encrypted) session.setWebSsk({ 'xhs-pc-web': exchange.acceptEncryptedSsk(encrypted) })
 * ```
 * @param serverPublicKeyBase64 - 服务端 X25519 公钥（标准 base64，32 字节），见 `CryptoConfig.SSK_SERVER_PUBLIC_KEY`
 * @returns 客户端公钥与解密函数
 */
export function createWebSskExchange (serverPublicKeyBase64: string): WebSskExchange {
  const serverRaw = Buffer.from(serverPublicKeyBase64, 'base64')
  if (serverRaw.length !== 32) throw new Error('server public key must be 32 bytes')
  const serverKey = createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: serverRaw.toString('base64url') },
    format: 'jwk'
  })

  const { privateKey, publicKey } = generateKeyPairSync('x25519')
  const clientRaw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')

  return {
    clientPublicKeyBase64: clientRaw.toString('base64'),
    acceptEncryptedSsk (encryptedSsk: string): string {
      const data = Buffer.from(encryptedSsk, 'base64')
      if (data.length < GCM_NONCE_LENGTH + GCM_TAG_LENGTH) throw new Error('encrypted SSK is too short')

      const shared = diffieHellman({ privateKey, publicKey: serverKey })
      if (shared.every(byte => byte === 0)) throw new Error('X25519 shared key is all zero')

      const decipher = createDecipheriv('aes-256-gcm', shared, data.subarray(0, GCM_NONCE_LENGTH))
      decipher.setAuthTag(data.subarray(data.length - GCM_TAG_LENGTH))
      const ssk = Buffer.concat([
        decipher.update(data.subarray(GCM_NONCE_LENGTH, data.length - GCM_TAG_LENGTH)),
        decipher.final()
      ])
      if (ssk.length < SSK_MIN_LENGTH) throw new Error('decrypted SSK must be at least 32 bytes')
      return ssk.toString('base64')
    }
  }
}
