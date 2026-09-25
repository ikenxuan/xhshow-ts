/**
 * x-s-common signature generation
 */

import { CryptoConfig } from '../config'
import { CRC32 } from './crc32'
import { FingerprintGenerator } from '../generators/fingerprint'
import { Base64Encoder } from '../utils/encoder'

export class XsCommonSigner {
  private config: CryptoConfig
  private fpGenerator: FingerprintGenerator
  private encoder: Base64Encoder

  constructor (config?: CryptoConfig) {
    this.config = config || new CryptoConfig()
    this.fpGenerator = new FingerprintGenerator(this.config)
    this.encoder = new Base64Encoder(this.config)
  }

  /**
   * Generate x-s-common signature
   */
  sign (cookieDict: Record<string, string>): string {
    const a1Value = cookieDict.a1
    if (!a1Value) {
      throw new Error("Missing 'a1' in cookies")
    }

    const fingerprint = this.fpGenerator.generate(cookieDict, this.config.PUBLIC_USERAGENT)
    const b1 = this.fpGenerator.generateB1(fingerprint)

    const x9 = CRC32.crc32JsInt(b1)

    const signStruct = { ...this.config.SIGNATURE_XSCOMMON_TEMPLATE }
    signStruct.x5 = a1Value
    signStruct.x8 = b1
    signStruct.x9 = x9
    // x4 就是站点构建号，与 webBuild Cookie 同源（2026-09-25 真机实测两者都是 6.56.3）。
    // 优先跟着调用方的 Cookie 走，模板里的默认值只是抓不到 Cookie 时的兜底 ——
    // 否则每次平台发版都要改库里的常量，而旧值会让请求带上一个过期的构建号。
    if (cookieDict.webBuild) signStruct.x4 = cookieDict.webBuild

    const signJson = JSON.stringify(signStruct)
    const xsCommon = this.encoder.encode(signJson)

    return xsCommon
  }
}
