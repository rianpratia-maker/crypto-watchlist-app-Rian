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

const DEFAULT_RISK = {
  modal: 10_000_000,
  dailyLossPct: 2,
  riskPerPosPct: 0.5,
  stopMajorPct: 3,
  stopAltPct: 6
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
  const [topCoins, setTopCoins] = useState([])
  const [expandedCoin, setExpandedCoin] = useState('')
  const [newsByCoin, setNewsByCoin] = useState({})
  const [newsLoading, setNewsLoading] = useState({})
  const [newsError, setNewsError] = useState({})
  const [newsLimit, setNewsLimit] = useState(5)
  const [newsSort, setNewsSort] = useState('newest')
  const [newsSourceFilter, setNewsSourceFilter] = useState('all')

  const intervalMs = 2 * 60 * 60 * 1000
  const newsCacheMs = 30 * 60 * 1000
  const gnewsKey = import.meta.env.VITE_GNEWS_API_KEY

  const fetchTickers = async () => {
    setLoading(true)
    setError('')
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
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickers()
  }, [])

  useEffect(() => {
    const id = setInterval(fetchTickers, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  useEffect(() => {
    const loadTopCoins = async () => {
      try {
        const res = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false'
        )
        if (!res.ok) throw new Error('Gagal memuat Top 10 coins')
        const data = await res.json()
        const coins = (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          symbol: String(c.symbol || '').toUpperCase()
        }))
        setTopCoins(coins)
      } catch (err) {
        setTopCoins([])
      }
    }
    loadTopCoins()
  }, [])

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

  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = tickers.filter((t) => !STABLE_PAIRS.has(t.pair))
    if (!q) return list
    return list.filter((t) => t.pair.includes(q))
  }, [tickers, search])

  const dailyLoss = (risk.modal * risk.dailyLossPct) / 100
  const riskPerPos = (risk.modal * risk.riskPerPosPct) / 100
  const nextRefresh = lastUpdatedMs ? new Date(lastUpdatedMs + intervalMs) : null

  const fetchNewsForCoin = async (coin) => {
    if (!gnewsKey) {
      setNewsError((prev) => ({
        ...prev,
        [coin.id]: 'API key GNews belum diatur.'
      }))
      return
    }
    const cached = newsByCoin[coin.id]
    if (cached && Date.now() - cached.fetchedAt < newsCacheMs) return
    setNewsLoading((prev) => ({ ...prev, [coin.id]: true }))
    setNewsError((prev) => ({ ...prev, [coin.id]: '' }))
    try {
      const q = `${coin.name} OR ${coin.symbol} crypto`
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
        q
      )}&lang=id&max=${newsLimit}&token=${gnewsKey}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Gagal memuat news')
      const data = await res.json()
      const keywordRegex = /\b(price|harga|etf|price action|market|naik|turun|rally|dump|pump)\b/i
      const sourceMap = {
        coindesk: 'CoinDesk',
        cnbcindonesia: 'CNBC Indonesia'
      }
      const sourceKey = newsSourceFilter
      const filtered = (data.articles || []).filter((item) => {
        const haystack = `${item.title || ''} ${item.description || ''}`
        if (!keywordRegex.test(haystack)) return false
        if (sourceKey === 'all') return true
        const sourceName = String(item.source?.name || '').toLowerCase()
        if (sourceKey === 'coindesk') return sourceName.includes('coindesk')
        if (sourceKey === 'cnbcindonesia')
          return sourceName.includes('cnbc indonesia') || sourceName.includes('cnbcindonesia')
        return true
      })
      const sorted = filtered.sort((a, b) => {
        const ad = new Date(a.publishedAt || 0).getTime()
        const bd = new Date(b.publishedAt || 0).getTime()
        return newsSort === 'newest' ? bd - ad : ad - bd
      })
      setNewsByCoin((prev) => ({
        ...prev,
        [coin.id]: {
          fetchedAt: Date.now(),
          items: sorted.slice(0, newsLimit)
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
                  <p className="value">{t.pair}</p>
                </div>
                <div className="reason">
                  <span>Vol {formatNumber(t.vol / 1_000_000_000, 2)}B</span>
                  <span>Range {formatNumber(t.rangePct, 2)}%</span>
                </div>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th>Last (IDR)</th>
                <th>Vol IDR</th>
                <th>Range %</th>
                <th>Tag</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.length > 0 ? (
                watchlist.map((t) => (
                  <tr key={t.pair}>
                    <td className="pair">{t.pair}</td>
                    <td>{formatIDR(t.last, t.last < 1 ? 6 : 0)}</td>
                    <td>{formatNumber(t.vol / 1_000_000_000, 2)}B</td>
                    <td>{formatNumber(t.rangePct, 2)}%</td>
                    <td>
                      <span
                        className={`chip ${t.rangePct > 15 ? 'hot' : 'cool'}`}
                      >
                        {t.rangePct > 15 ? 'High Vol' : 'Liquid'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    {loading ? 'Memuat data...' : 'Belum ada data watchlist.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Last</th>
                  <th>Vol IDR</th>
                  <th>Range %</th>
                </tr>
              </thead>
              <tbody>
                {filteredTable.length > 0 ? (
                  filteredTable.map((t) => (
                    <tr
                      key={t.pair}
                      className={watchlistPairs.has(t.pair) ? 'highlight' : ''}
                    >
                      <td className="pair">{t.pair}</td>
                      <td>{formatIDR(t.last, t.last < 1 ? 6 : 0)}</td>
                      <td>{formatNumber(t.vol / 1_000_000_000, 2)}B</td>
                      <td>{formatNumber(t.rangePct, 2)}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      {loading ? 'Memuat data...' : 'Tidak ada pair yang cocok.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>News per Coin (Top 10)</h2>
          <p>Berita terbaru per koin (GNews, bahasa Indonesia).</p>
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
              <option value="coindesk">{sourceMap.coindesk}</option>
              <option value="cnbcindonesia">{sourceMap.cnbcindonesia}</option>
            </select>
          </label>
        </div>
        <div className="news-list">
          {topCoins.length > 0 ? (
            topCoins.map((coin) => {
              const isOpen = expandedCoin === coin.id
              const news = newsByCoin[coin.id]?.items || []
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
                    <span>
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
                      {news.length > 0 && (
                        <ul className="news-items">
                          {news.map((item) => (
                            <li key={item.url}>
                              <a href={item.url} target="_blank" rel="noreferrer">
                                {item.title}
                              </a>
                              <span className="news-meta">
                                {(() => {
                                  const name = String(item.source?.name || '')
                                  if (name.toLowerCase().includes('coindesk'))
                                    return sourceMap.coindesk
                                  if (
                                    name.toLowerCase().includes('cnbc indonesia') ||
                                    name.toLowerCase().includes('cnbcindonesia')
                                  )
                                    return sourceMap.cnbcindonesia
                                  return name || 'Sumber'
                                })()}{' '}
                                ·{' '}
                                {item.publishedAt
                                  ? new Date(item.publishedAt).toLocaleString('id-ID')
                                  : '—'}
                              </span>
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
              <p className="muted">Memuat daftar Top 10 coin...</p>
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
