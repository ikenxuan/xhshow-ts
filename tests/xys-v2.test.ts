import assert from 'node:assert/strict'
import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, randomBytes } from 'node:crypto'
import test from 'node:test'

import {
  buildBrowserSearchBody,
  buildResourceDecryptBody,
  buildSskProof,
  createWebSskExchange,
  extractEncryptedSsk,
  isBlockedByBwsGateway,
  parseWebSsk,
  SessionManager,
  Xhshow
} from '../src/index'

const A1 = 'a'.repeat(52)
// 合成 SSK：48 字节 0x00..0x2f，覆盖「超出 32 字节的尾部拼进 x7」这条分支
const SSK = Buffer.from(Array.from({ length: 48 }, (_, i) => i)).toString('base64')
const md5 = (text: string) => createHash('md5').update(text, 'utf8').digest('hex')
const sha1 = (data: Buffer) => createHash('sha1').update(data).digest()

test('buildSskProof matches an independently computed vector', () => {
  // 期望值用 Python hashlib 按 x7 = nonce ‖ sha1(ssk ‖ nonce) ‖ ssk[32:]、
  // x6 = sha1(md5 ‖ x7) 独立算出
  const proof = buildSskProof('0123456789abcdef0123456789abcdef', { 'xhs-pc-web': SSK }, new Uint8Array([1, 2, 3, 4]))

  assert.deepEqual(proof, {
    x6: { 'xhs-pc-web': 'uSE+IMqd6IfdntT+kqUKmrUPlUU=' },
    x7: { 'xhs-pc-web': 'AQIDBOtFX6WD3D95chxCB0MP/uB59yIxICEiIyQlJicoKSorLC0uLw==' }
  })
})

test('buildSskProof skips short keys and returns null when nothing is usable', () => {
  const short = Buffer.alloc(31).toString('base64')

  assert.equal(buildSskProof(md5('x'), {}), null)
  assert.equal(buildSskProof(md5('x'), { 'xhs-pc-web': short }), null)
  assert.deepEqual(Object.keys(buildSskProof(md5('x'), { 'xhs-pc-web': SSK, other: short })!.x6), ['xhs-pc-web'])
  assert.throws(() => buildSskProof('not-md5', { 'xhs-pc-web': SSK }))
  assert.throws(() => buildSskProof(md5('x'), { 'xhs-pc-web': SSK }, new Uint8Array(3)))
})

test('parseWebSsk accepts the localStorage JSON string and tolerates garbage', () => {
  assert.deepEqual(parseWebSsk(JSON.stringify({ 'xhs-pc-web': SSK })), { 'xhs-pc-web': SSK })
  assert.deepEqual(parseWebSsk({ 'xhs-pc-web': SSK }), { 'xhs-pc-web': SSK })
  assert.deepEqual(parseWebSsk('not json'), {})
  assert.deepEqual(parseWebSsk('[1,2]'), {})
  assert.deepEqual(parseWebSsk(null), {})
})

test('signXs fills x4/x5 like seccore_signv2', () => {
  const client = new Xhshow()
  const params = { note_id: 'abc', cursor: '' }
  const body = { note_id: 'abc', num: 10 }

  const get = client.decodeXs(client.signXsGet('/api/sns/web/v2/comment/page', A1, 'xhs-pc-web', params))
  assert.equal(get.x4, '')
  assert.equal(get.x5, md5('/api/sns/web/v2/comment/page?note_id=abc&cursor='))

  const post = client.decodeXs(client.signXsPost('/api/sns/web/v1/feed', A1, 'xhs-pc-web', body))
  assert.equal(post.x4, 'object')
  assert.equal(post.x5, md5('/api/sns/web/v1/feed' + JSON.stringify(body)))

  // 没有 webSsk 时不出现 x6/x7，与前端一致
  assert.equal('x6' in post, false)
  assert.equal('x7' in post, false)
})

test('signXs adds x6/x7 bound to x5 when the session carries webSsk', () => {
  const client = new Xhshow()
  const session = new SessionManager(undefined, { webSsk: JSON.stringify({ 'xhs-pc-web': SSK }) })
  const xs = client.decodeXs(client.signXsPost('/api/sns/web/v1/feed', A1, 'xhs-pc-web', { a: 1 }, undefined, session))

  const encSsk = Buffer.from(xs.x7['xhs-pc-web'], 'base64')
  const nonce = encSsk.subarray(0, 4)
  const ssk = Buffer.from(SSK, 'base64')
  assert.deepEqual(encSsk.subarray(4, 24), sha1(Buffer.concat([ssk, nonce])))
  assert.deepEqual(encSsk.subarray(24), ssk.subarray(32))
  assert.equal(xs.x6['xhs-pc-web'], sha1(Buffer.concat([Buffer.from(xs.x5, 'hex'), encSsk])).toString('base64'))

  session.setWebSsk(null)
  const cleared = client.decodeXs(client.signXsPost('/api/sns/web/v1/feed', A1, 'xhs-pc-web', { a: 1 }, undefined, session))
  assert.equal('x6' in cleared, false)
})

// 与 xhshow 内部 customHashV2 相互独立的一份 dsf，照 Spider_XHS mns.js 写
function dsf (data: number[]): Buffer {
  const rotl = (x: number, r: number) => ((x << r) | (x >>> (32 - r))) | 0
  const rd = (o: number) => data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24)
  const len = data.length
  let h1 = 0x6d2b79f5 ^ len; let h2 = 0x1b873593 ^ (len << 8)
  let h3 = 0x85ebca6b ^ (len << 16); let h4 = 0xc2b2ae35 ^ (len << 24)
  for (let i = 0; i + 8 <= len; i += 8) {
    h1 = rotl(((h1 + rd(i)) | 0) ^ h3, 7)
    h2 = rotl(((h2 ^ rd(i)) + h4) | 0, 11)
    h3 = rotl(((h3 + rd(i + 4)) | 0) ^ h1, 13)
    h4 = rotl(((h4 ^ rd(i + 4)) + h2) | 0, 17)
  }
  h1 ^= len; h2 ^= h1; h3 = (h3 + h2) | 0; h4 ^= h3
  h1 = rotl(h1, 9); h2 = rotl(h2, 13); h3 = rotl(h3, 17); h4 = rotl(h4, 19)
  h1 = (h1 + h3) | 0; h2 ^= h4; h3 = (h3 + h1) | 0; h4 ^= h2
  const out = Buffer.alloc(16)
  ;[h1, h2, h3, h4].forEach((h, i) => out.writeInt32LE(h, i * 4))
  return out
}

test('x3 plaintext follows the browser mns0301 layout', () => {
  // 字段口径与 2026-09-26 页面自己签出的 20 条 x3 解密结果一致
  const client = new Xhshow()
  const body = { note_id: 'abc', num: 10 }
  const content = '/api/sns/web/v1/feed' + JSON.stringify(body)
  const x3 = client.decodeXs(client.signXsPost('/api/sns/web/v1/feed', A1, 'xhs-pc-web', body)).x3 as string
  assert.ok(x3.startsWith('mns0301_'))

  const p = Buffer.from(client.decodeX3(x3))
  const key = p[4]
  const xorKey = (buf: Buffer) => Buffer.from(buf.map(b => b ^ key))
  assert.deepEqual([...p.subarray(0, 4)], [121, 104, 96, 41])
  assert.equal(p.readUInt32LE(32), Buffer.byteLength(content))
  assert.deepEqual(xorKey(p.subarray(36, 44)), createHash('md5').update(content).digest().subarray(0, 8))

  const env = p.subarray(108, 124)
  assert.equal(env[0], 1)
  assert.equal(env[1], key ^ 115)
  assert.equal(env.subarray(2).toString('hex'), 'f9416767c9b581635e0744fa8415')

  // a3：dsf(le64(ts) ‖ md5(uri)) 逐字节异或版本低字节
  assert.deepEqual([...p.subarray(124, 128)], [2, 97, 51, 16])
  const dsfIn = [...p.subarray(8, 16), ...createHash('md5').update('/api/sns/web/v1/feed').digest()]
  assert.deepEqual(xorKey(p.subarray(128, 144)), dsf(dsfIn))
})

test('createWebSskExchange decrypts what a simulated server issues', () => {
  const server = generateKeyPairSync('x25519')
  const serverRaw = Buffer.from(server.publicKey.export({ format: 'jwk' }).x as string, 'base64url')
  const exchange = createWebSskExchange(serverRaw.toString('base64'))

  // 服务端：X25519(服务端私钥, 客户端公钥) 直接当 AES-256-GCM 密钥，下发 nonce ‖ 密文 ‖ tag
  const clientKey = createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(exchange.clientPublicKeyBase64, 'base64').toString('base64url') },
    format: 'jwk'
  })
  const shared = diffieHellman({ privateKey: server.privateKey, publicKey: clientKey })
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', shared, iv)
  const ssk = randomBytes(48)
  const encrypted = Buffer.concat([iv, cipher.update(ssk), cipher.final(), cipher.getAuthTag()]).toString('base64')

  const response = { code: 0, data: { login_info: { ssk: encrypted } } }
  assert.equal(extractEncryptedSsk(response), encrypted)
  assert.equal(exchange.acceptEncryptedSsk(extractEncryptedSsk(response)!), ssk.toString('base64'))

  const tampered = Buffer.from(encrypted, 'base64')
  tampered[20] ^= 1
  assert.throws(() => exchange.acceptEncryptedSsk(tampered.toString('base64')))
})

test('extractEncryptedSsk follows the front-end lookup order', () => {
  assert.equal(extractEncryptedSsk({ ssk: 'a', data: { ssk: 'b' } }), 'a')
  assert.equal(extractEncryptedSsk({ data: { loginInfo: { ssk: 'c' } } }), 'c')
  assert.equal(extractEncryptedSsk({ data: { ext: { ssk: 'd' } } }), 'd')
  assert.equal(extractEncryptedSsk({ data: { ssk: '' } }), undefined)
  assert.equal(extractEncryptedSsk(null), undefined)
})

test('bws request bodies carry the fields the gateway silently requires', () => {
  const body = buildBrowserSearchBody({ keyword: '猫', page: 2, pageSize: 10, searchId: 'sid' })
  assert.equal(body.xhsBrowserChannel, 'default')
  assert.equal(body.pagePos, 10)
  assert.equal(body.requestId, 'sid')
  assert.equal(buildBrowserSearchBody({ keyword: '猫', channel: 'x' }).xhsBrowserChannel, 'x')

  assert.deepEqual(buildResourceDecryptBody('enc'), { resourceId: 'enc', resourceType: 1 })

  assert.equal(isBlockedByBwsGateway(''), true)
  assert.equal(isBlockedByBwsGateway('Mozilla/5.0 Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'), false)
})
