import assert from 'node:assert/strict'
import test from 'node:test'

import { a1PlatformDigit, Base64Encoder, CryptoConfig, expandXrapKey, Xhshow, xRapParam } from '../src/index'

const cookies = { a1: 'a'.repeat(52), web_session: 'test-session' }
const encoder = new Base64Encoder()

function decodeXsCommon (client: Xhshow): Record<string, unknown> {
  return JSON.parse(encoder.decode(client.signXsCommon(cookies)))
}

test('x-s-common encodes the captured web client versions', () => {
  const common = decodeXsCommon(new Xhshow())

  assert.equal(common.x1, '4.4.3')
  assert.equal(common.x4, '6.56.3')
  assert.equal(common.x5, cookies.a1)
})

test('x-s-common defaults describe Windows: s0 falls through to other(5)', () => {
  // 前端 getPlatformCode 没有 Windows 分支，Windows 落 default → other(5)。
  // 真机 Edge 153 抓下来的 x-s-common 就是 s0=5 / x2="Windows"。
  const common = decodeXsCommon(new Xhshow())

  assert.equal(common.s0, 5)
  assert.equal(common.x2, 'Windows')
})

test('forUserAgent derives s0 and x2 per platform', () => {
  const cases: Array<[string, number, string]> = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36', 5, 'Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36', 3, 'Mac OS'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36', 4, 'Linux'],
    // iPhone 的 UA 里带 "Mac OS X"，必须先判 iOS，否则会被认成 Mac
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 1, 'iOS'],
    // Android 的 UA 里带 "Linux"，必须先判 Android
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36', 2, 'Android'],
    ['some-unknown-client/1.0', 5, 'PC']
  ]

  for (const [userAgent, s0, x2] of cases) {
    const common = decodeXsCommon(new Xhshow(new CryptoConfig().forUserAgent(userAgent)))
    assert.equal(common.s0, s0, `s0 for ${x2}`)
    assert.equal(common.x2, x2, `x2 for ${x2}`)
  }
})

test('forUserAgent keeps x12 a live getter and preserves prior overrides', () => {
  const config = new CryptoConfig()
    .withOverrides({ DATA_WEB_BUILD: '6.12.3' })
    .forUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36')

  assert.equal(config.DATA_WEB_BUILD, '6.12.3')
  assert.equal(config.DATA_PLATFORM, 'Linux')
  // b1 指纹把 UA 写进 fingerprint.x1，必须与 s0/x2 指向同一个平台
  assert.match(config.PUBLIC_USERAGENT, /Linux x86_64/)

  // x12 必须仍是 getter：对象展开会把它冻成常量，请求时间就不再刷新了
  const descriptor = Object.getOwnPropertyDescriptor(config.SIGNATURE_XSCOMMON_TEMPLATE, 'x12')
  assert.equal(typeof descriptor?.get, 'function')

  const client = new Xhshow(config)
  const first = String(decodeXsCommon(client).x12).split(';')[0]
  const later = String(decodeXsCommon(client).x12).split(';')[0]
  assert.ok(Number(later) >= Number(first))
})

test('x-s-common prefers the caller webBuild cookie for x4', () => {
  // x4 与 webBuild Cookie 同源；跟着调用方的 Cookie 走，避免库里的常量过期
  const common = JSON.parse(encoder.decode(new Xhshow().signXsCommon({ ...cookies, webBuild: '6.57.0' })))

  assert.equal(common.x4, '6.57.0')
  assert.equal(decodeXsCommon(new Xhshow()).x4, '6.56.3')
})

test('a1 platform digit uses the same mapping as s0', () => {
  // 真机 a1 尾部实测 "50000" —— Windows 的平台位是 5(other)，不是枚举里的 0
  assert.equal(a1PlatformDigit('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0'), '5')
  assert.equal(a1PlatformDigit('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/153.0.0.0'), '3')
  assert.equal(a1PlatformDigit('Mozilla/5.0 (X11; Linux x86_64) Chrome/153.0.0.0'), '4')
  assert.equal(a1PlatformDigit(undefined), '5')
})

test('XYW env flags do not vary by platform — bit 11 tracks webdriver, not the OS', () => {
  // 2026-09-25 同机对照：Windows 真机 Edge(webdriver=false) 第 11 位为 0，
  // 同一台机器上自动化 Chrome(webdriver=true) 为 1。所以这一串不按 OS 查表。
  const windows = new CryptoConfig().forUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0.0.0')
  const linux = new CryptoConfig().forUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/153.0.0.0')

  assert.equal(windows.XYW_ENV_FLAGS_DEFAULT, linux.XYW_ENV_FLAGS_DEFAULT)
  assert.equal(windows.XYW_ENV_FLAGS_DEFAULT.split('|')[11], '0')
  assert.equal(windows.XYW_ENV_FLAGS_DEFAULT, '0|0|0|1|0|0|1|0|0|0|1|0|0|0|0|1|0|0|0')
})

test('x-s-common refreshes request time while keeping the module session timestamp', (t) => {
  let now = Date.now() + 1000
  t.mock.method(Date, 'now', () => now)
  const client = new Xhshow()
  const first = decodeXsCommon(client)

  assert.equal(typeof first.x12, 'string')
  const [requestTime, sessionStart] = String(first.x12).split(';').map(Number)
  assert.equal(requestTime, now)
  assert.ok(Number.isSafeInteger(sessionStart) && sessionStart > 0 && sessionStart <= now)

  now += 100
  assert.equal(decodeXsCommon(client).x12, `${now};${sessionStart}`)
  assert.equal(decodeXsCommon(new Xhshow()).x12, `${now};${sessionStart}`)
})

test('x-rap-param encodes SDK version 10301 in the envelope header', () => {
  const value = xRapParam('/api/sns/web/v1/feed', { source_note_id: 'test-note' })

  assert.equal(Buffer.from(value, 'base64').readUInt32BE(20), 10301)
})

test('x-rap-param preserves an explicit SDK version override', () => {
  const value = xRapParam('/api/sns/web/v1/feed', {}, { sdkVersion: 10300 })

  assert.equal(Buffer.from(value, 'base64').readUInt32BE(20), 10300)
})

test('the x-rap master key reproduces the round keys that used to be hardcoded', () => {
  // 这一层不是 SM4 变体，是换了 S 盒的 AES-128：主密钥 kqI1DTcwKX90ZtAy 经标准
  // AES 密钥展开可逐字复现原先抄在源码里的 11 组轮密钥（含末轮）。
  // 这组常量就是当初硬编码的那份，留作「改推导后仍字节等价」的判据。
  const HARDCODED = [
    [0x6B714931, 0x44546377, 0x4B583930, 0x5A744179],
    [0x89314C98, 0xCD652FEF, 0x863D16DF, 0xDC4957A6],
    [0xC205330C, 0x0F601CE3, 0x895D0A3C, 0x55145D9A],
    [0xD205006E, 0xDD651C8D, 0x543816B1, 0x012C4B2B],
    [0x770C2B6F, 0xAA6937E2, 0xFE512153, 0xFF7D6A78],
    [0x7866FBF4, 0xD20FCC16, 0x2C5EED45, 0xD323873D],
    [0x90E9C67E, 0x42E60A68, 0x6EB8E72D, 0xBD9B6010],
    [0xE9C52BEE, 0xAB232186, 0xC59BC6AB, 0x7800A6BB],
    [0x13BA9A3E, 0xB899BBB8, 0x7D027D13, 0x0502DBA8],
    [0x50613270, 0xE8F889C8, 0x95FAF4DB, 0x90F82F73],
    [0xF396B44F, 0x1B6E3D87, 0x8E94C95C, 0x1E6CE62F]
  ]

  const expanded = expandXrapKey(Buffer.from(new CryptoConfig().XRAP_MASTER_KEY, 'ascii'))

  assert.equal(expanded.length, 11)
  assert.deepEqual(expanded, HARDCODED)
  // 第 0 轮就是主密钥的 ASCII 字节本身，这是 AES 密钥展开的定义
  assert.equal(Buffer.from(Uint32Array.from(expanded[0]).buffer).length, 16)
})

test('expandXrapKey rejects a key that is not 16 bytes', () => {
  assert.throws(() => expandXrapKey(Buffer.from('too-short', 'ascii')), /16 bytes/)
})

test('x-s-common preserves an explicit template override', () => {
  const defaults = new CryptoConfig()
  const config = defaults.withOverrides({
    SIGNATURE_XSCOMMON_TEMPLATE: {
      ...defaults.SIGNATURE_XSCOMMON_TEMPLATE,
      x1: 'custom-version',
      x4: 'custom-build',
      x12: '100;50'
    }
  })
  const common = decodeXsCommon(new Xhshow(config))

  assert.equal(common.x1, 'custom-version')
  assert.equal(common.x4, 'custom-build')
  assert.equal(common.x12, '100;50')
})
