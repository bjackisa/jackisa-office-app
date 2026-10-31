/**
 * Flatten an HTML email body into plain text for the WhatsApp copy.
 *
 * Ported from jackisa.com's `assets/includes/whatsapp/html_to_text.php` so an
 * Office email and its WhatsApp twin read the same. Dependency-free: it never
 * executes scripts, resolves CSS or fetches remote content. Links become
 * "label (url)", block elements become line breaks, and layout whitespace is
 * collapsed.
 */

export interface HtmlToTextOptions {
  /** Preserve links as "label (url)". Default true. */
  includeLinks?: boolean
}

export function htmlToText(html: string, options: HtmlToTextOptions = {}): string {
  const includeLinks = options.includeLinks !== false
  if (!html) return ''

  let out = String(html)

  // 1. Drop non-visible elements entirely.
  out = out.replace(/<(script|style|head|title|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  out = out.replace(/<!--[\s\S]*?-->/g, '')

  // 2. Links -> "label (url)" before tags are stripped.
  if (includeLinks) {
    out = out.replace(
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, _q, href, label) => {
        const url = decodeEntities(String(href).trim())
        const text = decodeEntities(String(label).replace(/<[^>]+>/g, '')).trim()
        if (!url || url.startsWith('javascript:')) return text
        if (!text || text === url) return url
        return `${text} (${url})`
      }
    )
  }

  // 3. Block-level elements become line breaks.
  out = out.replace(
    /<\/?\s*(p|div|br|hr|tr|li|ul|ol|table|thead|tbody|tfoot|section|article|header|footer|h[1-6]|blockquote|pre)\b[^>]*>/gi,
    '\n'
  )

  // 4. Strip every remaining tag.
  out = out.replace(/<[^>]+>/g, '')

  // 5. Decode entities and normalise whitespace.
  out = decodeEntities(out)
  out = out.replace(/\r\n|\r|\u00a0/g, (m) => (m === '\u00a0' ? ' ' : '\n'))
  out = out.replace(/[ \t]+/g, ' ')
  out = out.replace(/ *\n */g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')

  return out.trim()
}

/** Decode the handful of entities that appear in transactional email. */
function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', middot: '·', copy: '©',
  }
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => named[String(n).toLowerCase()] ?? m)
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}
