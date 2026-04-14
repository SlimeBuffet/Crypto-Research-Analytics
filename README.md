# Crypto 10x Potential Scanner

A powerful web-based tool that automatically scans Binance-listed cryptocurrencies to identify high-potential assets with ~10x upside potential in the next market cycle.

## ⚠️ Disclaimer

**This is NOT financial advice.** Cryptocurrency investments are extremely high-risk. This tool is for educational and research purposes only. Always do your own research (DYOR) and never invest more than you can afford to lose.

- Past performance does not guarantee future results
- No guarantee of 10x returns - this is probabilistic analysis only
- Market conditions change rapidly - data may not be real-time
- Consult with a qualified financial advisor before making investment decisions

## Features

### 🔍 Automated Scanning
- Scans all Binance-listed coins with active USDT trading pairs
- Real-time data fetching from CoinGecko Pro API
- Automatic filtering based on multiple criteria
- Progress tracking with detailed activity logs

### 📊 Comprehensive Analysis
Each coin is evaluated on:
- **Market Cap**: Low-to-mid cap focus for maximum upside potential
- **Liquidity**: 24h volume, volume/market cap ratio
- **Tokenomics**: FDV/MC ratio, supply inflation risks
- **Fundamentals**: Developer activity, community engagement
- **Sector Fit**: Alignment with trending narratives (AI, DeFi, L2, DePIN, RWA, etc.)
- **Momentum**: Price performance (24h, 7d, 30d)

### 🎯 Scoring System
Transparent 0-25 scoring based on:
- Liquidity Score (0-5)
- Tokenomics Score (0-5)
- Fundamental Score (0-5)
- Trend/Sector Fit (0-5)
- Risk Assessment (0-5, inverted)

### 🛠️ Interactive UI
- Real-time filtering by sector
- Market cap range selection
- Multiple sorting options (score, market cap, volume, etc.)
- Search functionality
- Responsive design for mobile and desktop
- Beautiful gradient cards with detailed metrics

## Installation

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- No server or backend required - runs entirely in browser

### Setup Steps

1. **Download the file**
   ```bash
   # Clone or download crypto-scanner.html to your local machine
   ```

2. **Open in Browser**
   - Right-click `crypto-scanner.html`
   - Select "Open with" → Your preferred browser
   - Or drag and drop the file into your browser window

3. **Start Scanning**
   - Click the "🚀 Start Scanning Binance" button
   - Wait for the scan to complete (10-30 seconds)
   - Review the results

## Usage Guide

### Step 1: Initialize Scan
Click the **"🚀 Start Scanning Binance"** button to begin the automated scanning process. The tool will:
- Fetch all Binance tickers from CoinGecko
- Filter for active USDT pairs
- Collect market data for each coin
- Apply screening criteria
- Calculate scores and rank results

### Step 2: Monitor Progress
Watch the progress bar and activity log to see:
- Number of coins processed
- Current scanning phase
- Any API rate limiting warnings
- Completion status

### Step 3: Analyze Results
Each coin card displays:
- **Header**: Name, ticker, rank, overall score
- **Metrics Grid**: Market cap, FDV, volume, FDV/MC ratio
- **Price Movement**: 24h, 7d, 30d changes (color-coded)
- **Key Upside Reasons**: 3 data-driven catalysts
- **Main Risks**: 2-3 specific risk factors
- **Binance Pair**: Confirmed trading pair on Binance
- **Sector**: Primary narrative/sector classification

### Step 4: Filter & Sort
Use the control panel to:
- **Search**: Type coin name or ticker
- **Filter by Sector**: Select specific narratives (AI, DeFi, Gaming, etc.)
- **Market Cap Range**: Set min/max market cap filters
- **Sort By**: 
  - Overall Score (default)
  - Market Cap (low to high)
  - Volume (high to low)
  - 24h Change
  - 7d Change
  - 30d Change
  - FDV/MC Ratio

### Step 5: Deep Dive Research
Use this tool as a starting point for further research:
- Visit official project websites
- Read whitepapers and documentation
- Check social media and community channels
- Analyze on-chain metrics
- Review token unlock schedules
- Monitor development activity on GitHub

## Screening Criteria

### Primary Filters
1. **Binance Listed**: Must have active USDT trading pair on Binance
2. **Market Cap**: $10M - $500M (sweet spot for 10x potential)
3. **Liquidity**: Minimum $500K daily volume
4. **FDV/MC Ratio**: < 2.0 (limited dilution risk)

### Scoring Factors

#### Liquidity Score (0-5)
- Volume 24h > $10M: 5 points
- Volume 24h > $5M: 4 points
- Volume 24h > $1M: 3 points
- Volume 24h > $500K: 2 points
- Volume/MC ratio > 5%: +1 bonus

#### Tokenomics Score (0-5)
- FDV/MC < 1.2: 5 points
- FDV/MC < 1.5: 4 points
- FDV/MC < 2.0: 3 points
- Circulating supply > 50%: +1 bonus
- Clear max supply: +1 bonus

#### Fundamental Score (0-5)
- Active developer community: 0-2 points
- Strong social presence: 0-2 points
- Clear use case/product: 0-1 points

#### Trend/Sector Fit (0-5)
Hot sectors (2024-2025):
- AI & Machine Learning
- Liquid Staking & Restaking (LST/LRT)
- Modular Blockchain Infrastructure
- Layer 2 Scaling Solutions
- DePIN (Decentralized Physical Infrastructure)
- RWA (Real World Assets)
- Gaming & Metaverse
- Interoperability & Cross-chain

#### Risk Score (0-5, inverted)
Lower risk = higher score:
- No major unlocks in 6 months: +2
- Decent decentralization: +1
- Established project (>1 year): +1
- No major red flags: +1

## Target Sectors

### 1. AI x Crypto
Projects combining artificial intelligence with blockchain technology.
- **Why Hot**: AI boom, ChatGPT effect, institutional interest
- **Examples**: Decentralized compute, AI agents, data markets

### 2. Liquid Staking & Restaking
Protocols enabling staked assets to remain liquid.
- **Why Hot**: Ethereum ETF, yield optimization, capital efficiency
- **Examples**: LST protocols, LRT platforms, restaking primitives

### 3. Modular & Layer 2
Scalability solutions and specialized blockchain layers.
- **Why Hot**: Ethereum scaling needs, app-specific chains
- **Examples**: Rollups, data availability, modular stacks

### 4. DePIN
Decentralized infrastructure for physical resources.
- **Why Hot**: Real-world utility, network effects, token incentives
- **Examples**: Storage, compute, wireless, sensors

### 5. RWA
Tokenization of real-world assets on blockchain.
- **Why Hot**: Institutional adoption, regulatory clarity, massive TAM
- **Examples**: Treasury bills, real estate, commodities, credit

## Technical Details

### API Configuration
- **Provider**: CoinGecko Pro API
- **Base URL**: `https://pro-api.coingecko.com/api/v3`
- **Auth Header**: `x-cg-pro-api-key`
- **Rate Limit**: 250+ calls/minute (Pro plan)
- **Retry Logic**: Exponential backoff on 429 errors

### Data Endpoints Used
```
GET /exchanges/binance/tickers
GET /coins/markets
GET /coins/{id}
GET /search/trending
```

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance
- Typical scan time: 10-30 seconds
- Coins processed: 100-300+ per scan
- API calls per scan: ~50-100 (optimized with batching)

## File Structure

```
/workspace/
├── crypto-scanner.html    # Main application (single-file HTML/CSS/JS)
└── README.md             # This documentation file
```

## Limitations

1. **API Rate Limits**: Free tier has call limits; heavy usage may trigger throttling
2. **Data Freshness**: Not real-time; typical delay 1-5 minutes
3. **Coverage**: Only coins listed on CoinGecko with Binance pairs
4. **No Historical Backtesting**: Forward-looking analysis only
5. **Browser-Based**: Requires JavaScript enabled; no offline mode

## Troubleshooting

### "Failed to fetch" Error
- Check internet connection
- Verify API key is valid
- Try refreshing the page

### Slow Performance
- Close other browser tabs
- Reduce market cap range filter
- Wait for rate limit reset

### No Results Found
- Broaden market cap range
- Remove sector filters
- Ensure scan completed successfully

### API Rate Limited
- Wait 1-2 minutes before rescanning
- The tool automatically handles retries with exponential backoff

## Security Notes

- API key is embedded in client-side code (acceptable for personal use)
- No data is sent to third-party servers except CoinGecko API
- No cookies or local storage used
- Open-source and transparent - inspect code freely

## Future Enhancements (Potential)

- [ ] Export results to CSV/Excel
- [ ] Portfolio tracking integration
- [ ] Price alerts and notifications
- [ ] Historical performance backtesting
- [ ] Custom scoring weights
- [ ] Multi-exchange support (Coinbase, Kraken, etc.)
- [ ] Dark mode toggle
- [ ] Saved watchlists

## Resources

- [CoinGecko API Documentation](https://docs.coingecko.com/)
- [CoinGecko Pricing](https://www.coingecko.com/en/api/pricing)
- [Binance Markets](https://www.binance.com/en/markets)
- [CoinGecko Dashboard](https://www.coingecko.com/en/developers/dashboard)

## Contributing

This is a personal research tool. Feel free to fork, modify, and improve for your own use.

## License

MIT License - Free for personal and educational use.

---

**Remember**: Cryptocurrency markets are highly volatile and speculative. This tool provides data-driven insights but cannot predict the future. Always conduct thorough research and consider your risk tolerance before making any investment decisions.

**Not Financial Advice** | **Do Your Own Research** | **Invest Responsibly**
