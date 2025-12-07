/**
 * Extract URI path from full URL (removes protocol, host, query, fragment)
 */
export function extractUri (url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string')
  }

  url = url.trim()

  try {
    // Try to parse as full URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url)
      const path = parsed.pathname
      if (!path || path === '/') {
        throw new Error(`Cannot extract valid URI path from URL: ${url}`)
      }
      return path
    }

    // Already a path, just remove query string if present
    const queryIndex = url.indexOf('?')
    const path = queryIndex >= 0 ? url.substring(0, queryIndex) : url

    if (!path || path === '/') {
      throw new Error(`Cannot extract valid URI path from URL: ${url}`)
    }

    return path
  } catch (e) {
    if (e instanceof Error && e.message.includes('Cannot extract')) {
      throw e
    }
    throw new Error(`Cannot extract valid URI path from URL: ${url}`)
  }
}

/**
 * Build complete URL with query parameters (handles parameter escaping)
 *
 * IMPORTANT: This function uses XHS platform-specific encoding rules.
 * Only '=' characters are encoded as '%3D'. Other special characters
 * (including ',') are NOT encoded, as required by XHS signature algorithm.
 */
export function buildUrl (baseUrl: string, params?: Record<string, any> | null): string {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('baseUrl must be a non-empty string')
  }

  if (!params) {
    return baseUrl
  }

  const queryParts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    let formattedValue: string
    if (Array.isArray(value)) {
      formattedValue = value.map(v => String(v)).join(',')
    } else if (value !== null && value !== undefined) {
      formattedValue = String(value)
    } else {
      formattedValue = ''
    }

    // XHS platform requires only '=' to be encoded as '%3D'
    const encodedValue = formattedValue.replace(/=/g, '%3D')
    queryParts.push(`${key}=${encodedValue}`)
  }

  const queryString = queryParts.join('&')

  // Determine correct separator based on URL structure
  let separator: string
  if (!baseUrl.includes('?')) {
    separator = '?'
  } else if (baseUrl.endsWith('?') || baseUrl.endsWith('&')) {
    separator = ''
  } else {
    separator = '&'
  }

  return `${baseUrl}${separator}${queryString}`
}
