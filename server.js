// server.js (com cálculo HMAC padronizado)
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');

connectDB();
const app = express();

// Usamos o middleware express.json() padrão. Não precisamos mais do rawBody.
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO.');
});

app.post('/webhook/nuvemshop', async (req, res) => {
  const nuvemshopSignature = req.get('x-linkedstore-hmac-sha256');
  const secret = process.env.NUVEMSHOP_WEBHOOK_TOKEN;
  
  if (!nuvemshopSignature || !secret) {
    console.warn('⚠️ Webhook sem assinatura ou token secreto não configurado.');
    return res.status(401).send('Unauthorized');
  }

  // ===== MUDANÇA CRÍTICA NA LÓGICA DE VALIDAÇÃO =====
  // Criamos uma string canônica a partir do corpo JSON já processado.
  // Isso remove qualquer ambiguidade de formatação ou espaços.
  const canonicalString = JSON.stringify(req.body);

  const calculatedSignature = crypto
    .createHmac('sha256', secret)
    .update(canonicalString) // Usamos a nossa string padronizada
    .digest('hex');
  // ====================================================

  if (calculatedSignature !== nuvemshopSignature) {
    console.warn('⚠️ Assinatura HMAC inválida. Acesso negado.');
    console.log('   Assinatura Recebida:', nuvemshopSignature);
    console.log('   Assinatura Calculada:', calculatedSignature);
    return res.status(401).send('Unauthorized');
  }

  console.log('✅ Assinatura HMAC verificada com sucesso!');

  try {
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