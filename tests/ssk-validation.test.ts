import assert from 'node:assert/strict'
import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync } from 'node:crypto'
import test from 'node:test'

import { buildSskProof, createWebSskExchange, parseWebSsk, SessionManager, type WebSsk } from '../src/index'

const md5 = '0123456789abcdef0123456789abcdef'
const ssk = Buffer.alloc(32, 0xFF)
const key = ssk.toString('base64')
const nonce = new Uint8Array([1, 2, 3, 4])
const malformed = [key.slice(0, -1), `${key}\n`, `${key}!!!!`, key.replaceAll('/', '_'), `${key}=`, `=${key}`]

test('SSK 恰好 32 字节时 x7 只有 nonce 与摘要', () => {
  const proof = buildSskProof(md5, Object.freeze({ app: key }), nonce)!
  const packet = Buffer.from(proof.x7.app, 'base64')
  assert.equal(packet.length, 24)
  assert.deepEqual(packet.subarray(0, 4), Buffer.from(nonce))
  assert.deepEqual(packet.subarray(4), createHash('sha1').update(Buffer.concat([ssk, nonce])).digest())
  assert.equal(proof.x6.app, createHash('sha1').update(Buffer.concat([Buffer.from(md5, 'hex'), packet])).digest('base64'))
  assert.deepEqual(nonce, new Uint8Array([1, 2, 3, 4]))
})

test('x5 接受大小写 32hex，不接受 64hex', () => {
  assert.deepEqual(buildSskProof(md5.toUpperCase(), { app: key }, nonce), buildSskProof(md5, { app: key }, nonce))
  assert.throws(() => buildSskProof(md5.repeat(2), { app: key }), /16-byte MD5/)
})

test('畸形 Base64 项被跳过，其他 appId 不受影响', () => {
  for (const value of [...malformed, '', 123, null, false]) {
    assert.equal(buildSskProof(md5, { invalid: value } as WebSsk), null)
    const proof = buildSskProof(md5, { invalid: value, valid: key } as WebSsk, nonce)!
    assert.deepEqual(Object.keys(proof.x6), ['valid'])
    assert.deepEqual(Object.keys(proof.x7), ['valid'])
  }
})

test('多 appId 独立使用各自密钥，原型键不被吞掉', () => {
  const keys = Object.fromEntries([
    ['__proto__', key],
    ['constructor', Buffer.alloc(48, 3).toString('base64')],
    ['app', Buffer.alloc(32, 7).toString('base64')],
    ['', key]
  ])
  const proof = buildSskProof(md5, keys, nonce)!
  assert.equal(Object.getPrototypeOf(proof.x6), null)
  assert.equal(Object.getPrototypeOf(proof.x7), null)
  assert.deepEqual(Object.keys(proof.x6), ['__proto__', 'constructor', 'app'])
  assert.deepEqual(Object.keys(proof.x7), Object.keys(proof.x6))
  for (const app of Object.keys(proof.x6)) {
    const single = buildSskProof(md5, { [app]: keys[app] }, nonce)!
    assert.equal(proof.x6[app], single.x6[app])
    assert.equal(proof.x7[app], single.x7[app])
  }
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(proof.x7)), '__proto__'), true)
})

test('SSK 对象与 JSON 的结构检查一致，SessionManager 不引用输入映射', () => {
  for (const value of [[], [key], 1, true, null, undefined]) {
    assert.deepEqual(parseWebSsk(value as unknown as WebSsk), {})
  }
  const input = { app: key }
  const session = new SessionManager(undefined, { webSsk: input })
  input.app = 'changed'
  assert.equal(session.webSsk.app, key)
  const next = { app: key }
  session.setWebSsk(next)
  next.app = 'changed-again'
  assert.equal(session.webSsk.app, key)
})

test('交换拒绝畸形公钥和密文，错误不回显输入', () => {
  for (const value of malformed) {
    assert.throws(() => createWebSskExchange(value), { message: 'Invalid Base64 value' })
  }
  assert.throws(() => createWebSskExchange(Buffer.alloc(31).toString('base64')), /32 bytes/)
  const exchange = createWebSskExchange(key)
  for (const value of malformed) {
    assert.throws(() => exchange.acceptEncryptedSsk(value), { message: 'Invalid Base64 value' })
  }
  assert.throws(() => exchange.acceptEncryptedSsk(Buffer.alloc(27).toString('base64')), /too short/)
})

test('密文只可由对应临时私钥解开，短 SSK 与篡改包均被拒绝', () => {
  const server = generateKeyPairSync('x25519')
  const publicKey = Buffer.from(server.publicKey.export({ format: 'jwk' }).x!, 'base64url').toString('base64')
  const first = createWebSskExchange(publicKey)
  const second = createWebSskExchange(publicKey)
  const issue = (plaintext: Buffer): string => {
    const clientKey = createPublicKey({
      key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(first.clientPublicKeyBase64, 'base64').toString('base64url') },
      format: 'jwk'
    })
    const shared = diffieHellman({ privateKey: server.privateKey, publicKey: clientKey })
    const iv = Buffer.alloc(12, 4)
    const cipher = createCipheriv('aes-256-gcm', shared, iv)
    return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64')
  }
  const encrypted = issue(ssk)
  assert.equal(first.acceptEncryptedSsk(encrypted), key)
  assert.throws(() => second.acceptEncryptedSsk(encrypted))
  assert.throws(() => first.acceptEncryptedSsk(issue(Buffer.alloc(31))), /at least 32 bytes/)
  for (const offset of [0, 12, Buffer.from(encrypted, 'base64').length - 1]) {
    const tampered = Buffer.from(encrypted, 'base64')
    tampered[offset] ^= 1
    assert.throws(() => first.acceptEncryptedSsk(tampered.toString('base64')))
  }
})

test('全零 X25519 共享密钥不能用于解密', () => {
  const exchange = createWebSskExchange(Buffer.alloc(32).toString('base64'))
  assert.throws(() => exchange.acceptEncryptedSsk(Buffer.alloc(60).toString('base64')))
})
