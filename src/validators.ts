import { z } from 'zod'

type Method = 'GET' | 'POST'
type Payload = Record<string, any> | null

// 定义验证模式
const methodSchema = z.enum(['GET', 'POST'], {
  message: '请求方法必须是 "GET" 或 "POST"'
})

const uriSchema = z.string({
  message: 'URI 必须是字符串'
}).min(1, 'URI 不能为空')

const a1ValueSchema = z.string({
  message: 'a1Value 必须是字符串'
})

// 组合验证模式
const signatureParamsSchema = z.object({
  method: methodSchema,
  uri: uriSchema,
  a1Value: a1ValueSchema
})

const getSignatureParamsSchema = z.object({
  uri: uriSchema,
  a1Value: a1ValueSchema
})

const postSignatureParamsSchema = z.object({
  uri: uriSchema,
  a1Value: a1ValueSchema
})

export function validateSignatureParams (method: Method, uri: string, a1Value: string) {
  try {
    signatureParamsSchema.parse({ method, uri, a1Value })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]
      throw new TypeError(firstError.message)
    }
    throw error
  }
}

export function validateGetSignatureParams (uri: string, a1Value: string) {
  try {
    getSignatureParamsSchema.parse({ uri, a1Value })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]
      throw new TypeError(firstError.message)
    }
    throw error
  }
}

export function validatePostSignatureParams (uri: string, a1Value: string) {
  try {
    postSignatureParamsSchema.parse({ uri, a1Value })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0]
      throw new TypeError(firstError.message)
    }
    throw error
  }
}