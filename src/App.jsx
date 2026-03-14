import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STABLE_PAIRS = new Set([
  'usdt_idr',
  'usdc_idr',
  'dai_idr',
  'tusd_idr',
  'busd_idr',
  'xaut_idr'
])

const MEME_BASES = new Set([
  'DOGE',
  'SHIB',
  'PEPE',
  'FLOKI',
  'BONK',
  'WIF',
  'MEME',
  'BRETT',
  'MOG',
  'TURBO',
  'BABYDOGE',
  'LADYS',
  'KUNCI',
  'TKO'
])

const TV_BASES = new Set([
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
  'TRX',
  'DOT',
  'AVAX',
  'LINK',
  'MATIC',
  'LTC',
  'BCH',
  'SHIB',
  'TON',
  'UNI',
  'AAVE',
  'ATOM',
  'FIL',
  'NEAR',
  'ETC',
  'XLM',
  'XMR',
  'HBAR',
  'ICP',
  'RNDR',
  'OP',
  'ARB'
])

const DEFAULT_RISK = {
  modal: 10_000_000,
  dailyLossPct: 2,
  riskPerPosPct: 0.5,
  stopMajorPct: 3,
  stopAltPct: 6
}

const SOURCE_MAP = {
  coindesk: 'CoinDesk',
  cointelegraph: 'Cointelegraph'
}

function formatIDR(value, digits = 0) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: digits
  }).format(value)
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: digits
  }).format(value)
}

function App() {
  const [tickers, setTickers] = useState([])
  const [snapshot, setSnapshot] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [risk, setRisk] = useState(DEFAULT_RISK)
  const [search, setSearch] = useState('')
  const [lastUpdatedMs, setLastUpdatedMs] = useState(0)
  const [topCoins, setTopCoins] = useState([
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
    { id: 'tether', name: 'Tether', symbol: 'USDT' },
    { id: 'bnb', name: 'BNB', symbol: 'BNB' },
    { id: 'xrp', name: 'XRP', symbol: 'XRP' },
    { id: 'usd-coin', name: 'USD Coin', symbol: 'USDC' },
    { id: 'solana', name: 'Solana', symbol: 'SOL' },
    { id: 'tron', name: 'TRON', symbol: 'TRX' },
    { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
    { id: 'cardano', name: 'Cardano', symbol: 'ADA' }
  ])
  const [expandedCoin, setExpandedCoin] = useState('')
  const [newsByCoin, setNewsByCoin] = useState({})
  const [newsLoading, setNewsLoading] = useState({})
  const [newsError, setNewsError] = useState({})
  const [newsLimit, setNewsLimit] = useState(5)
  const [newsSort, setNewsSort] = useState('newest')
  const [newsSourceFilter, setNewsSourceFilter] = useState('all')
  const [showAllNewsCoins, setShowAllNewsCoins] = useState(false)
  const [logoBySymbol, setLogoBySymbol] = useState({})
  const [priceHistory, setPriceHistory] = useState({})
  const [expandedPair, setExpandedPair] = useState('')
  const [liveIntervalMs, setLiveIntervalMs] = useState(60 * 60_000)
  const [pairsPerPage, setPairsPerPage] = useState(12)
  const [pairsPage, setPairsPage] = useState(1)

  const intervalMs = 2 * 60 * 60 * 1000
  const newsCacheMs = 30 * 60 * 1000
  const liveIntervals = [
    { label: '10s', value: 10_000 },
    { label: '15s', value: 15_000 },
    { label: '30s', value: 30_000 },
    { label: '60s', value: 60_000 },
    { label: '15m', value: 15 * 60_000 },
    { label: '1h', value: 60 * 60_000 }
  ]

  const getLogoForSymbol = (symbol) => {
    const key = String(symbol || '').toLowerCase()
    if (!key) return ''
    return (
      logoBySymbol[key] ||
      `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@main/128/color/${key}.png`
    )
  }

  const fetchLogoMap = async () => {
    try {
      const res = await fetch('/api/pairs')
      if (!res.ok) return
      const data = await res.json()
      if (data && data.symbols) setLogoBySymbol(data.symbols)
    } catch {
      // non-blocking
    }
  }

  const fetchTickers = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    if (!silent) setError('')
    try {
      const res = await fetch('/api/tickers')
      if (!res.ok) throw new Error('Gagal memuat data Indodax')
      const data = await res.json()
      const rows = Object.entries(data.tickers || {}).map(([pair, t]) => {
        const last = Number(t.last || 0)
        const vol = Number(t.vol_idr || 0)
        const high = Number(t.high || 0)
        const low = Number(t.low || 0)
        const rangePct = low > 0 ? ((high - low) / low) * 100 : 0
        return {
          pair,
          last,
          vol,
          high,
          low,
          rangePct
        }
      })
      const ts = Number(data.tickers?.btc_idr?.server_time || 0) * 1000
      if (ts) {
        const date = new Date(ts)
        setSnapshot(date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))
        setLastUpdatedMs(ts)
      }
      setTickers(rows)
      setPriceHistory((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          const key = row.pair
          const series = Array.isArray(next[key]) ? [...next[key]] : []
          if (Number.isFinite(row.last)) series.push(row.last)
          if (series.length > 30) series.splice(0, series.length - 30)
          next[key] = series
        }
        return next
      })
    } catch (err) {
      if (!silent) setError(err.message || 'Terjadi kesalahan')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickers()
    fetchLogoMap()
  }, [])

  useEffect(() => {
    const id = setInterval(fetchTickers, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  useEffect(() => {
    if (!expandedPair) return
    const id = setInterval(() => fetchTickers({ silent: true }), liveIntervalMs)
    return () => clearInterval(id)
  }, [expandedPair, liveIntervalMs])

  useEffect(() => {
    // Keep static Top 10 list to avoid CORS/rate-limit issues in production.
    setTopCoins((prev) => (prev.length ? prev : []))
  }, [])

  const sparklinePoints = (values, width = 120, height = 36, padding = 4) => {
    const cleaned = Array.isArray(values)
      ? values.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : []
    if (cleaned.length < 2) {
      const mid = height / 2
      return `${padding},${mid} ${width - padding},${mid}`
    }
    const min = Math.min(...cleaned)
    const max = Math.max(...cleaned)
    const range = max - min || 1
    return cleaned
      .map((v, i) => {
        const x = padding + (i / (cleaned.length - 1)) * (width - padding * 2)
        const y = padding + (1 - (v - min) / range) * (height - padding * 2)
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }

  const hashSeed = (text) => {
    let hash = 0
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 1_000_000
    }
    return hash / 1_000_000
  }

  const buildSyntheticSeries = (t, points = 60) => {
    const low = Number(t.low || 0)
    const high = Number(t.high || 0)
    const last = Number(t.last || 0)
    const seed = hashSeed(t.pair || '') || 0.123
    const jitter = (i, base) =>
      base * (1 + Math.sin((i + seed * 10) * 1.7) * 0.002)

    if (low > 0 && high > 0) {
      const split = Math.max(2, Math.floor(points * 0.55))
      const series = []
      for (let i = 0; i < points; i += 1) {
        let v = 0
        if (i < split) {
          const tUp = i / (split - 1)
          v = low + (high - low) * tUp
        } else {
          const tDown = (i - split) / Math.max(1, points - split - 1)
          v = high + (last - high) * tDown
        }
        series.push(jitter(i, v))
      }
      return series
    }

    if (last > 0) {
      const series = []
      for (let i = 0; i < points; i += 1) {
        series.push(jitter(i, last))
      }
      return series
    }

    return []
  }

  const getDisplaySeries = (t) => {
    const history = priceHistory[t.pair] || []
    if (history.length >= 20) return history
    const low = Number(t.low || 0)
    const high = Number(t.high || 0)
    const last = Number(t.last || 0)
    if (low > 0 && high > 0) {
      return buildSyntheticSeries(t, 60)
    }
    if (last > 0) return buildSyntheticSeries(t, 60)
    return []
  }

  const getDetailSeries = (t) => {
    const history = priceHistory[t.pair] || []
    if (history.length >= 40) return history
    return buildSyntheticSeries(t, 120)
  }

  const formatIntervalLabel = (ms) => {
    const totalSeconds = Math.round(ms / 1000)
    if (totalSeconds >= 3600) {
      const hours = Math.round(totalSeconds / 3600)
      return `${hours}h`
    }
    if (totalSeconds >= 60) {
      const minutes = Math.round(totalSeconds / 60)
      return `${minutes}m`
    }
    return `${totalSeconds}s`
  }

  const getTradingViewSymbol = (pair) => {
    const base = String(pair || '').split('_')[0]?.toUpperCase()
    if (!base || !TV_BASES.has(base)) return ''
    return `BINANCE:${base}USDT`
  }

  const getTradingViewInterval = (ms) => {
    const minutes = Math.max(1, Math.round(ms / 60000))
    return minutes
  }

  const watchlist = useMemo(() => {
    const filtered = tickers.filter((t) => !STABLE_PAIRS.has(t.pair))
    const scored = filtered.map((t) => {
      const volScore = Math.log10(t.vol + 1)
      const rangeScore = t.rangePct / 5
      return { ...t, score: volScore + rangeScore }
    })
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [tickers])

  const recommended = useMemo(() => watchlist.slice(0, 5), [watchlist])
  const watchlistPairs = useMemo(
    () => new Set(watchlist.map((t) => t.pair)),
    [watchlist]
  )
  const watchlistSymbols = useMemo(
    () => new Set(watchlist.map((t) => t.pair.split('_')[0])),
    [watchlist]
  )

  const altRecommendations = useMemo(() => {
    return watchlist.filter((t) => {
      const base = t.pair.split('_')[0].toUpperCase()
      return !MEME_BASES.has(base)
    })
  }, [watchlist])

  const memeRecommendations = useMemo(() => {
    return watchlist.filter((t) => {
      const base = t.pair.split('_')[0].toUpperCase()
      return MEME_BASES.has(base)
    })
  }, [watchlist])

  const newsCoins = useMemo(() => {
    if (showAllNewsCoins) return topCoins
    if (watchlistSymbols.size === 0) return topCoins
    const filtered = topCoins.filter((c) =>
      watchlistSymbols.has(String(c.symbol || '').toLowerCase())
    )
    return filtered.length > 0 ? filtered : topCoins
  }, [topCoins, watchlistSymbols, showAllNewsCoins])

  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = tickers.filter((t) => !STABLE_PAIRS.has(t.pair))
    if (!q) return list
    return list.filter((t) => t.pair.includes(q))
  }, [tickers, search])

  useEffect(() => {
    setPairsPage(1)
  }, [search, pairsPerPage])

  const totalPairsPages = Math.max(
    1,
    Math.ceil(filteredTable.length / pairsPerPage)
  )
  const safePairsPage = Math.min(pairsPage, totalPairsPages)
  const pagedPairs = useMemo(() => {
    const start = (safePairsPage - 1) * pairsPerPage
    return filteredTable.slice(start, start + pairsPerPage)
  }, [filteredTable, safePairsPage, pairsPerPage])

  const dailyLoss = (risk.modal * risk.dailyLossPct) / 100
  const riskPerPos = (risk.modal * risk.riskPerPosPct) / 100
  const nextRefresh = lastUpdatedMs ? new Date(lastUpdatedMs + intervalMs) : null

  const fetchNewsForCoin = async (coin) => {
    const cached = newsByCoin[coin.id]
    if (cached && Date.now() - cached.fetchedAt < newsCacheMs) return
    setNewsLoading((prev) => ({ ...prev, [coin.id]: true }))
    setNewsError((prev) => ({ ...prev, [coin.id]: '' }))
    try {
      const params = new URLSearchParams({
        symbol: coin.symbol,
        assetId: coin.id,
        q: coin.name,
        lang: 'id',
        max: String(newsLimit),
        merge: '1',
        source: newsSourceFilter
      })
      const res = await fetch(`/api/news?${params.toString()}`)
      if (!res.ok) throw new Error('Gagal memuat news')
      const data = await res.json()
      if ((data.items || []).length === 0 && (data.errors || []).length > 0) {
        setNewsError((prev) => ({
          ...prev,
          [coin.id]: data.errors[0]
        }))
      }
      const items = data.items || []
      const sorted = items.sort((a, b) => {
        const ad = new Date(a.publishedAt || 0).getTime()
        const bd = new Date(b.publishedAt || 0).getTime()
        return newsSort === 'newest' ? bd - ad : ad - bd
      })
      setNewsByCoin((prev) => ({
        ...prev,
        [coin.id]: {
          fetchedAt: Date.now(),
          items: sorted.slice(0, newsLimit),
          lang: data.lang || 'id'
        }
      }))
    } catch (err) {
      setNewsError((prev) => ({
        ...prev,
        [coin.id]: err.message || 'Gagal memuat news'
      }))
    } finally {
      setNewsLoading((prev) => ({ ...prev, [coin.id]: false }))
    }
  }

  return (
    <div className="app">
      <div className="top-bar">
        <div className="top-bar-inner">
          <span className="label">Realtime interval</span>
          <div className="top-bar-controls">
            <select
              value={liveIntervalMs}
              onChange={(e) => setLiveIntervalMs(Number(e.target.value))}
            >
              {liveIntervals.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="muted tiny">
              Berlaku untuk chart koin yang sedang dibuka.
            </span>
          </div>
        </div>
      </div>
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Indodax Spot</p>
          <h1>Crypto Watchlist</h1>
          <p className="subtitle">
            Data realtime untuk cepat baca peluang — fokus pada likuiditas dan
            volatilitas intraday.
          </p>
          <p className="subtitle muted">Auto-refresh setiap 2 jam.</p>
        </div>
        <div className="hero-card">
          <div>
            <p className="label">Snapshot (WIB)</p>
            <p className="value">{snapshot || '—'}</p>
          </div>
          <div>
            <p className="label">Next Refresh (WIB)</p>
            <p className="value">
              {nextRefresh
                ? nextRefresh.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
                : '—'}
            </p>
          </div>
          <div>
            <p className="label">Total Pair</p>
            <p className="value">{tickers.length || '—'}</p>
          </div>
          <button className="primary" onClick={fetchTickers} disabled={loading}>
            {loading ? 'Memuat...' : 'Refresh Data'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Top Watchlist (Agresif)</h2>
          <p>Skor = kombinasi volume & range. Stablecoin disaring.</p>
        </div>
        <div className="recommendations">
          {recommended.length > 0 ? (
            recommended.map((t, idx) => (
              <div className="recommend-card" key={t.pair}>
                <div>
                  <p className="label">Rekomendasi #{idx + 1}</p>
                  <p className="value with-logo">
                    <span className="coin-badge small">
                      <img
                        className="coin-logo"
                        src={getLogoForSymbol(t.pair.split('_')[0])}
                        alt={`${t.pair.split('_')[0].toUpperCase()} logo`}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const fallback = e.currentTarget.nextSibling
                          if (fallback) fallback.style.display = 'grid'
                        }}
                      />
                      <span className="coin-fallback">
                        {t.pair.split('_')[0].toUpperCase()}
                      </span>
                    </span>
                    {t.pair}
                  </p>
                </div>
                <div className="reason">
                  <span>Vol {formatNumber(t.vol / 1_000_000_000, 2)}B</span>
                  <span>Range {formatNumber(t.rangePct, 2)}%</span>
                </div>
                <p className="price strong">
                  {formatIDR(t.last, t.last < 1 ? 6 : 0)}
                </p>
                {(() => {
                  const series = priceHistory[t.pair] || []
                  const prev = series.length > 1 ? series[series.length - 2] : null
                  const change = prev ? t.last - prev : 0
                  const changePct = prev ? (change / prev) * 100 : 0
                  const isUp = change >= 0
                  return (
                    <div className={`price-change ${isUp ? 'up' : 'down'}`}>
                      {prev ? `${change >= 0 ? '+' : ''}${formatIDR(change, 0)}` : '—'}{' '}
                      {prev ? `(${changePct >= 0 ? '+' : ''}${formatNumber(changePct, 2)}%)` : ''}
                    </div>
                  )
                })()}
                <p className="muted tiny">
                  Likuiditas tinggi + volatilitas intraday untuk peluang cepat.
                </p>
              </div>
            ))
          ) : (
            <div className="recommend-card">
              <div>
                <p className="label">Rekomendasi</p>
                <p className="value">{loading ? 'Memuat...' : 'Belum ada data'}</p>
              </div>
              <p className="muted tiny">
                Tekan “Refresh Data” untuk mengambil snapshot terbaru.
              </p>
            </div>
          )}
        </div>
        <div className="split-recos">
          <div>
            <div className="section-head compact">
              <h3>Rekomendasi Alt Coin</h3>
              <p>Top alt berdasarkan skor saat ini.</p>
            </div>
            <div className="recommendations">
              {(altRecommendations.length > 0 ? altRecommendations.slice(0, 5) : []).map(
                (t) => (
                  <div className="recommend-card mini" key={`alt-${t.pair}`}>
                    <p className="value">{t.pair}</p>
                    <p className="price strong">
                      {formatIDR(t.last, t.last < 1 ? 6 : 0)}
                    </p>
                    <div className="reason">
                      <span>Vol {formatNumber(t.vol / 1_000_000_000, 2)}B</span>
                      <span>Range {formatNumber(t.rangePct, 2)}%</span>
                    </div>
                  </div>
                )
              )}
              {altRecommendations.length === 0 && (
                <div className="recommend-card mini">
                  <p className="muted tiny">Belum ada alt coin terdeteksi.</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="section-head compact">
              <h3>Rekomendasi Meme Coin</h3>
              <p>Top meme coin berdasarkan skor saat ini.</p>
            </div>
            <div className="recommendations">
              {(memeRecommendations.length > 0 ? memeRecommendations.slice(0, 5) : []).map(
                (t) => (
                  <div className="recommend-card mini" key={`meme-${t.pair}`}>
                    <p className="value">{t.pair}</p>
                    <p className="price strong">
                      {formatIDR(t.last, t.last < 1 ? 6 : 0)}
                    </p>
                    <div className="reason">
                      <span>Vol {formatNumber(t.vol / 1_000_000_000, 2)}B</span>
                      <span>Range {formatNumber(t.rangePct, 2)}%</span>
                    </div>
                  </div>
                )
              )}
              {memeRecommendations.length === 0 && (
                <div className="recommend-card mini">
                  <p className="muted tiny">Belum ada meme coin terdeteksi.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="coin-stream list">
          {watchlist.length > 0 ? (
            watchlist.map((t) => {
              const history = priceHistory[t.pair] || []
              const series = getDisplaySeries(t)
              const prev = history.length > 1 ? history[history.length - 2] : null
              const change = prev ? t.last - prev : 0
              const changePct = prev ? (change / prev) * 100 : 0
              const isUp = change >= 0
              const sparkClass = series.length > 1 ? (isUp ? 'up' : 'down') : 'flat'
              const base = t.pair.split('_')[0].toUpperCase()
              const quote = t.pair.split('_')[1]?.toUpperCase() || 'IDR'
              const isOpen = expandedPair === t.pair
              const tvSymbol = getTradingViewSymbol(t.pair)
              const tvInterval = getTradingViewInterval(liveIntervalMs)
              const detailSeries = getDetailSeries(t)
              return (
                <div className="coin-row list" key={t.pair}>
                  <button
                    type="button"
                    className="coin-card-btn"
                    onClick={() => setExpandedPair(isOpen ? '' : t.pair)}
                    aria-expanded={isOpen}
                  >
                    <div className="coin-left">
                      <span className="coin-badge">
                        <img
                          className="coin-logo"
                          src={getLogoForSymbol(t.pair.split('_')[0])}
                          alt={`${base} logo`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            const fallback = e.currentTarget.nextSibling
                            if (fallback) fallback.style.display = 'grid'
                          }}
                        />
                        <span className="coin-fallback">{base}</span>
                      </span>
                      <div>
                        <p className="coin-symbol">{base}</p>
                        <p className="muted tiny">
                          Pair {base}/{quote} · Vol{' '}
                          {formatNumber(t.vol / 1_000_000_000, 2)}B · Range{' '}
                          {formatNumber(t.rangePct, 2)}%
                        </p>
                      </div>
                    </div>
                    <div className="coin-middle">
                      <svg
                        className="sparkline"
                        viewBox="0 0 120 36"
                        preserveAspectRatio="none"
                      >
                        <polyline
                          points={sparklinePoints(series)}
                          className={sparkClass}
                          stroke={sparkClass === 'down' ? '#ef4444' : sparkClass === 'up' ? '#16a34a' : 'rgba(15, 23, 42, 0.45)'}
                          fill="none"
                        />
                      </svg>
                    </div>
                    <div className="coin-right">
                      <p className="price">{formatIDR(t.last, t.last < 1 ? 6 : 0)}</p>
                      <p className={`change ${isUp ? 'up' : 'down'}`}>
                        {prev ? `${change >= 0 ? '+' : ''}${formatIDR(change, 0)}` : '—'}{' '}
                        {prev
                          ? `(${changePct >= 0 ? '+' : ''}${formatNumber(changePct, 2)}%)`
                          : ''}
                      </p>
                    </div>
                  </button>
                    {isOpen && (
                      <div className="coin-detail">
                        <div className="coin-detail-head">
                          <span className="muted tiny">
                            Realtime chart ({formatIntervalLabel(liveIntervalMs)})
                          </span>
                          <span className="muted tiny">Update {snapshot || '—'}</span>
                        </div>
                        {tvSymbol ? (
                          <div className="tv-embed">
                            <iframe
                              title={`${t.pair} TradingView`}
                              src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                                tvSymbol
                              )}&interval=${tvInterval}&theme=light&style=3&timezone=Asia%2FJakarta&withdateranges=1&hideideas=1&hidevolume=1&allow_symbol_change=0`}
                              loading="lazy"
                              frameBorder="0"
                              allow="fullscreen"
                            />
                          </div>
                        ) : (
                          <div className="tv-fallback">
                            <p className="muted tiny">
                              TradingView tidak tersedia untuk koin ini. Menampilkan
                              sparkline lokal.
                            </p>
                            <svg
                              className="sparkline large"
                              viewBox="0 0 320 96"
                              preserveAspectRatio="none"
                            >
                              <polyline
                                points={sparklinePoints(detailSeries, 320, 96, 6)}
                                className={sparkClass}
                                stroke={
                                  sparkClass === 'down'
                                    ? '#ef4444'
                                    : sparkClass === 'up'
                                      ? '#16a34a'
                                      : 'rgba(15, 23, 42, 0.45)'
                                }
                                fill="none"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )
            })
          ) : (
            <div className="coin-row empty">
              {loading ? 'Memuat data...' : 'Belum ada data watchlist.'}
            </div>
          )}
        </div>
      </section>

      <section className="section grid">
        <div className="card">
          <h2>Risk & Sizing</h2>
          <p className="muted">
            Ini bukan saran finansial. Hitung ukuran posisi dari stop-loss.
          </p>
          <div className="form">
            <label>
              Modal (IDR)
              <input
                type="number"
                value={risk.modal}
                onChange={(e) =>
                  setRisk({ ...risk, modal: Number(e.target.value || 0) })
                }
              />
            </label>
            <label>
              Batas Rugi Harian (%)
              <input
                type="number"
                step="0.1"
                value={risk.dailyLossPct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    dailyLossPct: Number(e.target.value || 0)
                  })
                }
              />
            </label>
            <label>
              Risiko per Posisi (%)
              <input
                type="number"
                step="0.1"
                value={risk.riskPerPosPct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    riskPerPosPct: Number(e.target.value || 0)
                  })
                }
              />
            </label>
            <label>
              Stop% Majors (BTC/ETH/SOL)
              <input
                type="number"
                step="0.1"
                value={risk.stopMajorPct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    stopMajorPct: Number(e.target.value || 0)
                  })
                }
              />
            </label>
            <label>
              Stop% Alt/Meme
              <input
                type="number"
                step="0.1"
                value={risk.stopAltPct}
                onChange={(e) =>
                  setRisk({
                    ...risk,
                    stopAltPct: Number(e.target.value || 0)
                  })
                }
              />
            </label>
          </div>
          <div className="calc">
            <div>
              <p className="label">Batas Rugi Harian</p>
              <p className="value">{formatIDR(dailyLoss)}</p>
            </div>
            <div>
              <p className="label">Risiko per Posisi</p>
              <p className="value">{formatIDR(riskPerPos)}</p>
            </div>
            <div>
              <p className="label">Ukuran Posisi (Majors)</p>
              <p className="value">
                {risk.stopMajorPct > 0
                  ? formatIDR(riskPerPos / (risk.stopMajorPct / 100))
                  : '—'}
              </p>
            </div>
            <div>
              <p className="label">Ukuran Posisi (Alt/Meme)</p>
              <p className="value">
                {risk.stopAltPct > 0
                  ? formatIDR(riskPerPos / (risk.stopAltPct / 100))
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>All Pairs</h2>
          <p className="muted">Cari cepat pair yang kamu mau pantau.</p>
          <div className="search">
            <input
              type="text"
              placeholder="Cari pair, contoh: btc_idr"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>{filteredTable.length} pair</span>
          </div>
          <div className="pager-controls">
            <label>
              Per halaman
              <select
                value={pairsPerPage}
                onChange={(e) => setPairsPerPage(Number(e.target.value))}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={18}>18</option>
                <option value={24}>24</option>
              </select>
            </label>
            <div className="pager">
              <button
                type="button"
                onClick={() => setPairsPage(1)}
                disabled={safePairsPage <= 1}
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setPairsPage((p) => Math.max(1, p - 1))}
                disabled={safePairsPage <= 1}
              >
                Prev
              </button>
              <span className="muted tiny">
                {safePairsPage} / {totalPairsPages}
              </span>
              <label className="pager-jump">
                <span className="muted tiny">Jump</span>
                <input
                  type="number"
                  min={1}
                  max={totalPairsPages}
                  value={safePairsPage}
                  onChange={(e) => {
                    const raw = Number(e.target.value || 1)
                    const next = Math.min(
                      totalPairsPages,
                      Math.max(1, raw)
                    )
                    setPairsPage(next)
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setPairsPage((p) => Math.min(totalPairsPages, p + 1))}
                disabled={safePairsPage >= totalPairsPages}
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setPairsPage(totalPairsPages)}
                disabled={safePairsPage >= totalPairsPages}
              >
                Last
              </button>
            </div>
          </div>
          <div className="coin-stream cards">
            {pagedPairs.length > 0 ? (
              pagedPairs.map((t) => {
                const history = priceHistory[t.pair] || []
                const series = getDisplaySeries(t)
                const prev = history.length > 1 ? history[history.length - 2] : null
                const change = prev ? t.last - prev : 0
                const changePct = prev ? (change / prev) * 100 : 0
                const isUp = change >= 0
                const sparkClass = series.length > 1 ? (isUp ? 'up' : 'down') : 'flat'
                const base = t.pair.split('_')[0].toUpperCase()
                const quote = t.pair.split('_')[1]?.toUpperCase() || 'IDR'
                const isOpen = expandedPair === t.pair
                const tvSymbol = getTradingViewSymbol(t.pair)
                const tvInterval = getTradingViewInterval(liveIntervalMs)
                const detailSeries = getDetailSeries(t)
                return (
                  <div
                    key={t.pair}
                    className={`coin-row card ${watchlistPairs.has(t.pair) ? 'highlight' : ''}`}
                  >
                    <button
                      type="button"
                      className="coin-card-btn"
                      onClick={() => setExpandedPair(isOpen ? '' : t.pair)}
                      aria-expanded={isOpen}
                    >
                      <div className="coin-left">
                        <span className="coin-badge">
                          <img
                            className="coin-logo"
                            src={getLogoForSymbol(t.pair.split('_')[0])}
                            alt={`${base} logo`}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                              const fallback = e.currentTarget.nextSibling
                              if (fallback) fallback.style.display = 'grid'
                            }}
                          />
                          <span className="coin-fallback">{base}</span>
                        </span>
                        <div>
                          <p className="coin-symbol">{t.pair.toUpperCase()}</p>
                          <p className="muted tiny">
                            Vol {formatNumber(t.vol / 1_000_000_000, 2)}B · Range{' '}
                            {formatNumber(t.rangePct, 2)}% · {base}/{quote}
                          </p>
                        </div>
                      </div>
                      <div className="coin-middle card">
                      <svg
                        className="sparkline"
                        viewBox="0 0 120 36"
                        preserveAspectRatio="none"
                      >
                        <polyline
                          points={sparklinePoints(series)}
                          className={sparkClass}
                          stroke={sparkClass === 'down' ? '#ef4444' : sparkClass === 'up' ? '#16a34a' : 'rgba(15, 23, 42, 0.45)'}
                          fill="none"
                        />
                      </svg>
                      </div>
                      <div className="coin-right card">
                        <p className="price">{formatIDR(t.last, t.last < 1 ? 6 : 0)}</p>
                        <p className={`change ${isUp ? 'up' : 'down'}`}>
                          {prev ? `${change >= 0 ? '+' : ''}${formatIDR(change, 0)}` : '—'}{' '}
                          {prev
                            ? `(${changePct >= 0 ? '+' : ''}${formatNumber(changePct, 2)}%)`
                            : ''}
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="coin-detail">
                        <div className="coin-detail-head">
                          <span className="muted tiny">
                            Realtime chart ({formatIntervalLabel(liveIntervalMs)})
                          </span>
                          <span className="muted tiny">
                            Update {snapshot || '—'}
                          </span>
                        </div>
                        {tvSymbol ? (
                          <div className="tv-embed">
                            <iframe
                              title={`${t.pair} TradingView`}
                              src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                                tvSymbol
                              )}&interval=${tvInterval}&theme=light&style=3&timezone=Asia%2FJakarta&withdateranges=1&hideideas=1&hidevolume=1&allow_symbol_change=0`}
                              loading="lazy"
                              frameBorder="0"
                              allow="fullscreen"
                            />
                          </div>
                        ) : (
                          <div className="tv-fallback">
                            <p className="muted tiny">
                              TradingView tidak tersedia untuk koin ini. Menampilkan
                              sparkline lokal.
                            </p>
                            <svg
                              className="sparkline large"
                              viewBox="0 0 320 96"
                              preserveAspectRatio="none"
                            >
                              <polyline
                                points={sparklinePoints(detailSeries, 320, 96, 6)}
                                className={sparkClass}
                                stroke={
                                  sparkClass === 'down'
                                    ? '#ef4444'
                                    : sparkClass === 'up'
                                      ? '#16a34a'
                                      : 'rgba(15, 23, 42, 0.45)'
                                }
                                fill="none"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="coin-row empty">
                {loading ? 'Memuat data...' : 'Tidak ada pair yang cocok.'}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>News sesuai Top Watchlist</h2>
          <p>Berita terbaru untuk koin yang masuk Top Watchlist.</p>
        </div>
        <div className="news-controls">
          <label>
            Jumlah berita
            <select
              value={newsLimit}
              onChange={(e) => {
                const next = Number(e.target.value)
                setNewsLimit(next)
                setNewsByCoin({})
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
          </label>
          <label>
            Urutkan
            <select
              value={newsSort}
              onChange={(e) => {
                const next = e.target.value
                setNewsSort(next)
                setNewsByCoin({})
              }}
            >
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
            </select>
          </label>
          <label>
            Sumber
            <select
              value={newsSourceFilter}
              onChange={(e) => {
                const next = e.target.value
                setNewsSourceFilter(next)
                setNewsByCoin({})
              }}
            >
              <option value="all">Semua</option>
              <option value="coindesk">{SOURCE_MAP.coindesk}</option>
              <option value="cointelegraph">{SOURCE_MAP.cointelegraph}</option>
            </select>
          </label>
          <label>
            Cakupan
            <select
              value={showAllNewsCoins ? 'all' : 'watchlist'}
              onChange={(e) => setShowAllNewsCoins(e.target.value === 'all')}
            >
              <option value="watchlist">Top Watchlist</option>
              <option value="all">Semua Top 10</option>
            </select>
          </label>
        </div>
        <div className="news-list">
          {newsCoins.length > 0 ? (
            newsCoins.map((coin) => {
              const isOpen = expandedCoin === coin.id
              const news = newsByCoin[coin.id]?.items || []
              const newsLang = newsByCoin[coin.id]?.lang
              const symbolLower = String(coin.symbol || '').toLowerCase()
              return (
                <div className="news-card" key={coin.id}>
                  <button
                    className="news-toggle"
                    onClick={() => {
                      const next = isOpen ? '' : coin.id
                      setExpandedCoin(next)
                      if (!isOpen) fetchNewsForCoin(coin)
                    }}
                  >
                    <span className="coin-title">
                      <span className="coin-badge">
                        <img
                          className="coin-logo"
                          src={getLogoForSymbol(symbolLower)}
                          alt={`${coin.symbol} logo`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            const fallback = e.currentTarget.nextSibling
                            if (fallback) fallback.style.display = 'grid'
                          }}
                        />
                        <span className="coin-fallback">{coin.symbol}</span>
                      </span>
                      {coin.name} ({coin.symbol})
                    </span>
                    <span>{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="news-body">
                      {newsLoading[coin.id] && (
                        <p className="muted">Memuat berita...</p>
                      )}
                      {newsError[coin.id] && (
                        <p className="error">{newsError[coin.id]}</p>
                      )}
                      {!newsLoading[coin.id] && !newsError[coin.id] && news.length === 0 && (
                        <p className="muted">Belum ada berita relevan.</p>
                      )}
                      {!newsLoading[coin.id] && !newsError[coin.id] && newsLang === 'en' && (
                        <p className="muted tiny">Berita diambil dari sumber internasional.</p>
                      )}
                      {news.length > 0 && (
                        <ul className="news-items">
                          {news.map((item) => (
                            <li key={item.url}>
                              <a href={item.url} target="_blank" rel="noreferrer">
                                {item.translated?.title || item.title}
                              </a>
                              <span className="news-meta">
                                {(() => {
                                  const name = String(item.source?.name || item.source || '')
                                  if (name.toLowerCase().includes('coindesk'))
                                    return SOURCE_MAP.coindesk
                                  if (name.toLowerCase().includes('cointelegraph'))
                                    return SOURCE_MAP.cointelegraph
                                  return name || 'Sumber'
                                })()}{' '}
                                ·{' '}
                                {item.publishedAt
                                  ? new Date(item.publishedAt).toLocaleString('id-ID')
                                  : '—'}
                              </span>
                              {item.translated?.title && (
                                <span className="news-meta">Terjemahan otomatis</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          ) : (
            <div className="news-card">
              <p className="muted">Belum ada coin yang cocok dengan Top Watchlist.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        <p>
          Data: Indodax public ticker. Gunakan manajemen risiko & jangan overtrade.
        </p>
      </footer>
    </div>
  )
}

export default App
