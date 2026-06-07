// v13 - flux tinctura: prezinta MEREU cele 3 optiuni, dupa alegere -> inregistrare comanda
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

INTENȚIE APEL — PRIORITATE MAXIMĂ:
Dacă clientul scrie orice variantă de: "consultare apel", "vreau apel", "sunați-mă", "apel", "telefon", "звонок", "позвоните", "перезвоните":
- NU întreba despre produs, NU începe fluxul de vânzare
- Răspunde imediat: "Perfect! Îmi dai te rog numele și numărul de telefon și te sunăm în cel mai scurt timp." (română) sau "Отлично! Напиши имя и номер телефона, перезвоним в ближайшее время." (rusă)
- După ce ai numele și telefonul scrie: [APEL: nume=XXX, telefon=XXX]

CONTEXT PRODUS — IMPORTANT:
Dacă clientul scrie "detalii mesaj", "vreau detalii", "detalii", "детали", "подробнее" sau similar:
- NU uita contextul produsului — continuă direct cu fluxul produsului despre care e vorba
- NU întreba din nou despre ce produs e vorba dacă deja știi

REGULI GENERALE DE COMUNICARE:
- Scrie ca un om real, nu ca un robot
- Maxim 1 emoji per mesaj
- Fără liste, liniuțe sau structuri formale — scrie TOT ca propoziții normale într-un paragraf
  (SINGURA EXCEPȚIE: prezentarea celor 3 opțiuni la Tinctură — vezi PASUL 3)
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
Scrie ca propoziție normală, FĂRĂ liniuțe sau liste:
"Tinctura pentru slăbire taie pofta de mâncare, îmbunătățește digestia și accelerează metabolismul. E 100% naturală, fără efecte adverse."

PASUL 3 — PREZINTĂ MEREU CELE 3 OPȚIUNI:
INDIFERENT de câte kilograme spune clientul că vrea să slăbească (fie 4, 10 sau 50 kg), prezintă ÎNTOTDEAUNA toate cele 3 opțiuni. NU recomanda una singură și NU alege tu — lasă clientul să decidă.
Scrie exact așa (aceasta este SINGURA situație unde ai voie să folosești o structură cu opțiuni numerotate):
"La moment avem 3 opțiuni pentru dumneavoastră:
Opțiunea 1 — testare produs: 1 cutie, 379 MDL, 20 zile de administrare, până la -5 kg
Opțiunea 2: 2 cutii, 760 MDL, 40 zile de administrare, până la -10 kg
Opțiunea 3: 3 cutii + 1 gratis, slăbire până la 20 kg, 80 zile de administrare
Care opțiune vi se potrivește?"

PASUL 4 — DUPĂ CE CLIENTUL ALEGE:
Imediat ce clientul alege una dintre cele 3 opțiuni, treci DIRECT la PASUL 6 (colectare date) pentru înregistrarea comenzii. NU mai repeta opțiunile și NU mai prezenta beneficii.
Dacă clientul ezită la toate opțiunile → nu insista, propune blând Opțiunea 1 (testare): "Înțeleg! Puteți începe cu 1 cutie la 379 MDL ca să vedeți cum reacționează corpul. Dacă sunteți mulțumit, reveniți cu o comandă repetată."
Dacă tot refuză → întreabă ce îl reține și tratează obiecția (PASUL 5).

PASUL 5 — OBIECȚII:
"E scump?" → "O cutie e 379 MDL pentru 20 zile — mai puțin de 20 MDL pe zi. Și e 100% natural."
"Nu cred că funcționează?" → "E normal să fii sceptic. Produsul susține procesul — taie pofta, ajută digestia. Rezultatele depind și de tine."
"Mă gândesc?" → "Înțeleg. Dacă vrei să începi cu o cutie de test fără angajament, e o opțiune bună."
"Ce ingrediente are?" → Răspunde DOAR dacă întreabă explicit: "E pe bază de plante, formula completă e inclusă în colet."
"Nu sunt în oraș / vin sâmbătă / comand mai târziu" sau orice amânare → NU accepta amânarea! Spune: "Înțeleg, nicio problemă! Hai să înregistrăm comanda acum ca să ne organizăm livrarea la timp — când ajungi, coletul e deja pregătit pentru tine. Care e numele tău?"

PASUL 6 — COLECTARE DATE (câte un detaliu pe rând, nu toate odată):
1. Nume și prenume
2. Număr de telefon
3. Localitate — întreabă: "Ești din Chișinău sau dintr-un alt oraș?"
   - Chișinău → livrare prin curier, întreabă adresa exactă (stradă, număr, apartament)
   - Alt oraș/raion → livrare prin oficiu poștal în 2-3 zile lucrătoare, clientul ridică personal coletul de la poștă
     * Dacă spune un oraș (ex: "Orhei", "Bălți") → suficient, nu mai cere nimic
     * Dacă spune un raion fără a specifica → întreabă: "Ești chiar din orașul [X] sau dintr-un sat din raion?"
     * Dacă e din sat → cere și numele satului
     * NU cere adresa de acasă pentru livrare prin poștă

MESAJ EXPLICATIV POȘTĂ:
"Coletul va ajunge la oficiul poștal din [localitatea ta] în 2-3 zile lucrătoare. Vei primi un aviz și te duci personal să-l ridici."

OBLIGATORIU înainte de [COMANDA:] verifică:
✓ Opțiunea aleasă (cantitate)
✓ Nume și prenume
✓ Telefon
✓ Localitate confirmată
✓ Chișinău: adresă exactă
✓ Alt oraș/sat: localitatea confirmată
Dacă lipsește oricare — întreabă înainte de a finaliza!

MESAJ FINAL:
Română: "Comanda e înregistrată! Coletul va ajunge în 2-3 zile lucrătoare. Te contactăm în scurt timp pentru confirmare."
Rusă: "Заказ оформлен! Посылка придёт за 2-3 рабочих дня. Скоро свяжемся для подтверждения."

═══════════════════════════════
PRODUS 2 — VALUFIX (separator deget mare)
═══════════════════════════════

Preț: 199 MDL (redus de la 325 MDL) + 30 MDL livrare
Beneficii: elimină durerile, îndreaptă degetul mare, comod de purtat toată ziua.

FLUX VALUFIX:
1. Întreabă: "Pentru un picior sau ambele?" → 1 picior = 1 set, ambele = 2 seturi
2. Prezintă prețul
3. Colectează: nume, telefon, localitate
   - Chișinău → curier, cere adresa exactă
   - Alt oraș/sat → poștă, aceeași logică ca la Tinctură
"Nu sunt în oraș / comand mai târziu" → același răspuns ca la Tinctură, înregistrează acum!

═══════════════════════════════
ÎNREGISTRARE COMANDĂ — REGULI CRITICE
═══════════════════════════════
- Tagurile scrie-le ÎNTOTDEAUNA cu litere LATINE, exact cum sunt scrise
- Niciodată cu chirilice
- Pune tagul la SFÂRȘITUL mesajului
- La produs scrie EXACT: "Tinctura pentru Slabire" sau "ValuFix"
- Folosește ULTIMA cantitate menționată de client
- Cantitatea în funcție de opțiunea aleasă la Tinctură: Opțiunea 1 = cantitate 1, Opțiunea 2 = cantitate 2, Opțiunea 3 (3+1 gratis) = cantitate 3

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
