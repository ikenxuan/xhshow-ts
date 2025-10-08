import { createHash } from 'node:crypto'
import { CryptoProcessor } from './core'
import {
  validateSignatureParams,
  validateGetSignatureParams,
  validatePostSignatureParams
} from './validators'

type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null

export class Xhshow {
  private cryptoProcessor: CryptoProcessor

  constructor () {
    this.cryptoProcessor = new CryptoProcessor()
  }

  private buildContentString (method: Method, uri: string, payload: Payload = null): string {
    const normalizedPayload = payload || {}

    if (method.toUpperCase() === 'POST') {
      return uri + JSON.stringify(normalizedPayload, null, 0)
        .replace(/, /g, ',')
        .replace(/: /g, ':')
    } else {
      if (Object.keys(normalizedPayload).length === 0) {
        return uri
      }

      const params = Object.entries(normalizedPayload).map(([key, value]) => {
        let valStr = ''
        if (Array.isArray(value) || value instanceof Array) {
          valStr = (value as any[]).map(v => String(v)).join(',')
        } else {
          valStr = value !== null ? String(value) : ''
        }
        return `${key}=${valStr}`
      })

      return `${uri}?${params.join('&')}`
    }
  }

  private generateDValue (content: string): string {
    return createHash('md5')
      .update(content, 'utf8')
      .digest('hex')
  }

  private buildSignature (
    dValue: string,
    a1Value: string,
    xsecAppid: string = "xhs-pc-web",
    stringParam: string = ""
  ): string {
    const payloadArray = this.cryptoProcessor.buildPayloadArray(
      dValue,
      a1Value,
      xsecAppid,
      stringParam
    )

    const xorResult = this.cryptoProcessor.bitOps.xorTransformArray(payloadArray)
    return this.cryptoProcessor.b58encoder.encodeToB58(xorResult)
  }

  signXs (
    method: Method,
    uri: string,
    a1Value: string,
    xsecAppid: string = "xhs-pc-web",
    payload: Payload = null
  ): string {
    validateSignatureParams(method, uri, a1Value)

    const signatureData = { ...this.cryptoProcessor.config.SIGNATURE_DATA_TEMPLATE }
    const contentString = this.buildContentString(method, uri, payload)
    const dValue = this.generateDValue(contentString)

    signatureData.x3 = this.cryptoProcessor.config.X3_PREFIX +
      this.buildSignature(dValue, a1Value, xsecAppid, contentString)

    const jsonStr = JSON.stringify(signatureData, null, 0)
      .replace(/, /g, ',')
      .replace(/: /g, ':')

    return this.cryptoProcessor.config.XYS_PREFIX +
      this.cryptoProcessor.b64encoder.encodeToB64(jsonStr)
  }

  signXsGet (
    uri: string,
    a1Value: string,
    xsecAppid: string = "xhs-pc-web",
    params: Payload = null
  ): string {
    validateGetSignatureParams(uri, a1Value)
    return this.signXs('GET', uri, a1Value, xsecAppid, params)
  }

  signXsPost (
    uri: string,
    a1Value: string,
    xsecAppid: string = "xhs-pc-web",
    payload: Payload = null
  ): string {
    validatePostSignatureParams(uri, a1Value)
    return this.signXs('POST', uri, a1Value, xsecAppid, payload)
  }
}