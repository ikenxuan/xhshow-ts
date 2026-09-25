/**
 * x-rap-param generation.
 *
 * Ported from the upstream Python `core/xrap.py`. Required for feed, search,
 * and note-publishing endpoints. Builds a TLV body structure, gzip-compresses
 * it, then XOR + block-encrypts and wraps it in a base64 envelope.
 *
 * 分组密码这一层此前被当成「换了 S 盒和轮密钥的 SM4 变体」，实际是**换了 S 盒的
 * AES-128** —— 轮函数、T 表构造、ShiftRows、末轮置换都与 AES 一致，只换了那张
 * 256 项代换表。据此 11 组轮密钥不必再抄成魔数：用 ASCII 主密钥
 * `kqI1DTcwKX90ZtAy` 配合同一张 S 盒做标准 AES 密钥展开，可逐字复现
 * SDK 里硬编码的全部 11 组（含末轮），见 {@link expandXrapKey}。
 * 这样平台换密钥时只需替换 16 字节，而不是重新逆一遍常量池。
 */

import { gzipSync } from 'node:zlib'
import { CryptoConfig } from '../config'
import { xxh32 } from '../utils/hash'
import { RandomGenerator } from '../utils/randomGen'

const cfg = new CryptoConfig()
const MASK_32 = cfg.MAX_32BIT
const XRAP_SDK_VERSION = cfg.XRAP_SDK_VERSION

// Non-linear substitution box (256 entries)
const SBOX = [
  0x7A, 0x01, 0x58, 0xE0, 0x50, 0x4E, 0x02, 0x79, 0x1D, 0x4B, 0x53, 0xDA, 0x6B, 0x48, 0xD4, 0x52,
  0xED, 0x77, 0x12, 0x21, 0x14, 0x15, 0xEC, 0x10, 0x18, 0xE5, 0xB9, 0xF1, 0x0C, 0x08, 0xFC, 0x7D,
  0xF9, 0xCD, 0xB5, 0xC8, 0xE6, 0x37, 0x26, 0x87, 0x56, 0xBA, 0xB8, 0x2B, 0xAD, 0xF0, 0x68, 0xF7,
  0x8B, 0x8D, 0xD3, 0x5E, 0x36, 0x4D, 0x2E, 0x92, 0x31, 0x82, 0xF2, 0x29, 0x70, 0x3D, 0x2D, 0xD7,
  0xB6, 0x40, 0xB2, 0x43, 0x44, 0x80, 0x78, 0xD2, 0x0D, 0x49, 0x4A, 0x09, 0x63, 0x6C, 0x07, 0x3A,
  0x9E, 0xD5, 0x06, 0xC6, 0xE1, 0x62, 0xF4, 0x34, 0x24, 0x59, 0xA9, 0x57, 0x2A, 0x00, 0x3E, 0x17,
  0x2C, 0x0A, 0x1A, 0x42, 0xFA, 0x93, 0xBE, 0xDC, 0xF5, 0xB3, 0x6A, 0x13, 0xE8, 0x03, 0xC7, 0x97,
  0xBB, 0x73, 0x76, 0x86, 0xE3, 0x46, 0x72, 0x47, 0xD0, 0x05, 0x4C, 0x38, 0x7C, 0x1F, 0x81, 0xAB,
  0x75, 0x51, 0xEB, 0xF3, 0x32, 0x74, 0x11, 0x8F, 0x84, 0x89, 0x9C, 0x71, 0x22, 0x7E, 0x9D, 0xCF,
  0x3F, 0x91, 0x69, 0x65, 0x3C, 0x6D, 0x96, 0xA2, 0x98, 0x99, 0x33, 0x39, 0x9A, 0xCA, 0xC3, 0x9F,
  0xA0, 0xBC, 0xE4, 0xA3, 0xA4, 0x54, 0x7F, 0xA7, 0xA8, 0x04, 0x6F, 0x5D, 0xAC, 0xB7, 0x27, 0xAF,
  0xB0, 0x28, 0x41, 0xAE, 0xB4, 0x6E, 0x0B, 0x1B, 0xDF, 0x8E, 0x30, 0xB1, 0xFE, 0x90, 0x61, 0x60,
  0xC0, 0xCB, 0x5C, 0x0E, 0xEF, 0x16, 0x83, 0xEA, 0x20, 0xE9, 0xC9, 0x55, 0xC4, 0x45, 0x85, 0xCC,
  0x1E, 0xAA, 0x67, 0x8A, 0x7B, 0x35, 0xD6, 0x19, 0xD8, 0xD9, 0xC2, 0xDB, 0x94, 0xDD, 0x1C, 0xDE,
  0xA6, 0xFF, 0xF8, 0xBF, 0x5B, 0x5A, 0x0F, 0xE7, 0xC1, 0xBD, 0xD1, 0x66, 0xC5, 0x25, 0xEE, 0x8C,
  0xE2, 0x5F, 0x88, 0xA1, 0x3B, 0xA5, 0xF6, 0xCE, 0x95, 0x2F, 0x64, 0x23, 0xFB, 0xFD, 0x4F, 0x9B
]

// --- 轮密钥：由主密钥经标准 AES-128 密钥展开推出，不再硬编码 ---

/** AES 密钥展开的轮常量，前 10 轮。 */
const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36]

/**
 * 用自定义 S 盒做标准 AES-128 密钥展开。
 *
 * 与教科书 AES 的唯一差别是 `SubWord` 查的是上面那张 {@link SBOX}。
 * 对主密钥 `kqI1DTcwKX90ZtAy` 展开的结果与 SDK 里硬编码的 11 组轮密钥逐字相同 ——
 * 第 0 轮本身就是主密钥的 ASCII 字节（`6b714931 44546377 4b583930 5a744179`）。
 * @param masterKey - 16 字节主密钥
 * @returns 11 组轮密钥，每组 4 个 32 位字；末组即末轮密钥
 */
export function expandXrapKey (masterKey: Buffer): Array<[number, number, number, number]> {
  if (masterKey.length !== 16) {
    throw new Error(`x-rap master key must be 16 bytes, got ${masterKey.length}`)
  }

  const subWord = (w: number): number =>
    ((SBOX[(w >>> 24) & 0xFF] << 24) | (SBOX[(w >>> 16) & 0xFF] << 16) | (SBOX[(w >>> 8) & 0xFF] << 8) | SBOX[w & 0xFF]) >>> 0
  const rotWord = (w: number): number => ((w << 8) | (w >>> 24)) >>> 0

  const words: number[] = []
  for (let i = 0; i < 4; i++) words.push(masterKey.readUInt32BE(i * 4))
  for (let i = 4; i < 44; i++) {
    let temp = words[i - 1]
    if (i % 4 === 0) temp = (subWord(rotWord(temp)) ^ (RCON[i / 4 - 1] << 24)) >>> 0
    words.push((words[i - 4] ^ temp) >>> 0)
  }

  return Array.from({ length: 11 }, (_, r) =>
    words.slice(r * 4, r * 4 + 4).map((w) => w >>> 0) as [number, number, number, number])
}

const EXPANDED_KEYS = expandXrapKey(Buffer.from(cfg.XRAP_MASTER_KEY, 'ascii'))
const ROUND_KEYS: ReadonlyArray<readonly [number, number, number, number]> = EXPANDED_KEYS.slice(0, 10)
const LAST_ROUND_KEY: readonly [number, number, number, number] = EXPANDED_KEYS[10]
const LAST_ROUND_KEY_BYTES = (() => {
  const b = Buffer.alloc(16)
  for (let i = 0; i < 4; i++) {
    b.writeUInt32BE(LAST_ROUND_KEY[i] >>> 0, i * 4)
  }
  return b
})()

// --- GF(2^8) helpers for T-table generation ---

function gfDouble (x: number): number {
  x <<= 1
  return (x & 0x100) ? ((x ^ 0x11B) & 0xFF) : (x & 0xFF)
}

function gfMul (x: number, n: number): number {
  if (n === 1) return x
  if (n === 2) return gfDouble(x)
  if (n === 3) return gfDouble(x) ^ x
  throw new Error(`unsupported GF multiplier: ${n}`)
}

/**
 * Pre-compute 4 shifted T-tables from the S-box for the round function.
 */
function buildLookupTables (): [number[], number[], number[], number[]] {
  const col0: number[] = []
  const col1: number[] = []
  const col2: number[] = []
  const col3: number[] = []
  for (const s of SBOX) {
    const a = gfMul(s, 2)
    const d = gfMul(s, 3)
    col0.push((((a << 24) | (s << 16) | (s << 8) | d) >>> 0))
    col1.push((((d << 24) | (a << 16) | (s << 8) | s) >>> 0))
    col2.push((((s << 24) | (d << 16) | (a << 8) | s) >>> 0))
    col3.push((((s << 24) | (s << 16) | (d << 8) | a) >>> 0))
  }
  return [col0, col1, col2, col3]
}

const [LUT0, LUT1, LUT2, LUT3] = buildLookupTables()

// --- Bit-level utilities ---

function readU32BE (buf: Buffer, off: number = 0): number {
  return buf.readUInt32BE(off)
}

function toCompactJson (data: Record<string, any> | any[] | string | Buffer | Uint8Array): string {
  if (typeof data === 'string') {
    return data
  }
  if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
    return Buffer.from(data).toString('utf-8')
  }
  return JSON.stringify(data)
}

// --- TLV field writers for the body structure ---

function fieldByte (tag: number, val: number = 0): Buffer {
  const b = Buffer.alloc(3)
  b.writeUInt16BE(tag, 0)
  b.writeUInt8(val & 0xFF, 2)
  return b
}

function fieldU32 (tag: number, val: number): Buffer {
  const b = Buffer.alloc(6)
  b.writeUInt16BE(tag, 0)
  b.writeUInt32BE(val >>> 0, 2)
  return b
}

function fieldU64 (tag: number, val: number): Buffer {
  const b = Buffer.alloc(10)
  b.writeUInt16BE(tag, 0)
  b.writeBigUInt64BE(BigInt(val), 2)
  return b
}

function fieldBlob (tag: number, data: Buffer): Buffer {
  const head = Buffer.alloc(6)
  head.writeUInt16BE(tag, 0)
  head.writeUInt32BE(data.length >>> 0, 2)
  return Buffer.concat([head, data])
}

// --- Block cipher (SM4-variant with custom S-box and round keys) ---

/**
 * Encrypt a single 16-byte block; shorter input is zero-padded on the right.
 */
export function encryptBlock16 (block: Buffer | Uint8Array): Buffer {
  const src = Buffer.from(block)
  if (src.length > 16) {
    throw new Error('block length must be <= 16')
  }
  const padded = Buffer.alloc(16)
  src.copy(padded)

  let s0 = (readU32BE(padded, 0) ^ ROUND_KEYS[0][0]) >>> 0
  let s1 = (readU32BE(padded, 4) ^ ROUND_KEYS[0][1]) >>> 0
  let s2 = (readU32BE(padded, 8) ^ ROUND_KEYS[0][2]) >>> 0
  let s3 = (readU32BE(padded, 12) ^ ROUND_KEYS[0][3]) >>> 0

  for (let rnd = 1; rnd < 10; rnd++) {
    const rk = ROUND_KEYS[rnd]
    const n0 = (LUT0[(s0 >>> 24) & 0xFF] ^ LUT1[(s1 >>> 16) & 0xFF] ^ LUT2[(s2 >>> 8) & 0xFF] ^ LUT3[s3 & 0xFF] ^ rk[0]) >>> 0
    const n1 = (LUT0[(s1 >>> 24) & 0xFF] ^ LUT1[(s2 >>> 16) & 0xFF] ^ LUT2[(s3 >>> 8) & 0xFF] ^ LUT3[s0 & 0xFF] ^ rk[1]) >>> 0
    const n2 = (LUT0[(s2 >>> 24) & 0xFF] ^ LUT1[(s3 >>> 16) & 0xFF] ^ LUT2[(s0 >>> 8) & 0xFF] ^ LUT3[s1 & 0xFF] ^ rk[2]) >>> 0
    const n3 = (LUT0[(s3 >>> 24) & 0xFF] ^ LUT1[(s0 >>> 16) & 0xFF] ^ LUT2[(s1 >>> 8) & 0xFF] ^ LUT3[s2 & 0xFF] ^ rk[3]) >>> 0
    s0 = n0
    s1 = n1
    s2 = n2
    s3 = n3
  }

  const state = [s0, s1, s2, s3]
  const out = Buffer.alloc(16)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = (state[(row + col) & 3] >>> (24 - 8 * col)) & 0xFF
      out[4 * row + col] = SBOX[idx] ^ LAST_ROUND_KEY_BYTES[4 * row + col]
    }
  }
  return out
}

/**
 * Encrypt data by splitting into 16-byte blocks (ECB mode).
 */
function encryptBlocks (src: Buffer): Buffer {
  const parts: Buffer[] = []
  for (let i = 0; i < src.length; i += 16) {
    parts.push(encryptBlock16(src.subarray(i, i + 16)))
  }
  return Buffer.concat(parts)
}

/**
 * Encrypt the 16-byte session key and append its length.
 */
export function encryptSessionKey (key: Buffer): Buffer {
  if (key.length !== 16) {
    throw new Error('session key must be 16 bytes')
  }
  const len = Buffer.alloc(4)
  len.writeUInt32BE(16, 0)
  return Buffer.concat([encryptBlock16(key), len])
}

// --- Default environment snapshots (stable across PC runtime versions) ---

const DEFAULT_INTERACTION_TRACE = Buffer.from(
  '0002000200004700000000000001ffd9ffa8005c23fff1ffff001501ff90fff9000022fff2ffff' +
  '001501ffb800770061a5ffe3ffff002a01fffcffe70000f0ffe4ffff002a01ffd30000003e01' +
  'ffd40000003e01ffc8ffff005301ffbdfffa006901ffbefffb006901ffb1fff4007d01ffa6ff' +
  'ee009301ffa8ffef009301ff9effe900a801ff96ffe600be01ff97ffe600be01ff93ffe500d3' +
  '01ff92ffe500ea01ff92ffe4010501ff92ffe3011b01ff92ffe402d101ff93ffe502f201ff94' +
  'ffe6040501',
  'hex'
)

const DEFAULT_ENVIRONMENT_SNAPSHOT = Buffer.from(
  '000000010000000000000000fffeffff00000000000000390001ffff00bc00000000006e0002' +
  '0001013400000000012f00000002011a00000000016100000000019f000000000247000000000279' +
  '0000000002b1',
  'hex'
)

// --- Body structure builder ---

interface BodyOptions {
  sessionKey?: string | Buffer | null
  timestampMs?: number | null
  nonce?: number | null
  obfuscationByte?: number | null
  interactionTrace?: Buffer | null
  environmentSnapshot?: Buffer | null
}

/**
 * Build the pre-compression TLV payload for the RAP parameter.
 */
function buildBodyStructure (
  api: string,
  data: Record<string, any> | any[] | string | Buffer | Uint8Array,
  options: BodyOptions = {}
): Buffer {
  const bodyStr = toCompactJson(data)
  const hashInput = Buffer.from(api + bodyStr, 'utf-8')
  const ts = (options.timestampMs === null || options.timestampMs === undefined)
    ? Math.floor(Date.now())
    : Math.floor(options.timestampMs)

  let key: Buffer
  if (typeof options.sessionKey === 'string') {
    key = Buffer.from(options.sessionKey, 'ascii')
  } else if (options.sessionKey) {
    key = Buffer.from(options.sessionKey)
  } else {
    key = Buffer.from(RandomGenerator.generateRandomAscii(16), 'ascii')
  }
  if (key.length !== 16) {
    throw new Error('sessionKey must be 16 bytes')
  }

  const xorByte = (options.obfuscationByte === null || options.obfuscationByte === undefined)
    ? (Math.floor(Math.random() * 255) + 1)
    : (options.obfuscationByte & 0xFF)
  const randNonce = (options.nonce === null || options.nonce === undefined)
    ? (Math.floor(Math.random() * 0x100000000) >>> 0)
    : (options.nonce >>> 0)

  const trace = options.interactionTrace ?? DEFAULT_INTERACTION_TRACE
  const env = options.environmentSnapshot ?? DEFAULT_ENVIRONMENT_SNAPSHOT

  const parts: Buffer[] = []
  parts.push(fieldU64(0x03E8, ts))
  parts.push(fieldU32(0x03E9, randNonce))
  parts.push(fieldBlob(0x03EA, key))
  parts.push(fieldU32(0x03EB, xxh32(hashInput)))

  // Boolean capability flags
  const flagTags: number[] = []
  for (let t = 1051; t < 1066; t++) flagTags.push(t)
  flagTags.push(1070)
  for (let t = 1066; t < 1070; t++) flagTags.push(t)
  for (const tag of flagTags) {
    parts.push(fieldByte(tag))
  }
  parts.push(fieldU32(1100, 0))
  for (let t = 1071; t < 1074; t++) {
    parts.push(fieldByte(t))
  }

  // Runtime timing and environment fields
  parts.push(fieldU32(1075, 0x564))
  parts.push(fieldU32(1076, 0x2C))
  parts.push(fieldU64(1077, Math.max(0, ts - 0x434)))
  parts.push(fieldBlob(1078, trace))

  parts.push(fieldU32(1082, 0))
  parts.push(fieldU32(1084, 0))
  parts.push(fieldU32(1085, 0))
  parts.push(fieldU32(1086, 100))
  parts.push(fieldU64(1087, Math.max(0, ts - 0x2D7)))
  parts.push(fieldBlob(1088, env))

  parts.push(fieldU32(1090, 0))
  parts.push(fieldU32(1097, 0))
  parts.push(fieldU32(1092, 0x566))
  parts.push(fieldU32(1094, 0x519))
  parts.push(fieldU64(1095, Math.max(0, ts - 0x218C)))
  parts.push(fieldU32(1093, 0))
  parts.push(fieldByte(1096))
  parts.push(fieldBlob(1091, Buffer.from([0x00, 0x00, 0xFF, 0xFF])))
  for (let t = 1151; t < 1157; t++) {
    parts.push(fieldByte(t))
  }

  const buf = Buffer.concat(parts)

  // First 16 bytes remain cleartext; rest is XOR-obfuscated
  const out = Buffer.from(buf)
  for (let i = 16; i < out.length; i++) {
    out[i] = out[i] ^ xorByte
  }
  return out
}

/**
 * Gzip-compress with OS byte patched to match the browser runtime (0x03).
 */
function compressBody (raw: Buffer, mtime?: number | null, level: number = 6): Buffer {
  const mt = (mtime === null || mtime === undefined) ? Math.floor(Date.now() / 1000) : mtime
  const out = Buffer.from(gzipSync(raw, { level }))
  if (out.length >= 10) {
    // Patch mtime (bytes 4-7, little-endian) and OS byte (offset 9)
    out.writeUInt32LE(mt >>> 0, 4)
    out[9] = 0x03
  }
  return out
}

function cyclicXor (data: Buffer, key: Buffer): Buffer {
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length]
  }
  return out
}

interface EnvelopeOptions {
  encryptionKey?: string | Buffer | null
  saltString?: string | null
  processingTime?: number | null
  protocolVersion?: number
}

/**
 * Encrypt, wrap, and base64-encode the compressed body into the final x-rap-param.
 */
function packEnvelope (compressed: Buffer, options: EnvelopeOptions = {}): string {
  const gz = Buffer.from(compressed)

  let key: Buffer
  if (typeof options.encryptionKey === 'string') {
    key = Buffer.from(options.encryptionKey, 'ascii')
  } else if (options.encryptionKey) {
    key = Buffer.from(options.encryptionKey)
  } else {
    key = Buffer.from(RandomGenerator.generateRandomAscii(16), 'ascii')
  }
  if (key.length !== 16) {
    throw new Error('encryptionKey must be 16 bytes')
  }

  const salt = (options.saltString === null || options.saltString === undefined)
    ? RandomGenerator.generateRandomAscii([4, 5, 6][Math.floor(Math.random() * 3)])
    : options.saltString
  const saltBytes = Buffer.from(salt, 'ascii')
  if (saltBytes.length < 0 || saltBytes.length > 255) {
    throw new Error('saltString length must fit one byte')
  }

  const xored = cyclicXor(gz, key)
  const cipherBlocks = encryptBlocks(xored)
  const gzLen = Buffer.alloc(4)
  gzLen.writeUInt32BE(gz.length >>> 0, 0)
  const cipherBody = Buffer.concat([cipherBlocks, gzLen])
  const content = Buffer.concat([saltBytes, encryptSessionKey(key), cipherBody])
  const contentHash = xxh32(content)
  const encTime = (options.processingTime === null || options.processingTime === undefined)
    ? (Math.floor(Math.random() * (240 - 60 + 1)) + 60)
    : options.processingTime
  const protocolVersion = options.protocolVersion ?? XRAP_SDK_VERSION

  const header = Buffer.alloc(36)
  header[0] = 0x07
  header[1] = 0x24
  header[2] = 0x01
  header[3] = saltBytes.length & 0xFF
  header.writeUInt32BE(1, 4)
  header.writeUInt32BE(20, 8)
  header.writeUInt32BE(cipherBody.length >>> 0, 12)
  header.writeUInt32BE(contentHash >>> 0, 16)
  header.writeUInt32BE(protocolVersion >>> 0, 20)
  header.writeUInt32BE(encTime >>> 0, 24)
  // bytes 28-35 remain zero

  return Buffer.concat([header, content]).toString('base64')
}

export interface XRapParamOptions {
  aesKey?: string | Buffer | null
  randomString?: string | null
  innerKey?: string | Buffer | null
  timestampMs?: number | null
  bodyRand32?: number | null
  mask?: number | null
  tracePayload?: Buffer | null
  envPayload?: Buffer | null
  gzipMtime?: number | null
  bodyEncryTime?: number | null
  sdkVersion?: number
  compresslevel?: number
}

/**
 * Generate x-rap-param from API path and request payload.
 *
 * @param api - Request API path (e.g. "//edith.xiaohongshu.com/api/sns/web/v1/feed")
 * @param data - Request body as object, JSON string, or raw bytes
 * @param options - Optional deterministic overrides (used for testing)
 * @returns Base64-encoded x-rap-param string
 */
export function xRapParam (
  api: string,
  data: Record<string, any> | any[] | string | Buffer | Uint8Array,
  options: XRapParamOptions = {}
): string {
  const rawBody = buildBodyStructure(api, data, {
    sessionKey: options.innerKey,
    timestampMs: options.timestampMs,
    nonce: options.bodyRand32,
    obfuscationByte: options.mask,
    interactionTrace: options.tracePayload,
    environmentSnapshot: options.envPayload
  })
  const compressed = compressBody(rawBody, options.gzipMtime, options.compresslevel ?? 6)
  return packEnvelope(compressed, {
    encryptionKey: options.aesKey,
    saltString: options.randomString,
    processingTime: options.bodyEncryTime,
    protocolVersion: options.sdkVersion ?? XRAP_SDK_VERSION
  })
}
