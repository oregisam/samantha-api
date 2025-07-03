// server.js (com validação HMAC correta)
require('dotenv').config();
const express = require('express');
const crypto = require('crypto'); // Módulo de criptografia do Node.js
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');

// Conecta ao banco de dados ao iniciar
connectDB();

const app = express();

// IMPORTANTE: Modificamos o express.json para nos dar acesso ao "corpo cru" (raw body)
// da requisição, que é necessário para calcular a assinatura.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = process.env.PORT || 10000;

// Rota de saúde
app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO e pronto.');
});

// Rota que recebe os webhooks
app.post('/webhook/nuvemshop', async (req, res) => {
  
  // ===================== LÓGICA DE VALIDAÇÃO HMAC =====================
  const nuvemshopSignature = req.get('x-linkedstore-hmac-sha256');
  const secret = process.env.NUVEMSHOP_WEBHOOK_TOKEN;

  if (!nuvemshopSignature || !secret) {
    console.warn('⚠️ Webhook recebido sem assinatura ou token secreto não configurado.');
    return res.status(401).send('Unauthorized');
  }

  // Calculamos nossa própria assinatura usando o corpo cru da requisição e nosso segredo
  const calculatedSignature = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody) // Usamos o corpo cru, não o JSON processado
    .digest('hex');

  // Comparamos nossa assinatura com a que a Nuvemshop enviou
  if (calculatedSignature !== nuvemshopSignature) {
    console.warn('⚠️ Assinatura HMAC inválida. Acesso negado.');
    console.log('   Assinatura Recebida:', nuvemshopSignature);
    console.log('   Assinatura Calculada:', calculatedSignature);
    return res.status(401).send('Unauthorized');
  }

  console.log('✅ Assinatura HMAC verificada com sucesso!');
  // ====================================================================

  try {
    // Agora que a assinatura é válida, o corpo (req.body) já foi processado pelo Express e pode ser usado
    const queueItem = new NotificationQueue({ payload: req.body });
    await queueItem.save();
    
    console.log(`📦 Webhook para pedido #${req.body.id || 'N/A'} enfileirado com sucesso.`);
    res.status(200).send('Webhook enfileirado.');

  } catch (error) {
    console.error('❌ Erro ao enfileirar webhook no MongoDB:', error);
    res.status(500).send('Erro interno ao processar webhook.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de webhooks rodando na porta ${PORT}`);
});