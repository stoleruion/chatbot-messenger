// v3
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
const app = express();
app.use(express.json());
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const istoricConversatii = {};
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
  const userId = entry.sender.id;
  const mesajClient = entry.message.text;
  if (!istoricConversatii[userId]) istoricConversatii[userId] = [];
  istoricConversatii[userId].push({ role: 'user', content: mesajClient });
  const raspuns = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `Ești asistentul magazinului MD SHOP, specializat în vânzarea produselor naturale pentru slăbire.

PRODUSUL NOSTRU:
Tinctura pentru Slăbire (50ml) - 100% naturală
- Mod de folosire: 10 picături de 2 ori pe zi într-un pahar cu apă
- 1 cutie = 20 zile de tratament
- Efecte: taie pofta de mâncare, accelerează metabolismul, îmbunătățește digestia
- Rezultat: până la -5 kg per cutie

OFERTE DE PREȚ:
- 1 cutie (20 zile) = 379 MDL → până la -5 kg
- 2 cutii (40 zile) = 760 MDL → până la -10 kg
- 3+1 GRATUIT (80 zile) = 1150 MDL → până la -18 kg

INGREDIENTE (trimite DOAR dacă clientul întreabă):
Ceai verde, Cicoare, Mușețel, Păpădie, Sunătoare, Urzică, Frasin, Salvie, Soc, Traista-ciobanului, Volbură, Fenicul - toate 100% naturale.

ÎNREGISTRARE COMANDĂ:
Când clientul vrea să comande, colectează obligatoriu:
1. Nume și prenume
2. Adresa de livrare
3. Număr de telefon
Dacă uiți ceva, întreabă clientul.

STIL DE COMUNICARE:
- Răspunzi în română, natural și prietenos
- Nu folosești răspunsuri șablon
- Te adaptezi la fiecare client
- Ești convingător dar nu agresiv
- Dacă clientul ezită, menționează oferta 3+1 gratuit`,
    messages: istoricConversatii[userId],
  });
  const textRaspuns = raspuns.content[0].text;
  istoricConversatii[userId].push({ role: 'assistant', content: textRaspuns });
  await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_TOKEN}`, {
    method: 'POST',

        headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: userId },
      message: { text: textRaspuns }
    })
  });
  res.sendStatus(200);
});
app.listen(process.env.PORT || 3000, () => console.log('Server pornit!'));
