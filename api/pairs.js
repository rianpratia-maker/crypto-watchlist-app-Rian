export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const upstream = await fetch('https://indodax.com/api/pairs')
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Failed to fetch pairs' })
      return
    }
    const data = await upstream.json()
    const symbols = {}

    for (const item of data || []) {
      const symbol = String(item.traded_currency || '').toLowerCase()
      const logo = item.url_logo_png || item.url_logo || ''
      if (symbol && logo && !symbols[symbol]) symbols[symbol] = logo
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ symbols })
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
}
