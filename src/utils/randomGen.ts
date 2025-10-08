import { CryptoConfig } from '../config'

export class RandomGenerator {
  private config: CryptoConfig

  constructor () {
    this.config = new CryptoConfig()
  }

  generateRandomBytes (byteCount: number): number[] {
    return Array.from({ length: byteCount }, () =>
      Math.floor(Math.random() * this.config.BYTE_SIZE)
    )
  }

  generateRandomByteInRange (minVal: number, maxVal: number): number {
    return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal
  }

  generateRandomInt (): number {
    return Math.floor(Math.random() * (this.config.MAX_32BIT + 1))
  }
}