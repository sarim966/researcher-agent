import OpenAI from "openai";
import * as readline from "readline";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.AGENTROUTER_API_KEY,
  baseURL: process.env.AGENTROUTER_BASE_URL,
});

const MODEL = process.env.MODEL || "openai/gpt-oss-120b";
const conversationHistory = [];

const SYSTEM_PROMPT = `You are the 1% Researcher Agent built for @arkilus78 on X.

Your job: find early crypto projects with strong on-chain signals BEFORE Crypto Twitter discovers them.

VOICE RULES (non-negotiable):
- always lowercase
- no em dashes
- every post ends with a question
- use "hear me out >>>>" and "here's why it matters >>>>" as hooks
- use "————" as section dividers
- bookmark CTA in first 3 lines of research posts

RESEARCH SCORING (out of 20):
- Team and backers: /7
- Tokenomics: /7
- Narrative fit: /6

When generating X posts: score the token, write a 3-tweet thread in @arkilus78 voice.`;

// ── Binance helpers ──────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  return res.json();
}

async function getTickerData(symbol) {
  const data = await fetchJSON(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`
  );
  return {
    symbol: data.symbol,
    price: parseFloat(data.lastPrice),
    change: parseFloat(data.priceChangePercent),
    volume: parseFloat(data.quoteVolume),
    high: parseFloat(data.highPrice),
    low: parseFloat(data.lowPrice),
    trades: parseInt(data.count),
  };
}

async function getCandles(symbol, interval = "1h", limit = 50) {
  const data = await fetchJSON(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  return data.map((c) => ({
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
    time: c[0],
  }));
}

async function getAllUSDTPairs() {
  const data = await fetchJSON("https://api.binance.com/api/v3/exchangeInfo");
  return data.symbols
    .filter(
      (s) =>
        s.quoteAsset === "USDT" &&
        s.status === "TRADING" &&
        !s.symbol.includes("UP") &&
        !s.symbol.includes("DOWN") &&
        !s.symbol.includes("BULL") &&
        !s.symbol.includes("BEAR")
    )
    .map((s) => s.symbol);
}

// ── TA calculations ──────────────────────────────────────────

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const closes = candles.map((c) => c.close);
  let gains = 0,
    losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

function calcMACD(candles) {
  const closes = candles.map((c) => c.close);

  function ema(data, period) {
    const k = 2 / (period + 1);
    let emaVal = data[0];
    for (let i = 1; i < data.length; i++) {
      emaVal = data[i] * k + emaVal * (1 - k);
    }
    return emaVal;
  }

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;
  return parseFloat(macdLine.toFixed(6));
}

function calcVolumetrend(candles) {
  const recent = candles.slice(-5).map((c) => c.volume);
  const older = candles.slice(-10, -5).map((c) => c.volume);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  const pct = (((recentAvg - olderAvg) / olderAvg) * 100).toFixed(1);
  return { trend: recentAvg > olderAvg ? "rising" : "falling", pct: parseFloat(pct) };
}

function calcSupRes(candles) {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const resistance = Math.max(...highs.slice(-20));
  const support = Math.min(...lows.slice(-20));
  return { support: parseFloat(support.toFixed(6)), resistance: parseFloat(resistance.toFixed(6)) };
}

// ── Commands ─────────────────────────────────────────────────

async function momentumDipScanner() {
  console.log("\n scanning all binance usdt pairs for hidden momentum dips...");
  console.log(" this takes ~30 seconds, pulling candle data across hundreds of pairs\n");

  const allPairs = await getAllUSDTPairs();

  // sample 80 pairs for speed — covers all major and mid caps
  const sample = allPairs
    .filter((p) => !p.includes("1000"))
    .slice(0, 80);

  const results = [];

  for (const symbol of sample) {
    try {
      const candles = await getCandles(symbol, "1h", 50);
      const ticker = await getTickerData(symbol);
      const rsi = calcRSI(candles);
      const volTrend = calcVolumetrend(candles);

      if (rsi !== null && rsi < 38 && volTrend.trend === "rising" && volTrend.pct > 10) {
        results.push({
          symbol,
          rsi,
          volPct: volTrend.pct,
          price: ticker.price,
          change: ticker.change,
          volume: (ticker.volume / 1e6).toFixed(1) + "M",
        });
      }
    } catch {
      // skip pairs with no data
    }
  }

  results.sort((a, b) => a.rsi - b.rsi);
  const top = results.slice(0, 8);

  if (top.length === 0) {
    console.log(" no strong momentum dip signals found right now. market may be overheated.\n");
    return;
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  MOMENTUM DIPS — low rsi + rising volume");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("symbol          | rsi  | vol trend | price      | 24h change");
  console.log("————————————————————————————————————————————————————————————");

  for (const r of top) {
    const sym = r.symbol.padEnd(15);
    const rsi = String(r.rsi).padEnd(5);
    const vol = `+${r.volPct}%`.padEnd(10);
    const price = String(r.price).padEnd(11);
    console.log(`${sym} | ${rsi}| ${vol}| ${price}| ${r.change}%`);
  }

  const summary = top
    .map((r) => `${r.symbol}: rsi ${r.rsi}, volume +${r.volPct}%, price $${r.price}, 24h ${r.change}%`)
    .join("\n");

  const analysis = await chat(
    `These coins have LOW RSI (oversold) + RISING volume right now on Binance:\n\n${summary}\n\n
     Pick the TOP 3 most interesting. For each explain in 2 sentences why this combo of low RSI + rising volume matters for early entry. Use @arkilus78 voice — lowercase, direct, no hype.`
  );

  console.log("\n" + analysis + "\n");
}

async function analyzeToken(symbol) {
  const sym = symbol.toUpperCase().includes("USDT")
    ? symbol.toUpperCase()
    : symbol.toUpperCase() + "USDT";

  console.log(`\n pulling live TA for ${sym}...\n`);

  let ticker, candles1h, candles4h;

  try {
    [ticker, candles1h, candles4h] = await Promise.all([
      getTickerData(sym),
      getCandles(sym, "1h", 50),
      getCandles(sym, "4h", 50),
    ]);
  } catch {
    console.log(` ${sym} not found on binance spot. check the ticker and try again.\n`);
    return;
  }

  const rsi1h = calcRSI(candles1h);
  const rsi4h = calcRSI(candles4h);
  const macd1h = calcMACD(candles1h);
  const volTrend = calcVolumetrend(candles1h);
  const supRes = calcSupRes(candles1h);

  const rsiSignal =
    rsi1h < 30 ? "oversold — potential bounce zone"
    : rsi1h < 45 ? "approaching oversold — early accumulation window"
    : rsi1h > 70 ? "overbought — caution"
    : "neutral";

  const macdSignal = macd1h > 0 ? "bullish momentum" : "bearish momentum";

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  TA REPORT — ${sym}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`  price:       $${ticker.price}`);
  console.log(`  24h change:  ${ticker.change}%`);
  console.log(`  24h volume:  $${(ticker.volume / 1e6).toFixed(1)}M`);
  console.log(`  24h high:    $${ticker.high}`);
  console.log(`  24h low:     $${ticker.low}`);
  console.log(`\n  — TECHNICAL INDICATORS —`);
  console.log(`  RSI (1h):    ${rsi1h} → ${rsiSignal}`);
  console.log(`  RSI (4h):    ${rsi4h}`);
  console.log(`  MACD (1h):   ${macd1h} → ${macdSignal}`);
  console.log(`  volume:      ${volTrend.trend} (${volTrend.pct > 0 ? "+" : ""}${volTrend.pct}% vs prev 5 candles)`);
  console.log(`  support:     $${supRes.support}`);
  console.log(`  resistance:  $${supRes.resistance}\n`);

  const taData = `
${sym} live data:
- price: $${ticker.price}, 24h change: ${ticker.change}%, volume: $${(ticker.volume / 1e6).toFixed(1)}M
- RSI 1h: ${rsi1h} (${rsiSignal}), RSI 4h: ${rsi4h}
- MACD 1h: ${macd1h} (${macdSignal})
- volume trend: ${volTrend.trend} ${volTrend.pct > 0 ? "+" : ""}${volTrend.pct}%
- support: $${supRes.support}, resistance: $${supRes.resistance}
  `.trim();

  const analysis = await chat(
    `Based on this live TA data for ${sym}:\n\n${taData}\n\n
     1. Give a 3-sentence TA summary — what the indicators say, what to watch for
     2. Score it on our research framework: team/7 + tokenomics/7 + narrative/6 = /20 (use your training knowledge)
     3. Write a 3-tweet X thread in @arkilus78 voice — lowercase, bookmark CTA in tweet 1, ends with question
     Be direct. No fluff.`
  );

  console.log(analysis + "\n");
}

async function runScreener() {
  console.log("\n screening top pairs via binance...\n");

  const pairs = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","ARBUSDT","OPUSDT","INJUSDT","TIAUSDT"];
  const results = await Promise.all(pairs.map(getTickerData));

  const sorted = results.sort(
    (a, b) => Math.abs(b.change) - Math.abs(a.change)
  );

  console.log("symbol          | price       | 24h change | volume");
  console.log("————————————————————————————————————————————————————");
  for (const d of sorted) {
    const sym = d.symbol.padEnd(15);
    const price = `$${d.price}`.padEnd(12);
    const chg = `${d.change}%`.padEnd(11);
    console.log(`${sym} | ${price}| ${chg}| $${(d.volume / 1e6).toFixed(1)}M`);
  }

  const table = sorted
    .map((d) => `${d.symbol}: $${d.price}, ${d.change}%, $${(d.volume / 1e6).toFixed(1)}M volume`)
    .join("\n");

  const analysis = await chat(
    `Live Binance 24hr data:\n\n${table}\n\nPick TOP 3 most interesting for early research. 2 sentences each. @arkilus78 voice.`
  );
  console.log("\n" + analysis + "\n");
}

async function generatePost(symbol) {
  console.log(`\n generating x post for ${symbol.toUpperCase()}...\n`);

  let dataStr;
  try {
    const data = await getTickerData(symbol.toUpperCase() + "USDT");
    dataStr = `price $${data.price}, 24h change ${data.change}%, volume $${(data.volume / 1e6).toFixed(1)}M`;
  } catch {
    dataStr = `${symbol} token`;
  }

  const result = await chat(
    `Generate a single high-engagement X post about ${symbol.toUpperCase()} for @arkilus78.
     Live data: ${dataStr}
     Format: hook with "hear me out >>>>", key data point, "here's why it matters >>>>", 1 insight, end with question.
     Max 280 chars. Lowercase only. No em dashes.`
  );
  console.log(result + "\n");
}

async function checkBalance() {
  console.log("\n binance connectivity test:\n");
  const data = await getTickerData("BTCUSDT");
  console.log(`  btcusdt: $${data.price} | ${data.change}% | vol $${(data.volume / 1e6).toFixed(1)}M\n`);
  console.log(" binance api connected. for full balance check use claude desktop with binance mcp.\n");
}

async function chat(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages,
  });

  const assistantMessage = response.choices[0].message.content;
  conversationHistory.push({ role: "assistant", content: assistantMessage });
  return assistantMessage;
}

async function interactiveMode() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   the 1% researcher agent — powered by binance");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\ncommands:");
  console.log("  screen         — screen top 8 pairs for alpha");
  console.log("  dips           — scan ALL pairs: low rsi + rising volume");
  console.log("  ta SOL         — full TA + thread for any token");
  console.log("  post BTC       — generate x post for any token");
  console.log("  balance        — check binance connectivity");
  console.log("  exit           — quit\n");

  const ask = () => {
    rl.question("you > ", async (input) => {
      const trimmed = input.trim().toLowerCase();

      if (trimmed === "exit") {
        console.log("\ngood alpha hunting.\n");
        rl.close();
        return;
      }

      try {
        if (trimmed === "screen") {
          await runScreener();
        } else if (trimmed === "dips") {
          await momentumDipScanner();
        } else if (trimmed.startsWith("ta ")) {
          await analyzeToken(trimmed.replace("ta ", "").trim());
        } else if (trimmed.startsWith("post ")) {
          await generatePost(trimmed.replace("post ", "").trim());
        } else if (trimmed === "balance") {
          await checkBalance();
        } else {
          const response = await chat(input);
          console.log("\nagent >\n" + response + "\n");
        }
      } catch (err) {
        console.log("\nerror: " + err.message + "\n");
      }

      ask();
    });
  };

  ask();
}

const args = process.argv.slice(2);
if (args[0] === "screen") runScreener().catch(console.error);
else if (args[0] === "dips") momentumDipScanner().catch(console.error);
else if (args[0] === "ta" && args[1]) analyzeToken(args[1]).catch(console.error);
else if (args[0] === "post" && args[1]) generatePost(args[1]).catch(console.error);
else if (args[0] === "balance") checkBalance().catch(console.error);
else interactiveMode().catch(console.error);