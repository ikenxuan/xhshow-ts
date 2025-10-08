import { CryptoConfig } from '../config'
import { BitOperations, Base58Encoder, Base64Encoder, HexProcessor, RandomGenerator } from '../utils'

export class CryptoProcessor {
  config: CryptoConfig
  bitOps: BitOperations
  b58encoder: Base58Encoder
  b64encoder: Base64Encoder
  hexProcessor: HexProcessor
  randomGen: RandomGenerator

  constructor () {
    this.config = new CryptoConfig()
    this.bitOps = new BitOperations()
    this.b58encoder = new Base58Encoder()
    this.b64encoder = new Base64Encoder()
    this.hexProcessor = new HexProcessor()
    this.randomGen = new RandomGenerator()
  }

  private encodeTimestamp (ts: number, randomizeFirst: boolean = true): number[] {
    const key = Array(8).fill(this.config.TIMESTAMP_XOR_KEY)
    const arr = this.intToLeBytes(ts, 8)
    const encoded = arr.map((a, i) => a ^ key[i])

    if (randomizeFirst) {
      encoded[0] = this.randomGen.generateRandomByteInRange(0, 255)
    }

    return encoded
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

  buildPayloadArray (
    hexParameter: string,
    a1Value: string,
    appIdentifier: string = "xhs-pc-web",
    stringParam: string = ""
  ): number[] {
    const randNum = this.randomGen.generateRandomInt()
    const ts = Date.now()
    const startupTs = ts - (
      this.config.STARTUP_TIME_OFFSET_MIN +
      this.randomGen.generateRandomByteInRange(
        0,
        this.config.STARTUP_TIME_OFFSET_MAX - this.config.STARTUP_TIME_OFFSET_MIN
      )
    )

    const arr: number[] = []
    arr.push(...this.config.VERSION_BYTES)

    const randBytes = this.intToLeBytes(randNum, 4)
    arr.push(...randBytes)

    const xorKey = randBytes[0]

    arr.push(...this.encodeTimestamp(ts, true))
    arr.push(...this.intToLeBytes(startupTs, 8))
    arr.push(...this.intToLeBytes(this.config.FIXED_INT_VALUE_1))
    arr.push(...this.intToLeBytes(this.config.FIXED_INT_VALUE_2))

    const stringParamLength = Buffer.from(stringParam, 'utf8').length
    arr.push(...this.intToLeBytes(stringParamLength))

    const md5Bytes = Buffer.from(hexParameter, 'hex')
    const xorMd5Bytes = Array.from(md5Bytes).map(b => b ^ xorKey)
    arr.push(...xorMd5Bytes.slice(0, 8))

    arr.push(...this.strToLenPrefixedBytes(a1Value))
    arr.push(...this.strToLenPrefixedBytes(appIdentifier))

    arr.push(
      this.config.ENV_STATIC_BYTES[0],
      this.randomGen.generateRandomByteInRange(0, 255),
      ...this.config.ENV_STATIC_BYTES.slice(1)
    )

    return arr
  }
}