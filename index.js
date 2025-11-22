/*
Bot Telegram ottimizzato per Replit
-----------------------------------
Funzioni:
- Ogni utente può dare massimo 1 punto al giorno (+1 in chat)
- Punti cumulativi permanenti
- Messaggio automatico ogni giorno a mezzanotte
- Differenza punti tra i primi due giocatori
- Vittoria registrata se differenza >= 3
- Storico vittorie salvato
- /register per impostare la chat per messaggio giornaliero
- Keep-alive per Replit tramite mini server Express

IMPORTANTE: inserisci il tuo TOKEN nella variabile BOT_TOKEN
NON condividere il tuo token con nessuno.
*/

import { Telegraf } from "telegraf";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- TOKEN DEL BOT (usa variabile ambiente) ----
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("ERRORE: Imposta la variabile ambiente BOT_TOKEN");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---- Directory dati persistenti ----
const DATA_DIR = path.resolve(__dirname);
const POINTS_FILE = path.join(DATA_DIR, "points.json");
const LAST_POINT_FILE = path.join(DATA_DIR, "lastPointDate.json");
const VICTORIES_FILE = path.join(DATA_DIR, "victories.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

function loadJSON(file, def) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  } catch (e) {}
  return def;
}

let points = loadJSON(POINTS_FILE, {});
let lastPointDate = loadJSON(LAST_POINT_FILE, {});
let victories = loadJSON(VICTORIES_FILE, []);
let config = loadJSON(CONFIG_FILE, {});

function save() {
  fs.writeFileSync(POINTS_FILE, JSON.stringify(points, null, 2));
  fs.writeFileSync(LAST_POINT_FILE, JSON.stringify(lastPointDate, null, 2));
  fs.writeFileSync(VICTORIES_FILE, JSON.stringify(victories, null, 2));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Comandi Telegram ----
bot.command("register", (ctx) => {
  config.chatId = ctx.chat.id;
  save();
  ctx.reply("✅ Questa chat è stata registrata per il messaggio giornaliero.");
});

bot.command("help", (ctx) => {
  ctx.reply(
    `Comandi disponibili:\n\n` +
      `+1 → prendi 1 punto (max 1 al giorno)\n` +
      `/classifica → mostra classifica\n` +
      `/miei → mostra i tuoi punti\n` +
      `/vittorie → storico vittorie\n` +
      `/register → registra questa chat per i messaggi giornalieri`
  );
});

bot.on("text", (ctx) => {
  const text = ctx.message.text;
  const user = ctx.from.username
    ? "@" + ctx.from.username
    : ctx.from.first_name || "user" + ctx.from.id;

  if (!config.chatId) {
    config.chatId = ctx.chat.id;
    save();
  }

  if (text.includes("+1")) {
    const todayStr = today();

    if (lastPointDate[user] === todayStr) {
      return ctx.reply(`❌ ${user}, hai già preso un punto oggi.`);
    }

    points[user] = (points[user] || 0) + 1;
    lastPointDate[user] = todayStr;
    save();

    ctx.reply(`🏅 Punto assegnato a ${user}! Totale: ${points[user]}`);
  }
});

bot.command("classifica", (ctx) => {
  if (Object.keys(points).length === 0) return ctx.reply("Nessun punto ancora.");

  const msg = Object.entries(points)
    .sort((a, b) => b[1] - a[1])
    .map(([u, p], i) => `${i + 1}. ${u}: ${p}`)
    .join("\n");

  ctx.reply("📊 Classifica:\n" + msg);
});

bot.command("miei", (ctx) => {
  const user = ctx.from.username
    ? "@" + ctx.from.username
    : ctx.from.first_name || "user" + ctx.from.id;

  ctx.reply(`📥 ${user}, hai ${points[user] || 0} punti.`);
});

bot.command("vittorie", (ctx) => {
  if (victories.length === 0) return ctx.reply("Nessuna vittoria registrata.");

  const msg = victories
    .map((v) => `• ${v.giocatore} — ${v.data}`)
    .join("\n");

  ctx.reply("🏆 Storico vittorie:\n" + msg);
});

// ---- Controllo giornaliero mezzanotte ----
let lastDay = new Date().getDate();
setInterval(async () => {
  const now = new Date();
  const d = now.getDate();

  if (d !== lastDay) {
    lastDay = d;
    let msg = "";
    const arr = Object.entries(points).sort((a, b) => b[1] - a[1]);

    if (arr.length >= 2) {
      const [f, s] = arr;
      const diff = f[1] - s[1];

      msg = `🕛 Fine giornata:\n\n1° ${f[0]} — ${f[1]} punti\n2° ${s[0]} — ${s[1]} punti\n\nDifferenza: +${diff}`;

      if (diff >= 3) {
        victories.push({ giocatore: f[0], data: today() });
        save();
        msg += `\n\n🎉 Vincitore del giorno: ${f[0]}`;
      }
    } else if (arr.length === 1) {
      const [f] = arr;
      msg = `🕛 Fine giornata:\n\nSolo un giocatore: ${f[0]} — ${f[1]} punti`;
    } else {
      msg = "🕛 Fine giornata: nessun punto.";
    }

    if (config.chatId) {
      try {
        await bot.telegram.sendMessage(config.chatId, msg);
      } catch (e) {
        console.error("Errore invio messaggio giornaliero:", e);
      }
    }
  }
}, 60 * 1000);

// ---- Keep-alive per Replit ----
const app = express();
app.get("/", (req, res) => {
  res.send("Bot attivo");
});
app.listen(5000, "0.0.0.0", () => console.log("Keep-alive attivo su porta 5000"));

// ---- Avvio bot ----
bot.launch().then(() => console.log("Bot avviato")).catch(console.error);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
