import { CryptoConfig } from './config'
import { parseWebSsk, type WebSsk } from './core/ssk'

/**
 * Immutable state for a single signing operation
 */
export interface SignState {
  /** Page load timestamp in milliseconds */
  pageLoadTimestamp: number
  /** Sequence counter value */
  sequenceValue: number
  /** Window properties length */
  windowPropsLength: number
  /** URI length */
  uriLength: number
}

/**
 * Manages the state for a simulated user session to generate more realistic signatures.
 *
 * This class maintains counters that should persist and evolve across multiple requests
 * within the same logical session.
 */
export class SessionManager {
  private config: CryptoConfig
  pageLoadTimestamp: number
  sequenceValue: number
  windowPropsLength: number
  /**
   * 会话 SSK（前端 localStorage 的 `webSsk`，appId → base64）。
   *
   * 非空时 signXs 会给 x-s 加上 x6/x7。可以从浏览器复制，也可以用
   * `createWebSskExchange` 在 webprofile 上报时自己换一份。
   */
  webSsk: WebSsk

  /**
   * @param config - 可选的加密配置
   * @param options - 可选的会话状态；`webSsk` 可传 JSON 字符串或映射对象
   */
  constructor (config?: CryptoConfig, options: { webSsk?: string | WebSsk | null } = {}) {
    this.config = config || new CryptoConfig()
    this.webSsk = parseWebSsk(options.webSsk)
    this.pageLoadTimestamp = Math.floor(Date.now())
    this.sequenceValue = this.randomInt(
      this.config.SESSION_SEQUENCE_INIT_MIN,
      this.config.SESSION_SEQUENCE_INIT_MAX
    )
    this.windowPropsLength = this.randomInt(
      this.config.SESSION_WINDOW_PROPS_INIT_MIN,
      this.config.SESSION_WINDOW_PROPS_INIT_MAX
    )
  }

  private randomInt (min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  /**
   * 替换会话 SSK，例如 webSsk 交换完成之后。
   * @param webSsk - JSON 字符串或 appId → base64 映射；传空则清除
   */
  setWebSsk (webSsk: string | WebSsk | null | undefined): void {
    this.webSsk = parseWebSsk(webSsk)
  }

  /**
   * Updates the session state to simulate user activity between requests.
   *
   * This method should be called before each signing operation.
   */
  updateState (): void {
    this.sequenceValue += this.randomInt(
      this.config.SESSION_SEQUENCE_STEP_MIN,
      this.config.SESSION_SEQUENCE_STEP_MAX
    )
    this.windowPropsLength += this.randomInt(
      this.config.SESSION_WINDOW_PROPS_STEP_MIN,
      this.config.SESSION_WINDOW_PROPS_STEP_MAX
    )
  }

  /**
   * Get the current signing state for a request.
   *
   * This method automatically updates the session state counters and calculates
   * the URI length from the provided URI string.
   *
   * @param uri - The URI string for the current request
   * @returns An immutable object with the current state for signing
   */
  getCurrentState (uri: string): SignState {
    this.updateState()
    return {
      pageLoadTimestamp: this.pageLoadTimestamp,
      sequenceValue: this.sequenceValue,
      windowPropsLength: this.windowPropsLength,
      uriLength: uri.length
    }
  }
}
