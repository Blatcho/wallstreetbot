const FTSE_CONSTITUENTS = [
  { symbol: 'AZN.L', name: 'AstraZeneca', alphaSymbol: 'LON:AZN' },
  { symbol: 'SHEL.L', name: 'Shell', alphaSymbol: 'LON:SHEL' },
  { symbol: 'HSBA.L', name: 'HSBC', alphaSymbol: 'LON:HSBA' },
  { symbol: 'ULVR.L', name: 'Unilever', alphaSymbol: 'LON:ULVR' },
  { symbol: 'BP.L', name: 'BP', alphaSymbol: 'LON:BP' },
  { symbol: 'DGE.L', name: 'Diageo', alphaSymbol: 'LON:DGE' },
  { symbol: 'GSK.L', name: 'GSK', alphaSymbol: 'LON:GSK' },
  { symbol: 'BATS.L', name: 'British American Tobacco', alphaSymbol: 'LON:BATS' },
  { symbol: 'BARC.L', name: 'Barclays', alphaSymbol: 'LON:BARC' },
  { symbol: 'RIO.L', name: 'Rio Tinto', alphaSymbol: 'LON:RIO' },
];

const elements = {
  heatmap: document.getElementById('heatmap'),
  alerts: document.getElementById('alerts'),
  newsList: document.getElementById('newsList'),
  selectedTicker: document.getElementById('selectedTicker'),
  lastUpdated: document.getElementById('lastUpdated'),
  startBtn: document.getElementById('startMonitoring'),
  alphaKey: document.getElementById('alphaKey'),
  refreshInterval: document.getElementById('refreshInterval'),
  changeThreshold: document.getElementById('changeThreshold'),
  sentimentThreshold: document.getElementById('sentimentThreshold'),
};

const state = {
  timer: null,
  alphaKey: '',
  quotes: new Map(),
  news: new Map(),
  chart: null,
  selected: null,
};

const formatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
});

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchQuote(ticker) {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'GLOBAL_QUOTE');
  url.searchParams.set('symbol', ticker.alphaSymbol);
  url.searchParams.set('apikey', state.alphaKey);

  const data = await fetchJson(url);
  const quote = data['Global Quote'];
  if (!quote || Object.keys(quote).length === 0) {
    throw new Error('No quote data');
  }

  return {
    symbol: ticker.symbol,
    name: ticker.name,
    price: Number(quote['05. price']),
    change: Number(quote['09. change']),
    changePercent: parseFloat(quote['10. change percent']),
    high: Number(quote['03. high']),
    low: Number(quote['04. low']),
    previousClose: Number(quote['08. previous close']),
    latestTradingDay: quote['07. latest trading day'],
  };
}

async function fetchNews() {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'NEWS_SENTIMENT');
  url.searchParams.set(
    'tickers',
    FTSE_CONSTITUENTS.map((t) => t.alphaSymbol).join(',')
  );
  url.searchParams.set('sort', 'LATEST');
  url.searchParams.set('apikey', state.alphaKey);
  const data = await fetchJson(url);
  const feed = data.feed || [];

  const byTicker = new Map();
  for (const ticker of FTSE_CONSTITUENTS) {
    byTicker.set(ticker.symbol, []);
  }

  for (const item of feed) {
    const tickers = item.ticker_sentiment || [];
    for (const sentiment of tickers) {
      const match = FTSE_CONSTITUENTS.find(
        (t) =>
          sentiment.ticker === t.alphaSymbol ||
          sentiment.ticker === t.alphaSymbol.replace('LON:', '')
      );
      if (match) {
        const existing = byTicker.get(match.symbol) ?? [];
        existing.push({
          title: item.title,
          url: item.url,
          summary: item.summary,
          sentimentScore: Number(sentiment.ticker_sentiment_score ?? 0),
          relevanceScore: Number(sentiment.relevance_score ?? 0),
          source: item.source,
          timePublished: item.time_published,
        });
        byTicker.set(match.symbol, existing);
      }
    }
  }

  return byTicker;
}

async function fetchIntraday(alphaSymbol) {
  const url = new URL('https://www.alphavantage.co/query');
  url.searchParams.set('function', 'TIME_SERIES_INTRADAY');
  url.searchParams.set('symbol', alphaSymbol);
  url.searchParams.set('interval', '5min');
  url.searchParams.set('outputsize', 'compact');
  url.searchParams.set('apikey', state.alphaKey);

  const data = await fetchJson(url);
  const series = data['Time Series (5min)'];
  if (!series) {
    throw new Error('No intraday data');
  }
  const entries = Object.entries(series)
    .map(([time, values]) => ({
      time,
      close: Number(values['4. close']),
    }))
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  return entries;
}

function renderHeatmap() {
  elements.heatmap.innerHTML = '';
  if (state.quotes.size === 0) {
    elements.heatmap.innerHTML = '<p class="empty">No data yet</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const quote of state.quotes.values()) {
    const card = document.createElement('div');
    const direction = quote.change >= 0 ? 'up' : 'down';
    card.className = `ticker-card ticker-card--${direction}`;
    card.innerHTML = `
      <span class="ticker-card__symbol">${quote.symbol}</span>
      <span class="ticker-card__price">${formatter.format(quote.price)}</span>
      <span class="ticker-card__change">${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%)</span>
    `;
    card.addEventListener('click', () => selectTicker(quote.symbol));
    fragment.appendChild(card);
  }
  elements.heatmap.appendChild(fragment);
}

function renderAlerts() {
  elements.alerts.innerHTML = '';
  if (state.quotes.size === 0) {
    elements.alerts.innerHTML = '<p class="empty">No signals yet</p>';
    return;
  }

  const changeThreshold = Number(elements.changeThreshold.value) || 0;
  const sentimentThreshold = Number(elements.sentimentThreshold.value) || 0;

  const alerts = [];
  for (const quote of state.quotes.values()) {
    const sentimentItems = state.news.get(quote.symbol) || [];
    const avgSentiment =
      sentimentItems.reduce((acc, item) => acc + item.sentimentScore, 0) /
      (sentimentItems.length || 1);

    const meetsChange = Math.abs(quote.changePercent) >= changeThreshold;
    const meetsSentiment = Math.abs(avgSentiment) >= sentimentThreshold;
    if (meetsChange || meetsSentiment) {
      alerts.push({ quote, avgSentiment, sentimentItems, meetsChange, meetsSentiment });
    }
  }

  if (alerts.length === 0) {
    elements.alerts.innerHTML = '<p class="empty">No opportunities detected under current thresholds.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const alert of alerts.sort((a, b) => Math.abs(b.quote.changePercent) - Math.abs(a.quote.changePercent))) {
    const alertEl = document.createElement('article');
    alertEl.className = 'alert';
    const changeBadge = alert.quote.change >= 0 ? 'badge--positive' : 'badge--negative';
    const changeLabel = `${alert.quote.change >= 0 ? 'Bullish' : 'Bearish'} move`;
    alertEl.innerHTML = `
      <div class="alert__header">
        <div>
          <h3>${alert.quote.name}</h3>
          <span class="meta">${alert.quote.symbol}</span>
        </div>
        <div class="alert__badges">
          <span class="badge ${changeBadge}">${changeLabel}</span>
          <span class="badge badge--sentiment">Sentiment ${alert.avgSentiment.toFixed(2)}</span>
        </div>
      </div>
      <div class="alert__body">
        Price change: ${alert.quote.change.toFixed(2)} (${alert.quote.changePercent.toFixed(2)}%)<br />
        Signals from ${alert.sentimentItems.length || 'no'} news articles.
      </div>
      <button class="alert__cta">View details</button>
    `;
    alertEl.querySelector('.alert__cta').addEventListener('click', () => selectTicker(alert.quote.symbol));
    fragment.appendChild(alertEl);
  }
  elements.alerts.appendChild(fragment);
}

function renderNews(ticker) {
  elements.newsList.innerHTML = '';
  const items = state.news.get(ticker) || [];
  if (items.length === 0) {
    elements.newsList.innerHTML = '<li class="empty">No recent news sentiment available.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items.slice(0, 6)) {
    const li = document.createElement('li');
    const time = item.timePublished
      ? new Date(
          item.timePublished.slice(0, 4) +
            '-' +
            item.timePublished.slice(4, 6) +
            '-' +
            item.timePublished.slice(6, 8) +
            'T' +
            item.timePublished.slice(9, 11) +
            ':' +
            item.timePublished.slice(11, 13)
        ).toLocaleString()
      : '';
    li.innerHTML = `
      <a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      <p class="news__meta">${item.source || 'Unknown source'} • ${time}</p>
      <p>${item.summary || ''}</p>
      <p class="news__meta">Sentiment score: ${item.sentimentScore.toFixed(2)} • Relevance: ${item.relevanceScore.toFixed(2)}</p>
    `;
    fragment.appendChild(li);
  }
  elements.newsList.appendChild(fragment);
}

function updateLastUpdated() {
  elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

function clearTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

async function selectTicker(symbol) {
  state.selected = symbol;
  const ticker = FTSE_CONSTITUENTS.find((t) => t.symbol === symbol);
  if (!ticker) {
    return;
  }
  elements.selectedTicker.textContent = `${ticker.symbol} • ${ticker.name}`;
  renderNews(symbol);

  try {
    const data = await fetchIntraday(ticker.alphaSymbol);
    renderChart(ticker.name, data);
  } catch (error) {
    console.error(error);
    renderChartError(error.message);
  }
}

function renderChart(name, data) {
  const ctx = document.getElementById('priceChart');
  const labels = data.map((point) => new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const prices = data.map((point) => point.close);

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${name} • 5 minute close`,
          data: prices,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          tension: 0.25,
          fill: true,
        },
      ],
    },
    options: {
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 6,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { callback: (value) => `£${value}` },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
      plugins: {
        legend: {
          labels: { color: '#e2e8f0' },
        },
      },
    },
  });
}

function renderChartError(message) {
  const ctx = document.getElementById('priceChart');
  const context = ctx.getContext('2d');
  context.save();
  context.clearRect(0, 0, ctx.width, ctx.height);
  context.fillStyle = '#e2e8f0';
  context.font = '14px Inter, system-ui, sans-serif';
  context.fillText('Unable to load chart data.', 12, 24);
  context.fillText(message, 12, 44);
  context.restore();
}

async function refreshData() {
  if (!state.alphaKey) {
    return;
  }
  try {
    const quotes = await Promise.allSettled(
      FTSE_CONSTITUENTS.map((ticker) => fetchQuote(ticker))
    );

    for (const result of quotes) {
      if (result.status === 'fulfilled') {
        state.quotes.set(result.value.symbol, result.value);
      }
    }

    const news = await fetchNews();
    state.news = news;

    renderHeatmap();
    renderAlerts();
    if (state.selected) {
      renderNews(state.selected);
    }
    updateLastUpdated();
  } catch (error) {
    console.error('Refresh error', error);
  }
}

function startMonitoring() {
  state.alphaKey = elements.alphaKey.value.trim();
  if (!state.alphaKey) {
    alert('Please provide an Alpha Vantage API key to start monitoring.');
    return;
  }

  elements.startBtn.textContent = 'Monitoring…';
  elements.startBtn.disabled = true;
  elements.alphaKey.disabled = true;

  refreshData();
  const interval = Number(elements.refreshInterval.value) * 1000;
  clearTimer();
  state.timer = setInterval(refreshData, interval);
}

elements.startBtn.addEventListener('click', startMonitoring);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimer();
  } else if (state.alphaKey) {
    refreshData();
    const interval = Number(elements.refreshInterval.value) * 1000;
    clearTimer();
    state.timer = setInterval(refreshData, interval);
  }
});

window.addEventListener('beforeunload', () => clearTimer());
