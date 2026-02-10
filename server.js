const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const supplierId = process.env.SUPPLIER_ID;       // Trendyol Satıcı ID (Cari ID)
const trendyolUser = process.env.TRENDYOL_USER;   // API Key
const trendyolPass = process.env.TRENDYOL_PASS;   // API Secret

const respondChannelId = process.env.RESPOND_CHANNEL_ID; // cc_...
const respondApiToken = process.env.RESPOND_API_TOKEN;   // rpa_...

app.get('/', (req, res) => res.send('OK'));

// Aynı soruyu iki kez göndermemek için basit hafıza
const sentQuestionIds = new Set();

// Trendyol: cevap bekleyen soruları çek (Trendyol'un önerdiği endpoint)
async function fetchWaitingQuestions() {
  const endDate = Date.now(); // ms epoch
  const startDate = endDate - (7 * 24 * 60 * 60 * 1000); // son 7 gün (istersen 30 gün yaparız)

  const url =
    `https://apigw.trendyol.com/integration/qna/sellers/${supplierId}/questions/filter` +
    `?startDate=${startDate}&endDate=${endDate}&status=WAITING_FOR_ANSWER`;

  const res = await axios.get(url, {
    auth: { username: trendyolUser, password: trendyolPass }
  });

  // Trendyol çoğu listede content döndürür
  return res.data?.content || [];
}

// Respond’a mesaj gönder
async function sendToRespond(question) {
  await axios.post(
    `https://api.respond.io/v1/messages`,
    {
      channelId: respondChannelId,
      contact: { id: `trendyol_${question.id}` },
      message: { type: 'text', text: question.text }
    },
    { headers: { Authorization: `Bearer ${respondApiToken}` } }
  );

  console.log('Respond’a gönderildi:', question.id);
}

// 10 sn’de bir Trendyol sorularını çek
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

// Respond’dan cevap gelince Trendyol’a bas (şimdilik eski /qna cevap endpoint'i sizde çalışıyorsa bunu kullanacağız)
app.post('/respond-webhook', async (req, res) => {
  try {
    const { contact, message } = req.body || {};
    const questionId = (contact?.id || '').replace('trendyol_', '');
    const text = message?.text;

    if (!questionId || !text) return res.sendStatus(200);

    // Trendyol QnA cevap endpoint’i (bazı hesaplarda /qna, bazılarında /question-answer olabilir)
    const url = `https://apigw.trendyol.com/integration/qna/sellers/${supplierId}/questions/${questionId}/answers`;

    await axios.post(
      url,
      { text },
      { auth: { username: trendyolUser, password: trendyolPass } }
    );

    console.log('Trendyol’a cevap yazıldı:', questionId);
    res.sendStatus(200);
  } catch (err) {
    console.error('Cevap yazma hatası:', err?.response?.data || err.message);
    res.sendStatus(200);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Running on port', port));
