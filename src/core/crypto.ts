import { CryptoConfig } from '../config'
import { BitOperations, Base64Encoder, HexProcessor, RandomGenerator } from '../utils'

export class CryptoProcessor {
  config: CryptoConfig
  bitOps: BitOperations
  b64encoder: Base64Encoder
  hexProcessor: HexProcessor
  randomGen: RandomGenerator

  constructor (config?: CryptoConfig) {
    this.config = config || new CryptoConfig()
    this.bitOps = new BitOperations(this.config)
    this.b64encoder = new Base64Encoder(this.config)
    this.hexProcessor = new HexProcessor()
    this.randomGen = new RandomGenerator()
  }

  private intToLeBytes (val: number, length: number = 4): number[] {
    const arr: number[] = []
    for (let i = 0; i < length; i++) {
      arr.push(val & 0xFF)
      val = Math.floor(val / 256)
    }
    return arr
  }

  private strToLenPrefixedBytes (s: string): number[] {
    const buf = Buffer.from(s, 'utf8')
    return [buf.length, ...Array.from(buf)]
  }

  /**
   * Generate environment fingerprint A with checksum
   */
  envFingerprintA (ts: number, xorKey: number): number[] {
    // Pack timestamp as 8-byte little-endian
    const data = new Uint8Array(8)
    let tempTs = ts
    for (let i = 0; i < 8; i++) {
      data[i] = tempTs & 0xFF
      tempTs = Math.floor(tempTs / 256)
    }

    // Calculate checksums
    let sum1 = 0
    for (let i = 1; i < 5; i++) {
      sum1 += data[i]
    }
    let sum2 = 0
    for (let i = 5; i < 8; i++) {
      sum2 += data[i]
    }

    const mark = ((sum1 & 0xFF) + sum2) & 0xFF
    data[0] = mark

    // XOR with key
    const result: number[] = []
    for (let i = 0; i < data.length; i++) {
      result.push(data[i] ^ xorKey)
    }

    return result
  }

  /**
   * Generate simple environment fingerprint B (no encryption)
   */
  envFingerprintB (ts: number): number[] {
    const result: number[] = []
    for (let i = 0; i < 8; i++) {
      result.push(ts & 0xFF)
      ts = Math.floor(ts / 256)
    }
    return result
  }

  /**
   * Build payload array (t.js version - exact match)
   */
  buildPayloadArray (
    hexParameter: string,
    a1Value: string,
    appIdentifier: string = 'xhs-pc-web',
    stringParam: string = '',
    timestamp?: number
  ): number[] {
    const payload: number[] = []

    // Version bytes
    payload.push(...this.config.VERSION_BYTES)

    // Seed
    const seed = this.randomGen.generateRandomInt()
    const seedBytes = this.intToLeBytes(seed, 4)
    payload.push(...seedBytes)
    const seedByte0 = seedBytes[0]

    // Timestamp
    if (timestamp === undefined) {
      timestamp = Date.now() / 1000
    }
    const tsMs = Math.floor(timestamp * 1000)

    // Environment fingerprint A
    payload.push(...this.envFingerprintA(tsMs, this.config.ENV_FINGERPRINT_XOR_KEY))

    // Environment fingerprint B (with time offset)
    const timeOffset = this.randomGen.generateRandomByteInRange(
      this.config.ENV_FINGERPRINT_TIME_OFFSET_MIN,
      this.config.ENV_FINGERPRINT_TIME_OFFSET_MAX
    )
    payload.push(...this.envFingerprintB(Math.floor((timestamp - timeOffset) * 1000)))

    // Sequence value
    const sequenceValue = this.randomGen.generateRandomByteInRange(
      this.config.SEQUENCE_VALUE_MIN,
      this.config.SEQUENCE_VALUE_MAX
    )
    payload.push(...this.intToLeBytes(sequenceValue, 4))

    // Window props length
    const windowPropsLength = this.randomGen.generateRandomByteInRange(
      this.config.WINDOW_PROPS_LENGTH_MIN,
      this.config.WINDOW_PROPS_LENGTH_MAX
    )
    payload.push(...this.intToLeBytes(windowPropsLength, 4))

    // URI length
    const uriLength = stringParam.length
    payload.push(...this.intToLeBytes(uriLength, 4))

    // MD5 XOR segment
    const md5Bytes = Buffer.from(hexParameter, 'hex')
    for (let i = 0; i < 8; i++) {
      payload.push(md5Bytes[i] ^ seedByte0)
    }

    // A1 length (fixed 52)
    payload.push(52)

    // A1 content (padded/truncated to 52 bytes)
    let a1Bytes = Buffer.from(a1Value, 'utf8')
    if (a1Bytes.length > 52) {
      a1Bytes = a1Bytes.subarray(0, 52)
    } else if (a1Bytes.length < 52) {
      const padded = Buffer.alloc(52)
      a1Bytes.copy(padded)
      a1Bytes = padded
    }
    payload.push(...Array.from(a1Bytes))

    // Source length (fixed 10)
    payload.push(10)

    // Source content (padded/truncated to 10 bytes)
    let sourceBytes = Buffer.from(appIdentifier, 'utf8')
    if (sourceBytes.length > 10) {
      sourceBytes = sourceBytes.subarray(0, 10)
    } else if (sourceBytes.length < 10) {
      const padded = Buffer.alloc(10)
      sourceBytes.copy(padded)
      sourceBytes = padded
    }
    payload.push(...Array.from(sourceBytes))

    // Fixed byte
    payload.push(1)

    // Checksum
    payload.push(this.config.CHECKSUM_VERSION)
    payload.push(seedByte0 ^ this.config.CHECKSUM_XOR_KEY)
    payload.push(...this.config.CHECKSUM_FIXED_TAIL)

    return payload
  }
}
