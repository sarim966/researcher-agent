import OpenAI from "openai";
import * as readline from "readline";
import dotenv from "dotenv";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.AGENTROUTER_API_KEY,
  baseURL: process.env.AGENTROUTER_BASE_URL,
});

const MODEL = process.env.MODEL || "deepseek-v4-flash";
const BINANCE_MCP = "https://agent.binance.com/mcp/agentic";

const SYSTEM_PROMPT = `You are the 1% Researcher Agent built for @arkilus78 on X.

Your job: find early crypto projects with strong on-chain signals BEFORE Crypto Twitter discovers them. Use Binance market data to research tokens and generate X posts.

VOICE RULES:
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

When researching a token: score it, analyze it, generate a ready-to-post X thread in @arkilus78 voice.`;

const conversationHistory = [];

async function chat(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: messages,
  });

  const assistantMessage = response.choices[0].message.content;
  conversationHistory.push({ role: "assistant", content: assistantMessage });
  return assistantMessage;
}

async function getBinanceData(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url);
  const data = await res.json();
  return {
    symbol: data.symbol,
    price: parseFloat(data.lastPrice).toFixed(4),
    change: parseFloat(data.priceChangePercent).toFixed(2),
    volume: (parseFloat(data.quoteVolume) / 1e6).toFixed(1) + "M",
    high: parseFloat(data.highPrice).toFixed(4),
    low: parseFloat(data.lowPrice).toFixed(4),
  };
}

async function runScreener() {
  console.log("\n searching top pairs via binance...\n");

  const pairs = [
    "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT",
    "ARBUSDT","OPUSDT","INJUSDT","TIAUSDT",
  ];

  const results = await Promise.all(pairs.map(getBinanceData));

  const table = results
    .sort((a, b) => Math.abs(parseFloat(b.change)) - Math.abs(parseFloat(a.change)))
    .map((d) => `${d.symbol} | $${d.price} | ${d.change}% | $${d.volume}`)
    .join("\n");

  console.log("\nsymbol | price | 24h change | volume");
  console.log("————————————————————————————————————");
  console.log(table);

  const prompt = `Here is live Binance 24hr data for these pairs:\n\n${table}\n\nPick the TOP 3 most interesting for early research and explain why in 2 sentences each. Use the data to back your picks.`;
  const analysis = await chat(prompt);
  console.log("\n" + analysis + "\n");
}

async function researchToken(symbol) {
  console.log(`\n researching ${symbol.toUpperCase()}...\n`);

  let data;
  try {
    data = await getBinanceData(symbol + "USDT");
  } catch {
    data = null;
  }

  const dataStr = data
    ? `live binance data: price $${data.price} | 24h change ${data.change}% | volume $${data.volume} | high $${data.high} | low $${data.low}`
    : `no direct binance listing found for ${symbol}`;

  const prompt = `Research ${symbol.toUpperCase()} for @arkilus78:
${dataStr}

1. Score it: team/7 + tokenomics/7 + narrative/6 = /20
2. Write a 3-tweet X thread in his voice — lowercase, ends with question, bookmark CTA in tweet 1
Make it feel like breaking alpha, not a report.`;

  const result = await chat(prompt);
  console.log(result + "\n");
}

async function generatePost(symbol) {
  console.log(`\n generating x post for ${symbol.toUpperCase()}...\n`);

  let data;
  try {
    data = await getBinanceData(symbol + "USDT");
  } catch {
    data = null;
  }

  const dataStr = data
    ? `price $${data.price}, 24h change ${data.change}%, volume $${data.volume}`
    : `${symbol} token`;

  const prompt = `Generate a single high-engagement X post about ${symbol.toUpperCase()} for @arkilus78.
Live data: ${dataStr}
Format: hook with "hear me out >>>>", key data point, "here's why it matters >>>>", 1 insight, end with question.
Max 280 chars. Lowercase only. No em dashes.`;

  const result = await chat(prompt);
  console.log(result + "\n");
}

async function checkBalance() {
  console.log("\n note: balance check requires binance mcp auth in claude desktop\n");
  console.log(" for this demo, showing live BTC price as connectivity test:\n");
  const data = await getBinanceData("BTCUSDT");
  console.log(`btcusdt: $${data.price} | ${data.change}% | vol $${data.volume}\n`);
}

async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("   the 1% researcher agent — powered by binance");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\ncommands:");
  console.log("  screen         — screen top 8 pairs for alpha");
  console.log("  research SOL   — deep research any token");
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
        } else if (trimmed.startsWith("research ")) {
          await researchToken(trimmed.replace("research ", "").trim());
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
else if (args[0] === "research" && args[1]) researchToken(args[1]).catch(console.error);
else if (args[0] === "post" && args[1]) generatePost(args[1]).catch(console.error);
else if (args[0] === "balance") checkBalance().catch(console.error);
else interactiveMode().catch(console.error);