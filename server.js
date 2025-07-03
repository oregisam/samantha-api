// server.js (INSEGURO - SEM VERIFICAÇÃO HMAC PARA TESTES)
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');

connectDB();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO (MODO INSEGURO).');
});

app.post('/webhook/nuvemshop', async (req, res) => {

  // ====================================================================
  // ===== AVISO: BLOCO DE VERIFICAÇÃO DE SEGURANÇA HMAC REMOVIDO! =====
  //
  // O servidor agora confiará em QUALQUER requisição recebida neste endpoint.
  // Use apenas para testes. A validação do token está desabilitada.
  //
  console.log('✅ Webhook recebido e aceito SEM VERIFICAÇÃO DE SEGURANÇA.');
  // ====================================================================

  try {
    // O resto da lógica continua igual: adiciona o job na fila do MongoDB
    const queueItem = new NotificationQueue({ payload: req.body });
    await queueItem.save();
    
    console.log(`📦 Webhook para pedido #${req.body.id || 'N/A'} enfileirado com sucesso.`);
    // Responde à Nuvemshop que o webhook foi recebido com sucesso
    res.status(200).send('Webhook enfileirado.');

  } catch (error) {
    console.error('❌ Erro ao enfileirar webhook no MongoDB:', error);
    res.status(500).send('Erro interno ao processar webhook.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de webhooks rodando na porta ${PORT}`);
});