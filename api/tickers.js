export default async function handler(req, res) {
  try {
    const upstream = await fetch('https://indodax.com/api/tickers')
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Upstream error' })
      return
    }
    const data = await upstream.json()
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickers' })
  }
}
