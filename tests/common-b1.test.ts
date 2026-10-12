import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

import { Base64Encoder, CRC32, FingerprintGenerator, SessionManager, Xhshow, XsCommonSigner } from '../src/index'
import type { XsCommonOptions } from '../src/index'

const cookies = Object.freeze({ a1: 'a'.repeat(52), webBuild: '6.57.0' })
const encoder = new Base64Encoder()
const decode = (value: string): Record<string, unknown> => JSON.parse(encoder.decode(value))

function forbidFingerprintGeneration (t: TestContext): void {
  const unexpected = (): never => { throw new Error('显式 b1 不应生成指纹') }
  t.mock.method(FingerprintGenerator.prototype, 'generate', unexpected)
  t.mock.method(FingerprintGenerator.prototype, 'generateB1', unexpected)
}

test('显式 b1 原样进入 x8，x9 使用前端 CRC32 变体', (t) => {
  forbidFingerprintGeneration(t)
  const signer = new XsCommonSigner()
  const options = Object.freeze({ b1: '123456789' })
  const common = decode(signer.sign(cookies, options))

  assert.equal(common.x5, cookies.a1)
  assert.equal(common.x4, cookies.webBuild)
  assert.equal(common.x8, options.b1)
  assert.equal(common.x9, 0x264CBA06) // 标准 CRC32 0xCBF43926 再异或 0xEDB88320。
  assert.deepEqual(options, { b1: '123456789' })
})

test('不裁剪或重编码调用方的 b1', (t) => {
  forbidFingerprintGeneration(t)
  const b1 = ' \t合成/+==\n'
  const common = decode(new Xhshow().signXsCommon(cookies, { b1 }))
  assert.equal(common.x8, b1)
  assert.equal(common.x9, CRC32.crc32JsInt(b1))
})

test('Cookie 字符串与 signXsc 别名均透传显式 b1', (t) => {
  forbidFingerprintGeneration(t)
  const client = new Xhshow()
  const cookie = `a1=${cookies.a1}; webBuild=${cookies.webBuild}`
  for (const sign of [client.signXsCommon.bind(client), client.signXsc.bind(client)]) {
    for (const input of [cookie, cookies]) {
      const common = decode(sign(input, { b1: 'synthetic-b1' }))
      assert.equal(common.x8, 'synthetic-b1')
      assert.equal(common.x5, cookies.a1)
      assert.equal(common.x4, cookies.webBuild)
    }
  }
})

test('每次调用的 b1 不写入 signer 或 client 全局状态', (t) => {
  forbidFingerprintGeneration(t)
  const signer = new XsCommonSigner()
  const client = new Xhshow()
  for (const sign of [signer.sign.bind(signer), client.signXsCommon.bind(client)]) {
    const first = decode(sign(cookies, { b1: 'first-b1' }))
    const secondCookies = { a1: 'b'.repeat(52) }
    const second = decode(sign(secondCookies, { b1: 'second-b1' }))
    const again = decode(sign(cookies, { b1: 'first-b1' }))
    assert.equal(first.x8, 'first-b1')
    assert.equal(second.x8, 'second-b1')
    assert.equal(second.x5, secondCookies.a1)
    assert.equal(again.x8, first.x8)
    assert.equal(again.x9, first.x9)
  }
})

test('signHeaders 及 GET/POST 包装共用会话 b1 与 SSK', (t) => {
  forbidFingerprintGeneration(t)
  const client = new Xhshow()
  const session = new SessionManager(undefined, {
    b1: 'session-b1',
    webSsk: { 'xhs-pc-web': Buffer.alloc(32, 7).toString('base64') }
  })
  const path = '/api/sns/web/v1/test'
  const headers = [
    client.signHeaders('GET', path, cookies, 'xhs-pc-web', {}, undefined, 1700000000, session),
    client.signHeadersGet(path, cookies, 'xhs-pc-web', {}, 1700000000, session),
    client.signHeadersPost(path, cookies, 'xhs-pc-web', {}, 1700000000, session)
  ]
  for (const header of headers) {
    assert.equal(decode(header['x-s-common']).x8, 'session-b1')
    const xs = client.decodeXs(header['x-s'])
    assert.deepEqual(Object.keys(xs.x6), ['xhs-pc-web'])
    assert.deepEqual(Object.keys(xs.x7), ['xhs-pc-web'])
  }
  const xyw = client.signHeadersGet(path, cookies, 'xhs-pc-web', {}, 1700000000, session, 'xyw')
  assert.equal(decode(xyw['x-s-common']).x8, 'session-b1')
})

test('两个会话的 b1 独立，更新一份不影响另一份', (t) => {
  forbidFingerprintGeneration(t)
  const client = new Xhshow()
  const first = new SessionManager(undefined, { b1: 'first-b1' })
  const second = new SessionManager(undefined, { b1: 'second-b1' })
  first.setB1('updated-b1')
  assert.equal(decode(client.signXsCommon(cookies, first)).x8, 'updated-b1')
  assert.equal(decode(client.signXsCommon(cookies, second)).x8, 'second-b1')
})

test('缺省调用及显式 undefined 保留原有生成行为，不缓存前次 b1', (t) => {
  const generated = t.mock.method(FingerprintGenerator.prototype, 'generateB1', () => 'generated-b1')
  const client = new Xhshow()
  client.signXsCommon(cookies, { b1: 'explicit-b1' })
  assert.equal(generated.mock.callCount(), 0)
  for (const options of [undefined, {}, { b1: undefined }]) {
    assert.equal(decode(client.signXsCommon(cookies, options)).x8, 'generated-b1')
  }
  const session = new SessionManager(undefined, { b1: 'session-b1' })
  session.setB1(undefined)
  assert.equal(decode(client.signXsCommon(cookies, session)).x8, 'generated-b1')
  assert.equal(generated.mock.callCount(), 4)
})

test('非法 b1 明确报错，不生成替代指纹，不把输入写入错误', (t) => {
  forbidFingerprintGeneration(t)
  const client = new Xhshow()
  for (const b1 of ['', ' \t\n', null, false, 12, { privateValue: 'secret-fixture' }, []]) {
    const options = { b1 } as XsCommonOptions
    for (const sign of [
      () => new XsCommonSigner().sign(cookies, options),
      () => client.signXsCommon(cookies, options),
      () => client.signXsc(cookies, options),
      () => new SessionManager(undefined, options)
    ]) {
      assert.throws(sign, { name: 'TypeError', message: 'b1 必须是非空字符串' })
    }
  }
  const session = new SessionManager(undefined, { b1: 'valid-b1' })
  assert.throws(() => session.setB1(''), TypeError)
  assert.equal(session.b1, 'valid-b1')
  session.b1 = ''
  assert.throws(() => client.signHeadersGet('/api/test', cookies, undefined, undefined, undefined, session), TypeError)
})

test('提供 b1 仍要求 Cookie 含 a1', (t) => {
  forbidFingerprintGeneration(t)
  assert.throws(() => new XsCommonSigner().sign({}, { b1: 'synthetic-b1' }), /Missing 'a1'/)
  assert.throws(() => new Xhshow().signXsCommon('', { b1: 'synthetic-b1' }), /Missing 'a1'/)
})
