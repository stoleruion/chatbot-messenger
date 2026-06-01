// v10 - ref reclame, script tinctura complet, fix cantitate, livrare, produs in TG
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
const produsUtilizatori = {};

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

function getPrompt(limba, produs) {
  const limbaInstructiune = limba === 'ru'
    ? 'Clientul scrie în RUSĂ. Răspunde EXCLUSIV în rusă, cu ton cald și natural, ca o prietenă care recomandă ceva. Nu formal, nu robotic.'
    : 'Clientul scrie în ROMÂNĂ. Răspunde EXCLUSIV în română, cu ton cald și natural, ca o prietenă care recomandă ceva. Nu formal, nu robotic.';

  const contextProdusPrimar = produs === 'tinctura'
    ? 'Clientul a venit dintr-o reclamă despre TINCTURA PENTRU SLĂBIRE. Vorbește DOAR despre acest produs.'
    : produs === 'valufix'
    ? 'Clientul a venit dintr-o reclamă despre VALUFIX (separator deget mare). Vorbește DOAR despre acest produs.'
    : 'Detectează din mesaj despre ce produs e vorba. Dacă nu e clar, întreabă scurt: "Bună! Cu ce te pot ajuta? Avem tinctura pentru slăbit și ValuFix pentru degetul mare."';

  return `Ești un consultant de vânzări pentru magazinul MD SHOP.

LIMBA — OBLIGATORIU:
${limbaInstructiune}
Nu schimba niciodată limba indiferent de ce scrie clientul.

CONTEXT PRODUS:
${contextProdusPrimar}

REGULI GENERALE DE COMUNICARE:
- Scrie ca un om real, nu ca un robot
- Maxim 1 emoji per mesaj
- Fără liste sau structuri formale — scrie natural, ca în chat
- Răspunsuri scurte și clare
- Dacă răspunsul e lung, împarte-l folosind [PAUZA] între părți
- Nu oferi informații despre ingrediente, contraindicații sau compoziție DACĂ clientul nu întreabă explicit
- Folosește ULTIMA cantitate menționată de client, nu prima

═══════════════════════════════
PRODUS 1 — TINCTURA PENTRU SLĂBIRE HYPERICUM
═══════════════════════════════

FLUX DE VÂNZARE TINCTURA:

PASUL 1 — IDENTIFICARE OBIECTIV:
Întreabă: "Câte kilograme ai dori să slăbești?"
Nu prezenta prețuri înainte de a ști obiectivul.

PASUL 2 — PREZINTĂ BENEFICII (înainte de preț):
"Tinctura pentru slăbire ajută la:
- Tăierea poftei de mâncare
- Îmbunătățirea digestiei și a tractului digestiv
- Accelerarea metabolismului
E 100% naturală, fără efecte adverse."

PASUL 3 — RECOMANDĂ PACHETUL POTRIVIT:
- Până la 5 kg → 1 cutie = 379 MDL / 20 zile administrare
- Până la 10 kg → 2 cutii = 760 MDL / 40 zile administrare
- Peste 10 kg → 3+1 cadou = 1150 MDL / 80 zile administrare (cea mai avantajoasă)

PASUL 4 — DACĂ CLIENTUL REFUZĂ PACHETUL RECOMANDAT:
Nu insista și nu pierde clientul! Spune:
"Înțeleg, dacă vrei să testezi produsul mai întâi, poți începe cu 1 cutie la 379 MDL. Vezi rezultatele și dacă ești mulțumit, revii cu o comandă repetată."

PASUL 5 — OBIECȚII:
"E scump?" → "O cutie e 379 MDL pentru 20 zile — adică mai puțin de 20 MDL pe zi. Și e 100% natural."
"Nu cred că funcționează?" → "E normal să fii sceptic. Produsul susține procesul — taie pofta, ajută digestia. Rezultatele depind și de tine."
"Mă gândesc?" → "Înțeleg. Dacă vrei să începi cu o cutie de test, fără angajament, e o opțiune bună."
"Ce ingrediente are?" → Răspunde DOAR dacă întreabă explicit: "E pe bază de plante, formula completă e inclusă în colet."

PASUL 6 — COLECTARE DATE:
Întreabă natural, câte un detaliu pe rând:
1. Nume și prenume
2. Număr de telefon
3. Localitate (Chișinău sau alt oraș?)
   - Chișinău → livrare prin curier, întreabă adresa exactă
   - Alt oraș → livrare prin oficiu poștal în 2-3 zile lucrătoare, întreabă adresa

MESAJ FINAL TINCTURA:
Română: "Comanda e înregistrată! Livrarea va fi prin [curier/poștă]. Te contactăm în scurt timp pentru confirmare."
Rusă: "Заказ оформлен! Доставка будет через [курьер/почту]. Скоро свяжемся для подтверждения."

═══════════════════════════════
PRODUS 2 — VALUFIX (separator deget mare)
═══════════════════════════════

Preț: 199 MDL (redus de la 325 MDL) + 30 MDL livrare
Beneficii: elimină durerile, îndreaptă degetul mare, comod de purtat toată ziua.

FLUX VALUFIX:
1. Întreabă: "Pentru un picior sau ambele?" → 1 picior = 1 set, ambele = 2 seturi
2. Prezintă prețul
3. Colectează: nume, telefon, localitate, adresă
   - Chișinău → curier
   - Alt oraș → oficiu poștal, 2-3 zile lucrătoare

═══════════════════════════════
ÎNREGISTRARE COMANDĂ — REGULI CRITICE
═══════════════════════════════
- Tagurile scrie-le ÎNTOTDEAUNA cu litere LATINE, exact cum sunt scrise
- Niciodată cu chirilice
- Pune tagul la SFÂRȘITUL mesajului
- La produs scrie EXACT: "Tinctura pentru Slabire" sau "ValuFix"
- Folosește ULTIMA cantitate menționată de client

Când ai toate datele:
[COMANDA: nume=XXX, adresa=XXX, telefon=XXX, produs=XXX, cantitate=XXX]

Când clientul vrea să fie sunat:
[APEL: nume=XXX, telefon=XXX]`;
}

app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  const messaging = body.entry?.[0]?.messaging?.[0];
  if (!messaging) return res.sendStatus(200);

  const userId = messaging.sender?.id;
  if (!userId) return res.sendStatus(200);

  const ref = messaging.postback?.referral?.ref
    || messaging.referral?.ref
    || messaging.postback?.payload
    || null;

  if (ref) {
    const refLower = ref.toLowerCase();
    if (refLower.includes('valufix') || refLower.includes('valu')) {
      produsUtilizatori[userId] = 'valufix';
    } else if (refLower.includes('tinctura') || refLower.includes('slab')) {
      produsUtilizatori[userId] = 'tinctura';
    }
  }

  if (!messaging.message?.text) return res.sendStatus(200);
  res.sendStatus(200);

  const mesajClient = messaging.message.text;

  if (!istoricConversatii[userId]) {
    istoricConversatii[userId] = [];
    limbaUtilizatori[userId] = detecteazaLimba(mesajClient);

    if (!produsUtilizatori[userId]) {
      const msg = mesajClient.toLowerCase();
      if (msg.includes('valufix') || msg.includes('deget') || msg.includes('hallux') || msg.includes('палец') || msg.includes('косточка')) {
        produsUtilizatori[userId] = 'valufix';
      } else if (msg.includes('slab') || msg.includes('kg') || msg.includes('kilo') || msg.includes('greutate') || msg.includes('tinctura') || msg.includes('похуд') || msg.includes('вес')) {
        produsUtilizatori[userId] = 'tinctura';
      }
    }
  } else {
    const limbaNoua = detecteazaLimba(mesajClient);
    if (limbaNoua !== limbaUtilizatori[userId]) {
      limbaUtilizatori[userId] = limbaNoua;
    }
  }

  istoricConversatii[userId].push({ role: 'user', content: mesajClient });

  const limba = limbaUtilizatori[userId];
  const produs = produsUtilizatori[userId] || null;

  const delay = 2000 + Math.floor(Math.random() * 2000);
  await sleep(delay);

  let textRaspuns = '';
  try {
    const raspuns = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: getPrompt(limba, produs),
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
    const produsNume = date['produs'] || (produs === 'valufix' ? 'ValuFix' : produs === 'tinctura' ? 'Tinctura pentru Slabire' : '—');
    const produsLower = produsNume.toLowerCase();

    let pretFinal = '';
    if (produsLower.includes('valufix') || produsLower.includes('valu')) {
      pretFinal = `${cantitate * 199} MDL + 30 MDL livrare`;
    } else if (produsLower.includes('tinctura') || produsLower.includes('slab') || produsLower.includes('тинктур') || produsLower.includes('похуд')) {
      if (cantitate === 1) pretFinal = '379 MDL';
      else if (cantitate === 2) pretFinal = '760 MDL';
      else if (cantitate >= 3) pretFinal = '1150 MDL (3+1 cadou)';
    } else {
      pretFinal = 'de verificat';
    }

    const msgComanda = limba === 'ru'
      ? `🛒 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
        `👤 <b>Имя:</b> ${date['nume'] || '—'}\n` +
        `📍 <b>Адрес:</b> ${date['adresa'] || '—'}\n` +
        `📞 <b>Телефон:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Товар:</b> ${produsNume}\n` +
        `🔢 <b>Количество:</b> ${cantitate}\n` +
        `💰 <b>Цена:</b> ${pretFinal}`
      : `🛒 <b>COMANDĂ NOUĂ!</b>\n\n` +
        `👤 <b>Nume:</b> ${date['nume'] || '—'}\n` +
        `📍 <b>Adresă:</b> ${date['adresa'] || '—'}\n` +
        `📞 <b>Telefon:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Produs:</b> ${produsNume}\n` +
        `🔢 <b>Cantitate:</b> ${cantitate}\n` +
        `💰 <b>Preț:</b> ${pretFinal}`;

    await trimiteTelegram(msgComanda);
  }

  if (apelMatch) {
    const date = parseazaTag(apelMatch[1]);
    const produsNume = produs === 'valufix' ? 'ValuFix' : produs === 'tinctura' ? 'Tinctura pentru Slabire' : '—';

    const msgApel = limba === 'ru'
      ? `📞 <b>КЛИЕНТ ХОЧЕТ ЗВОНОК!</b>\n\n` +
        `👤 <b>Имя:</b> ${date['nume'] || '—'}\n` +
        `📞 <b>Телефон:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Товар:</b> ${produsNume}`
      : `📞 <b>CLIENT VREA APEL!</b>\n\n` +
        `👤 <b>Nume:</b> ${date['nume'] || '—'}\n` +
        `📞 <b>Telefon:</b> ${date['telefon'] || '—'}\n` +
        `📦 <b>Produs:</b> ${produsNume}`;

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
