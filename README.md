# Crypto 10x Potential Scanner

An automated cryptocurrency screening tool that scans Binance-listed assets to identify high-upside potential candidates (~10x) based on data-driven metrics, tokenomics, and sector trends.

## ⚠️ Disclaimer

**This is NOT financial advice.** 
- Cryptocurrency investments are extremely high-risk.
- This tool provides data analysis only; it does not guarantee profits.
- Always do your own research (DYOR) before making any investment decisions.
- Never invest money you cannot afford to lose.
- The "10x" potential is a hypothetical scenario based on market asymmetry, not a promise.

## 🚀 Features

- **Automated Binance Scanning**: Fetches live ticker data from Binance via CoinGecko API.
- **Smart Filtering**: Filters coins based on Market Cap, Volume, FDV/MC ratio, and Price Momentum.
- **Sector Analysis**: Categorizes coins into trending sectors (AI, DeFi, RWA, Gaming, etc.).
- **Risk Assessment**: Highlights key risks like dilution, competition, and token unlocks.
- **Interactive UI**: Real-time scanning logs, dynamic filtering, and responsive card layout.
- **Scoring System**: Ranks coins based on Liquidity, Tokenomics, Fundamentals, and Momentum.

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Tailwind-style custom CSS), Vanilla JavaScript.
- **Data Source**: CoinGecko API (Pro).
- **No Backend Required**: Runs entirely in the browser.

## 📋 Prerequisites

1. A modern web browser (Chrome, Firefox, Edge, Safari).
2. A valid **CoinGecko API Key** (Pro tier recommended for higher rate limits).
3. Internet connection.

## 🔧 Setup & Installation

### 1. Clone or Download
Download the `crypto-scanner.html` file to your local machine.

### 2. Configure API Key
Open `crypto-scanner.html` in a text editor (e.g., VS Code, Notepad++).
Locate the configuration section in the `<script>` tag:

```javascript
const CONFIG = {
    COINGECKO_API_KEY: 'YOUR_COINGECKO_API_KEY_HERE', 
    // ... other config
};
```

Replace `'YOUR_COINGECKO_API_KEY_HERE'` with your actual CoinGecko API key.
*Alternatively, if running in a secure environment that supports environment variables injection, you can leave it as `process.env.COINGECKO_API_KEY`.*

**Security Note**: Since this is a client-side tool, your API key is visible in the source code. Do not host this on a public server without backend protection. For local use, it is safe.

### 3. Run the Tool
Simply double-click `crypto-scanner.html` to open it in your default browser. No server setup (Node.js/Python) is required.

## 📖 How to Use

1. **Launch**: Open the file in your browser.
2. **Start Scanning**: Click the **"🚀 Start Scanning Binance"** button.
   - The tool will fetch the list of Binance tickers.
   - It will then iterate through USDT pairs to gather market data.
   - *Note: This may take 10-30 seconds depending on API rate limits.*
3. **Analyze Results**:
   - **Score**: Higher scores indicate better alignment with "10x" criteria.
   - **Metrics**: Check Market Cap, Volume, FDV/MC ratio (lower is often better for upside), and Price Change.
   - **Risks**: Read the specific risks listed for each coin.
4. **Filter & Sort**:
   - Use the **Search Bar** to find specific coins.
   - Use **Sector Filter** to focus on specific narratives (e.g., AI, DeFi).
   - **Sort By**: Rank, Market Cap, Volume, or Score.
5. **Refresh**: Click "Start Scanning" again to get the latest data.

## 🧠 Screening Logic

The scanner prioritizes coins that meet the following criteria:
- **Binance Listed**: Must have an active USDT pair on Binance.
- **Market Cap**: Generally Low-to-Mid cap ($10M - $500M) for higher multiplier potential.
- **Liquidity**: Sufficient 24h volume to ensure tradability.
- **Tokenomics**: Favorable FDV to Market Cap ratio (avoids massive future dilution).
- **Momentum**: Positive price action or strong sector alignment.
- **Fundamentals**: Active development and community signals (where data is available).

## 📁 File Structure

```
/workspace
├── crypto-scanner.html   # Main application (UI + Logic)
└── README.md             # This file
```

## ⚠️ Limitations & Risks

- **API Rate Limits**: Free CoinGecko API keys have strict rate limits. If scanning fails, wait a minute or upgrade to a Pro plan.
- **Data Latency**: Data is not real-time tick-by-tick; it reflects the latest snapshot from CoinGecko.
- **False Positives**: Automated scoring cannot replace deep fundamental due diligence.
- **Market Volatility**: Crypto markets can change rapidly; data may become outdated quickly.

## 🤝 Contributing

Feel free to fork this repository and improve the screening logic, UI, or add new features.

## 📄 License

MIT License - Free for personal and educational use.

---

*Built for educational purposes to demonstrate data-driven crypto analysis.*
