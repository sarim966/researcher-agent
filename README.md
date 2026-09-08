# The 1% Researcher Agent 🔍
> An AI-powered crypto research agent built on Binance Agent OS | finds early alpha BEFORE Crypto Twitter discovers it.
Built for the **Binance Agent OS Hackathon** by [@arkilus78](https://x.com/arkilus78)
---
## What It Does
The 1% Researcher Agent connects to Binance market data to help crypto researchers find early signals, analyze tokens with real TA, and generate ready-to-post X threads — all from a single terminal command.
### Commands
| Command | What it does |
|---|---|
| `screen` | Screens top 8 pairs by volume and price change |
| `dips` | Scans 80+ Binance pairs for low RSI + rising volume signals |
| `ta SOL` | Full TA report for any token (RSI, MACD, support/resistance) + X thread |
| `post BTC` | Generates a single high-engagement X post with live data |
| `balance` | Tests Binance connectivity |
---
## Features
- **Momentum Dip Scanner** — scans 80+ USDT pairs, calculates RSI and volume trend, surfaces tokens with RSI < 38 and rising volume (early accumulation signals)
- **Live TA Analysis** — calculates RSI (1h + 4h), MACD, volume trend, support and resistance from real Binance candle data
- **Research Scorer** — scores any token on team (7), tokenomics (7), narrative (6) out of 20
- **X Thread Generator** — writes ready-to-post threads in @arkilus78 brand voice (lowercase, hooks, questions)
- **Binance Agent OS** — built on Binance MCP infrastructure
---
## Setup
### 1. Clone the repo
```bash
git clone https://github.com/sarim966/researcher-agent.git
cd researcher-agent
```
### 2. Install dependencies
```bash
npm install
```
### 3. Create `.env` file

First Create your config file

Run this in your terminal:

```powershell
notepad .env
```

A blank notepad will open. Paste this inside, replace `your_api_key_here` with your key, then save and close:

```
AGENTROUTER_API_KEY=your_api_key_here
AGENTROUTER_BASE_URL=https://agentrouter.org/v1
MODEL=openai/gpt-oss-120b
```

### 4. Run the agent
```bash
node agent.js
```
---
## Example Output

**`dips` command — Momentum Dip Scanner:**

| Symbol | RSI | Vol Trend | Price | 24h Change |
|--------|-----|-----------|-------|------------|
| DCRUSDT | 35.16 | +45% | $15.65 | -2.188% |
| BTCUSDT | 36.8 | +186.3% | $78522.01 | -1.206% |
| HBARUSDT | 37.69 | +34.9% | $0.08009 | -0.645% |

**`ta SOL` command — Full TA Report:**

| Indicator | Value | Signal |
|-----------|-------|--------|
| Price | $104.93 | — |
| 24h Change | -1.80% | — |
| RSI (1h) | 43.2 | approaching oversold |
| RSI (4h) | 51.8 | neutral |
| MACD (1h) | -0.42 | bearish momentum |
| Volume | +12% | rising |
| Support | $101.20 | — |
| Resistance | $108.50 | — |
---
## Built With
- [Binance Agent OS](https://www.binance.com/en/agent-os) — MCP infrastructure
- [Binance Public API](https://developers.binance.com) — live market data
- Node.js — runtime
- OpenAI-compatible SDK — AI layer
---
## Author
**Sarim Khan** — Web3 researcher and content creator  
X: [@arkilus78](https://x.com/arkilus78)  
Community: [Arcc Den](https://discord.gg/arccden)
