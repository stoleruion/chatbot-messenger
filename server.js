// v6
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function trimiteMessenger(userId, text) {
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: userId }, message: { text } })
  });
}

async function trimiteTelegram(mesaj) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text: mesaj, parse_mode: 'HTML' })
  });
}

function imparteText(text) {
  if (text.length <= 300) return [text];
  const parti = [];
  const propozitii = text.split(/(?<=[.!?])\s+/);
  let parte = '';
  for (const prop of propozitii) {
    if ((parte + prop).length > 300) {
      if (parte) parti.push(parte.trim());
      parte = prop;
    } else {
      parte += (parte ? ' ' : '') + prop;
    }
  }
  if (parte) parti.push(parte.trim());
  return parti.length > 0 ? parti : [text];
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

  if (!istoricConversatii[userId]) istoricConversatii[userId] = [];
  istoricConversatii[userId].push({ role: 'user', content: mesajClient });

  const delay = 2000 + Math.floor(Math.random() * 2000);
  await sleep(delay);

  const raspuns = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Ești un consultant de vânzări pentru magazinul MD SHOP. Vinzi produse naturale și accesorii medicale.

REGULI DE COMUNICARE — OBLIGATORIU:
- Detectează limba clientului (română sau rusă) și răspunde DOAR în acea limbă
- Scrie ca un om real, nu ca un robot
- Fără emoji excesive — maxim 1 per mesaj, doar dacă e natural
- Fără liste cu puncte sau structuri formale
- Răspunsuri scurte și naturale — ca într-o conversație reală
- Dacă răspunsul e lung, împarte-l în 2-3 mesaje scurte folosind [PAUZA] între ele
- Nu repeta informații deja spuse
- Fii direct și convingător, dar fără presiune
- Adaptează-te la tonul clientului

PRODUS 1 — Tinctura pentru Slăbire
Mod de folosire: 10 picături de 2 ori pe zi în apă. O cutie = 20 zile.
Efecte: taie pofta, accelerează metabolismul, îmbunătățește digestia. Până la -5 kg per cutie.
Prețuri:
1 cutie = 379 MDL, rezultat până la -5 kg
2 cutii = 760 MDL, rezultat până la -10 kg
3+1 gratuit = 1150 MDL, rezultat până la -18 kg
Dacă ezită — menționează oferta 3+1.

PRODUS 2 — Separator de degete
Preț: 199 MDL (redus de la 325) + 30 MDL livrare
Beneficii: elimină durerile, îndreaptă degetul mare, comod de purtat.
ÎNTREABĂ MEREU: pentru un picior sau ambele? 1 picior = 1 set, ambele = 2 seturi.
Livrare Chișinău: curier. Colectează: nume, adresă exactă, telefon, cantitate.
Livrare alte orașe: poștă. Colectează: nume prenume ca în buletin, sat/raion, telefon, cantitate.

ÎNREGISTRARE COMANDĂ:
Când ai colectat TOATE datele necesare (nume, adresă, telefon, cantitate), scrie la sfârșitul mesajului:
[COMANDA: nume=XXX, adresa=XXX, telefon=XXX, produs=XXX, cantitate=XXX]

Când clientul alege "Vreau să fiu sunat", colectează doar numele și telefonul, apoi scrie:
[APEL: nume=XXX, telefon=XXX]`,
    messages: istoricConversatii[userId],
  });

  const textRaspuns = raspuns.content[0].text;
  istoricConversatii[userId].push({ role: 'assistant', content: textRaspuns });

  // Detectează comanda sau cerere de apel
  const comandaMatch = textRaspuns.match(/\[COMANDA:(.*?)\]/s);
  const apelMatch = textRaspuns.match(/\[APEL:(.*?)\]/s);

  if (comandaMatch) {
    await trimiteTelegram(`🛒 <b>COMANDĂ NOUĂ!</b>\n${comandaMatch[1].trim()}`);
  }
  if (apelMatch) {
    await trimiteTelegram(`📞 <b>CLIENT VREA APEL!</b>\n${apelMatch[1].trim()}`);
  }

  // Trimite mesajul fără tagurile interne
  const textCurat = textRaspuns.replace(/\[COMANDA:.*?\]/s, '').replace(/\[APEL:.*?\]/s, '').trim();
  const parti = textCurat.split('[PAUZA]').map(p => p.trim()).filter(p => p);

  for (let i = 0; i < parti.length; i++) {
    if (i > 0) await sleep(1500);
    await trimiteMessenger(userId, parti[i]);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Server pornit!'));
