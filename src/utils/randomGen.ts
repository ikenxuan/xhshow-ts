import { CryptoConfig } from '../config'

export class RandomGenerator {
  private config: CryptoConfig

  constructor () {
    this.config = new CryptoConfig()
  }

  /**
   * Generate random byte array
   */
  generateRandomBytes (byteCount: number): number[] {
    return Array.from({ length: byteCount }, () =>
      Math.floor(Math.random() * (this.config.MAX_BYTE + 1))
    )
  }

  /**
   * Generate random integer in range
   */
  generateRandomByteInRange (minVal: number, maxVal: number): number {
    return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal
  }

  /**
   * Generate 32-bit random integer
   */
  generateRandomInt (): number {
    return Math.floor(Math.random() * (this.config.MAX_32BIT + 1))
  }

  /**
   * Generate x-b3-traceid (16 random hex characters)
   */
  generateB3TraceId (): string {
    let result = ''
    for (let i = 0; i < this.config.B3_TRACE_ID_LENGTH; i++) {
      result += this.config.HEX_CHARS[Math.floor(Math.random() * this.config.HEX_CHARS.length)]
    }
    return result
  }

  /**
   * Generate x-xray-traceid (32 characters: 16 timestamp+seq + 16 random)
   */
  generateXrayTraceId (timestamp?: number, seq?: number): string {
    if (timestamp === undefined) {
      timestamp = Date.now()
    }
    if (seq === undefined) {
      seq = Math.floor(Math.random() * (this.config.XRAY_TRACE_ID_SEQ_MAX + 1))
    }

    // First 16 chars: XHS xray parameter uses timestamp bit operations
    const combined = BigInt(timestamp) << BigInt(this.config.XRAY_TRACE_ID_TIMESTAMP_SHIFT) | BigInt(seq)
    const part1 = combined.toString(16).padStart(this.config.XRAY_TRACE_ID_PART1_LENGTH, '0')

    // Last 16 chars: completely random
    let part2 = ''
    for (let i = 0; i < this.config.XRAY_TRACE_ID_PART2_LENGTH; i++) {
      part2 += this.config.HEX_CHARS[Math.floor(Math.random() * this.config.HEX_CHARS.length)]
    }

    return part1 + part2
  }
}
