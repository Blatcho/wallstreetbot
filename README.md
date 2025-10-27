# FTSE 100 Opportunity Monitor

A lightweight single-page web dashboard for tracking FTSE 100 constituents, monitoring news-driven sentiment and surfacing potential trading opportunities.

## Features

- Configurable polling of Alpha Vantage for live FTSE 100 quotes.
- Heatmap view showing price performance across major constituents.
- Automated opportunity alerts based on configurable price change and sentiment thresholds.
- Intraday price chart powered by Chart.js for the selected company.
- News & sentiment feed sourced from Alpha Vantage's `NEWS_SENTIMENT` endpoint.

## Getting started

1. [Create a free Alpha Vantage API key](https://www.alphavantage.co/support/#api-key).
2. Open `index.html` in your browser.
3. Paste your API key, adjust the refresh cadence and thresholds if desired, then click **Start monitoring**.

> **Note**
> Alpha Vantage enforces strict per-minute rate limits. The default refresh cadence of five minutes keeps request volume within the free tier. If you lower the refresh interval or track more tickers you may need a paid subscription.

## Development

The application is a static site consisting of vanilla HTML, CSS and JavaScript. No build step is required—edit the files directly and reload the browser to see your changes.
