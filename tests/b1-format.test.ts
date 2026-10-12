import assert from 'node:assert/strict'
import test from 'node:test'

import { CryptoConfig, FingerprintGenerator } from '../src/index'

// 按浏览器的逆过程解 b1：customBase64 → UTF-8 → latin1 密文 → RC4 → JSON
const config = new CryptoConfig()
function decodeB1 (b1: string): Record<string, unknown> {
  const std = [...b1]
    .map((c) => {
      const i = config.CUSTOM_BASE64_ALPHABET.indexOf(c)
      return i < 0 ? c : config.STANDARD_BASE64_ALPHABET[i]
    })
    .join('')
  const cipher = Buffer.from(Buffer.from(std, 'base64').toString('utf8'), 'latin1')
  const key = Buffer.from(config.B1_SECRET_KEY)
  const S = [...Array(256).keys()]
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255
    ;[S[i], S[j]] = [S[j], S[i]]
  }
  const out = Buffer.alloc(cipher.length)
  for (let k = 0, i = 0, j = 0; k < cipher.length; k++) {
    i = (i + 1) & 255
    j = (j + S[i]) & 255
    ;[S[i], S[j]] = [S[j], S[i]]
    out[k] = cipher[k] ^ S[(S[i] + S[j]) & 255]
  }
  return JSON.parse(out.toString('utf8'))
}

const generator = new FingerprintGenerator()
const fp = generator.generate({ a1: 'a'.repeat(52) }, config.PUBLIC_USERAGENT)
const b1 = generator.generateB1(fp)

test('b1 解出来是 19 键 JSON，键序与 2026-10 浏览器一致', () => {
  const obj = decodeB1(b1)
  assert.deepEqual(Object.keys(obj), [
    'x33', 'x34', 'x35', 'x36', 'x37', 'x38', 'x39', 'x42', 'x43', 'x44',
    'x45', 'x46', 'x48', 'x49', 'x50', 'x51', 'x52', 'x82', 'x84'
  ])
  // 浏览器里每个值都是字符串，x39 也不例外
  for (const [k, v] of Object.entries(obj)) assert.equal(typeof v, 'string', k)
  assert.equal(obj.x42, '3.5.6')
  assert.equal(obj.x39, '0')
})

test('b1 编码的是密文字节本身，不是数字数组文本', () => {
  // 旧实现 customBase64(JSON.stringify(bytes))：解出来以 `[` 开头、只有数字和逗号
  const std = [...b1].map((c) => config.STANDARD_BASE64_ALPHABET[config.CUSTOM_BASE64_ALPHABET.indexOf(c)] ?? c).join('')
  const text = Buffer.from(std, 'base64').toString('utf8')
  assert.doesNotMatch(text, /^\[\d/)
  // 用满整套字母表是密文高熵的直接表现（旧格式只有 33 种字符）
  assert.ok(new Set(b1).size > 60, `distinct=${new Set(b1).size}`)
})

test('x82 / x84 / x44 的形状与浏览器稳态一致', () => {
  const obj = decodeB1(b1)
  const x82 = String(obj.x82)
  assert.ok(x82.startsWith('1|_BHjFmfUMEtxhI|'))
  assert.equal(x82.length, 300)
  assert.match(
    String(obj.x84),
    /^\{mt:\{to:\d{13}(\.\d)?\},m:\{\},k:\{\},p:\{ulr:0,f:1,ps:1\},st:\{h:0,f:1,kr:0\},ft:\{ae:null,ak:null,cdr:null,bf:null,fi:null\}\}$/
  )
  const x44 = Number(obj.x44)
  const timeOrigin = Number(/to:([\d.]+)/.exec(String(obj.x84))?.[1])
  assert.ok(x44 <= Date.now() && Date.now() - x44 < 5000)
  assert.ok(timeOrigin < x44 && x44 - timeOrigin < 15000)
})
