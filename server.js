const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const supplierId = process.env.SUPPLIER_ID;
const trendyolUser = process.env.TRENDYOL_USER;
const trendyolPass = process.env.TRENDYOL_PASS;

const respondChannelId = process.env.RESPOND_CHANNEL_ID;
const respondApiToken = process.env.RESPOND_API_TOKEN;

// Servis ayakta mı kontrol
app.get('/', (req, res) => {
  res.send('OK');
});

// Aynı soruyu iki kez göndermemek için
const sentQuestionIds = new Set();

// Trendyol’dan cevap bekleyen soruları çek
async function fetchWaitingQuestions() {
  const url = `https://apigw.trendyol.com/integration/question-answer/sellers/${supplierId}/questions?status=WAITING_FOR_ANSWER`;

  const res = await axios.get(url, {
    auth: {
      username: trendyolUser,
      password: trendyolPass
    }
  });

  return res.data?.content || [];
}

// Respond’a mesaj gönder
async function sendToRespond(question) {
  await axios.post(
    `https://api.respond.io/v1/messages`,
    {
      channelId: respondChannelId,
      contact: {
        id: `trendyol_${question.id}`
      },
      message: {
        type: 'text',
        text: question.text
      }
    },
    {
      headers: {
        Authorization: `Bearer ${respondApiToken}`
      }
    }
  );

  console.log('Respond’a gönderildi:', question.id);
}

// Her 10 saniyede Trendyol’u kontrol et
async function pollLoop() {
  try {
    const questions = await fetchWaitingQuestions();

    for (const q of questions) {
      if (!q?.id) continue;
      if (sentQuestionIds.has(q.id)) continue;

      await sendToRespond(q);
      sentQuestionIds.add(q.id);
    }
  } catch (err) {
    console.error('Poll hatası:', err?.response?.data || err.message);
  }
}

setInterval(pollLoop, 10000);

// Respond’dan cevap gelince Trendyol’a yaz
app.post('/respond-webhook', async (req, res) => {
  try {
    const { contact, message } = req.body;

    const questionId = contact.id.replace('trendyol_', '');
    const text = message.text;

    const url = `https://apigw.trendyol.com/integration/question-answer/sellers/${supplierId}/questions/${questionId}/answers`;

    await axios.post(
      url,
      { text },
      {
        auth: {
          username: trendyolUser,
          password: trendyolPass
        }
      }
    );

    console.log('Trendyol’a cevap yazıldı:', questionId);
    res.sendStatus(200);
  } catch (err) {
    console.error('Cevap yazma hatası:', err?.response?.data || err.message);
    res.sendStatus(200);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('Running on port', port);
});
