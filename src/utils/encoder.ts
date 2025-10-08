import { CryptoConfig } from '../config'

export class Base58Encoder {
  private config: CryptoConfig

  constructor () {
    this.config = new CryptoConfig()
  }

  encodeToB58 (inputBytes: Uint8Array | Buffer): string {
    let numberAccumulator = 0n
    for (const byte of inputBytes) {
      numberAccumulator = numberAccumulator * BigInt(this.config.BYTE_SIZE) + BigInt(byte)
    }

    let leadingZerosCount = 0
    for (const byte of inputBytes) {
      if (byte === 0) {
        leadingZerosCount++
      } else {
        break
      }
    }

    const encodedCharacters: string[] = []
    while (numberAccumulator > 0n) {
      const remainder = Number(numberAccumulator % BigInt(this.config.BASE58_BASE))
      numberAccumulator = numberAccumulator / BigInt(this.config.BASE58_BASE)
      encodedCharacters.push(this.config.BASE58_ALPHABET[remainder])
    }

    encodedCharacters.reverse()
    encodedCharacters.unshift(...Array(leadingZerosCount).fill(this.config.BASE58_ALPHABET[0]))

    return encodedCharacters.join('')
  }
}

export class Base64Encoder {
  private config: CryptoConfig

  constructor () {
    this.config = new CryptoConfig()
  }

  encodeToB64 (dataToEncode: string): string {
    const dataBytes = Buffer.from(dataToEncode, 'utf8')
    const standardEncoded = dataBytes.toString('base64')

    let result = ''
    for (const char of standardEncoded) {
      if (char === '=') {
        result += char
      } else {
        const index = this.config.STANDARD_BASE64_ALPHABET.indexOf(char)
        result += this.config.CUSTOM_BASE64_ALPHABET[index]
      }
    }

    return result
  }
}