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
    model: process.env.MODEL,
    max_tokens: 1024,
    system: `Ești asistentul magazinului MD SHOP. Răspunzi în română, natural și prietenos.
Ajuți clienții cu întrebări despre produse și comenzi.
Te adaptezi la fiecare client, nu folosești răspunsuri șablon.`,
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
