import { XMLParser } from 'fast-xml-parser'

const FEEDS = {
  coindesk: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  cointelegraph: 'https://cointelegraph.com/rss'
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true
})

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

export default async function handler(req, res) {
  const {
    q = '',
    symbol = '',
    lang = 'id',
    max = '5',
    source = 'all'
  } = req.query || {}

  try {
    const items = []
    const errors = []
    const normSymbol = String(symbol || '').toUpperCase()
    const termList = [q, normSymbol].filter(Boolean).map((t) => String(t).toLowerCase())

    const feedKeys =
      source === 'coindesk' || source === 'cointelegraph'
        ? [source]
        : ['coindesk', 'cointelegraph']

    const results = await Promise.all(
      feedKeys.map(async (key) => {
        try {
          const res = await fetch(FEEDS[key])
          if (!res.ok) {
            const txt = await res.text()
            errors.push(`${key} error ${res.status}: ${txt.slice(0, 120)}`)
            return []
          }
          const xml = await res.text()
          const data = parser.parse(xml)
          const channel = data?.rss?.channel || data?.feed
          const rawItems = toArray(channel?.item || channel?.entry)
          return rawItems.map((it) => ({
            title: it.title?.['#text'] || it.title || '',
            description:
              it.description?.['#text'] || it.description || it.summary || '',
            url: it.link?.href || it.link || it.guid || '',
            publishedAt: it.pubDate || it.published || it.updated || '',
            source: key === 'coindesk' ? 'CoinDesk' : 'Cointelegraph'
          }))
        } catch (err) {
          errors.push(`${key} error: ${String(err.message || err)}`)
          return []
        }
      })
    )

    for (const list of results) {
      for (const item of list) items.push(item)
    }

    const filtered = items.filter((item) => {
      if (termList.length === 0) return true
      const haystack = `${item.title} ${item.description}`.toLowerCase()
      return termList.some((t) => haystack.includes(t))
    })

    const dedup = new Map()
    for (const item of filtered) {
      const key = item.url || item.title
      if (!key) continue
      if (!dedup.has(key)) dedup.set(key, item)
    }
    let merged = Array.from(dedup.values())

    merged.sort((a, b) => {
      const ad = new Date(a.publishedAt || 0).getTime()
      const bd = new Date(b.publishedAt || 0).getTime()
      return bd - ad
    })

    if (lang === 'id' && merged.length > 0) {
      try {
        const texts = []
        for (const item of merged) {
          texts.push(item.title || '')
          texts.push(item.description || '')
        }
        const trRes = await fetch('https://libretranslate.de/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: texts,
            source: 'en',
            target: 'id',
            format: 'text'
          })
        })
        if (trRes.ok) {
          const trData = await trRes.json()
          const translated = Array.isArray(trData.translatedText)
            ? trData.translatedText
            : []
          if (translated.length === texts.length) {
            let idx = 0
            merged = merged.map((item) => {
              const title = translated[idx++] || item.title
              const description = translated[idx++] || item.description
              return { ...item, translated: { title, description } }
            })
          }
        }
      } catch (err) {
        // best-effort
      }
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
    res.status(200).json({
      lang,
      items: merged.slice(0, Number(max)),
      errors
    })
  } catch (err) {
    res.status(200).json({ items: [], errors: ['Failed to fetch news'] })
  }
}
