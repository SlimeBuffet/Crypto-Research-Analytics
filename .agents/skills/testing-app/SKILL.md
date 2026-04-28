# Testing: Crypto Research Analytics

## Overview
This is a static HTML/JS app with no backend or build system. All pages run directly in the browser from the filesystem.

## Pages
- `index.html` — Landing page / hub
- `crypto-scanner.html` — Real-time scanner (Binance API)
- `crypto-analyzer.html` — Deep analyzer (curated picks, static data)

## How to Test Locally
1. Open any HTML file directly in Chrome via `google-chrome file:///path/to/file.html`
2. No server, no dependencies, no build step required
3. Use browser DevTools (F12) to monitor Console for JS errors and Network tab for API calls

## Key Testing Scenarios

### Scanner (`crypto-scanner.html`)
- Click "Start Scanning for 10x Gems" to run a full scan
- Scan fetches data from Binance API (`data-api.binance.vision`)
- Typical scan takes 10-20 seconds, processes 150-200+ coins
- Verify: progress bar reaches 100%, coin cards render with price/volume/sector data
- Check Network tab: all requests should go to `data-api.binance.vision` only
- Check Console: should show "Crypto 10x Scanner ready!" with no JS errors
- Note: Market Cap may show "N/A" if no external market cap data source is configured

### Analyzer (`crypto-analyzer.html`)
- Contains static curated picks — no API calls needed to display data
- Verify: coin cards display with market cap, volume, FDV, sector tags

### Common UI Features (all pages)
- Dark/light mode toggle (moon/sun icon in top nav)
- Theme persists in localStorage
- Export CSV button
- Watchlist (scanner page)

## Lint / Build / Test Commands
None — this is a pure static HTML/JS project with no build tools or test framework.

## Environment Notes
- No API keys required (Binance API is public)
- No npm/pip/etc dependencies
- wmctrl may need to be installed for maximizing browser window during testing: `sudo apt-get install -y wmctrl`

## Devin Secrets Needed
None required.
