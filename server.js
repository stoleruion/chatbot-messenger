// v9 - fixed: cyrillic tags, telegram notifications, natural Russian tone
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json());

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const istoricConversatii = {};
const limbaUtilizatori = {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function detecteazaLimba(text) {
  const rusRegex = /[а-яёА-ЯЁ]/;
  return rusRegex.test(text) ? 'ru' : 'ro';
}

async function trimiteMessenger(userId, text) {
  const resp = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: userId }, message: { text } })
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error('Messenger error:', err);
  }
}

async function trimiteTelegram(mesaj) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: mesaj, parse_mode: 'HTML' })
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('Telegram error:', err);
    }
  } catch (e) {
    console.error('Telegram fetch failed:', e);
  }
}

function parseazaTag(continut) {
  const date = {};
  continut.trim().split(',').forEach(item => {
    const [key, ...val] = item.split('=');
    if (key && val.length) date[key.trim().toLowerCase()] = val.join('=').trim();
  });
  return date;
}

function curataTags(text) {
  return text
    .replace(/\[COMANDA:.*?\]/gsi, '')
    .replace(/\[ЗАКАЗ:.*?\]/gsi, '')
    .replace(/\[COMMANDA:.*?\]/gsi, '')
    .replace(/\[APEL:.*?\]/gsi, '')
    .replace(/\[АПЕЛ:.*?\]/gsi, '')
    .replace(/\[APPEL:.*?\]/gsi, '')
    .replace(/\[CALL:.*?\]/gsi, '')
    .trim();
}

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0]?.messaging?.[0];
  if (!entry?.message?.text) return res.sendStatus(200);
  res.sendStatus(200);

  const userId = entry.sender.id;
  const mesajClient = entry.message.text;

  if (!istoricConversatii[userId]) {
    istoricConversatii[userId] = [];
    limbaUtilizatori[userId] = detecteazaLimba(mesajClient);
  } else {
    const limbaNoua = detecteazaLimba(mesajClient);
    if (limbaNoua !== limbaUtilizatori[userId]) {
      limbaUtilizatori[userId] = limbaNoua;
    }
  }

  istoricConversatii[userId].push({ role: 'user', content: mesajClient });
  const limba = limbaUtilizatori[userId];

  const delay = 2000 + Math.floor(Math.random() * 2000);
  await sleep(delay);

  let textRaspuns = '';
  try {
    const raspuns = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Ești un consultant de vânzări pentru magazinul MD SHOP.

LIMBA DE COMUNICARE — OBLIGATORIU:
${limba === 'ru'
  ? 'Clientul scrie în RUSĂ. Răspunde EXCLUSIV în rusă, cu ton cald și natural, ca o prietenă care recomandă ceva. Nu formal, nu robotic.'
  : 'Clientul scrie în ROMÂNĂ. Răspunde EXCLUSIV în română, cu ton cald și natural, ca o prietenă care recomandă ceva. Nu formal, nu robotic.'
}
Nu schimba niciodată limba indiferent de ce scrie clientul.

REGULI DE COMUNICARE:
- Scrie ca un om real, nu ca un robot
- Fără emoji excesive — maxim 1 per mesaj
- Fără liste sau structuri formale
- Răspunsuri scurte și naturale
- Dacă răspunsul e lung, împarte-l folosind [PAUZA] între părți
- Dacă nu înțelegi ce vrea clientul, întreabă concret ce a vrut să spună
- Fii direct și convingător, dar fără presiune

PRODUS 1 — Tinctura pentru Slăbire
Mod de folosire: 10 picături de 2 ori pe zi în apă. O cutie = 20 zile.
Efecte: taie pofta, accelerează metabolismul, îmbunătățește digestia. Până la -5 kg per cutie.
Prețuri:
1 cutie = 379 MDL, până la -5 kg
2 cutii = 760 MDL, până la -10 kg
3+1 gratuit = 1150 MDL, până la -18 kg
Dacă ezită — menționează oferta 3+1.

PRODUS 2 — ValuFix (separator pentru degetul mare, numit și ValuFic, Valu Fix)
Preț: 199 MDL (redus de la 325) + 30 MDL livrare
Beneficii: elimină durerile, îndreaptă degetul mare, comod de purtat toată ziua.
ÎNTREABĂ MEREU: pentru un picior sau ambele? 1 picior = 1 set, ambele = 2 seturi.
Livrare Chișinău: curier. Colectează: nume, adresă exactă, telefon, cantitate.
Livrare alte orașe: poștă. Colectează: nume prenume ca în buletin, adresă (sat și raion), telefon, cantitate.

COLECTARE DATE COMANDĂ:
- Nu cere toate datele dintr-o dată
- Întreabă natural: "Pentru a înregistra comanda dă-mi te rog adresa de livrare"
- Verifică că ai TOATE datele înainte de a confirma

MESAJ FINAL DE CONFIRMARE:
Română: "Perfect, comanda este înregistrată. În scurt timp vei primi un apel pentru a confirma datele."
Rusă: "Отлично, заказ зарегистрирован. Скоро с тобой свяжется оператор для подтверждения."

ÎNREGISTRARE COMANDĂ — REGULI CRITICE PENTRU TAGURI:
- Tagurile de mai jos scrie-le ÎNTOTDEAUNA cu litere LATINE, exact cum sunt scrise aici
- Niciodată cu litere chirilice, niciodată altfel
- Pune tagul la SFÂRȘITUL mesajului, după textul pentru client

Când ai toate datele comenzii scrie la sfârșit:
[COMANDA: nume=XXX, adresa=XXX, telefon=XXX, produs=XXX, cantitate=XXX]

Când clientul vrea să fie sunat, după ce ai telefonul scrie la sfârșit:
[APEL: nume=XXX, telefon=XXX]`,
      messages: istoricConversatii[userId],
    });
    textRaspuns = raspuns.content[0].text;
  } catch (e) {
    console.error('Claude error:', e);
    const errMsg = limba === 'ru'
      ? 'Извини, произошла ошибка. Попробуй снова через несколько секунд.'
      : 'Scuze, a apărut o eroare. Încearcă din nou peste câteva secunde.';
    await trimiteMessenger(userId, errMsg);
    return;
  }

  istoricConversatii[userId].push({ role: 'assistant', content: textRaspuns });

  const comandaMatch = textRaspuns.match(/\[(?:COMANDA|ЗАКАЗ|COMMANDA):([^\]]*)\]/i);
  const apelMatch = textRaspuns.match(/\[(?:APEL|АПЕЛ|APPEL|CALL):([^\]]*)\]/i);

  if (comandaMatch) {
    const date = parseazaTag(comandaMatch[1]);
    const cantitate = parseInt(date['cantitate']) || 1;
    let pretFinal = '';
    const produs = (date['produs'] || '').toLowerCase();
    if (produs.includes('valufix') || produs.includes('valu')) {
      pretFinal = cantitate >= 2 ? `${cantitate * 199} MDL` : '199 MDL';
    } else if (produs.includes('tinctura') || produs.includes('slab') || produs.includes('тинктура') || produs.includes('похуд')) {
      if (cantitate === 1) pretFinal = '379 MDL';
      else if (cantitate === 2) pretFinal = '760 MDL';
      else if (cantitate >= 3) pretFinal = '1150 MDL (3+1 gratuit)';
    } else {
      pretFinal = 'de verificat / уточнить';
    }

    const msgComanda = limba === 'ru'
      ? `🛒 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
        `👤 <b>Имя:</b> ${date['nume'] || '—'}\n` +
        `📍 <b>Адрес:</b> ${date['adresa'] || '—'}\n` +
        `📞 <b>Телефон:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Товар:</b> ${date['produs'] || '—'}\n` +
        `🔢 <b>Количество:</b> ${cantitate}\n` +
        `💰 <b>Цена:</b> ${pretFinal}`
      : `🛒 <b>COMANDĂ NOUĂ!</b>\n\n` +
        `👤 <b>Nume:</b> ${date['nume'] || '—'}\n` +
        `📍 <b>Adresă:</b> ${date['adresa'] || '—'}\n` +
        `📞 <b>Telefon:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Produs:</b> ${date['produs'] || '—'}\n` +
        `🔢 <b>Cantitate:</b> ${cantitate}\n` +
        `💰 <b>Preț:</b> ${pretFinal}`;

    await trimiteTelegram(msgComanda);
  }

  if (apelMatch) {
    const date = parseazaTag(apelMatch[1]);
    const msgApel = limba === 'ru'
      ? `📞 <b>КЛИЕНТ ХОЧЕТ ЗВОНОК!</b>\n\n` +
        `👤 <b>Имя:</b> ${date['nume'] || '—'}\n` +
        `📞 <b>Телефон:</b> ${date['telefon'] || '—'}`
      : `📞 <b>CLIENT VREA APEL!</b>\n\n` +
        `👤 <b>Nume:</b> ${date['nume'] || '—'}\n` +
        `📞 <b>Telefon:</b> ${date['telefon'] || '—'}`;

    await trimiteTelegram(msgApel);
  }

  const textCurat = curataTags(textRaspuns);
  const parti = textCurat.split('[PAUZA]').map(p => p.trim()).filter(p => p);

  for (let i = 0; i < parti.length; i++) {
    if (i > 0) await sleep(1500);
    await trimiteMessenger(userId, parti[i]);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Server pornit pe portul', process.env.PORT || 3000));
