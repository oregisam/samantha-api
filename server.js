// server.js (com logging detalhado)
require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');

// Conecta ao banco de dados ao iniciar
connectDB();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Rota de saúde para verificar se o serviço está no ar
app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO.');
});

// Rota que recebe os webhooks da Nuvemshop
app.post('/webhook/nuvemshop', async (req, res) => {
  
  // ===================== NOVO CÓDIGO DE LOG =====================
  console.log('\n---------- NOVO WEBHOOK RECEBIDO ----------');
  console.log('Data/Hora:', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  // Imprime todos os cabeçalhos para podermos ver o token exato
  console.log('Cabeçalhos (Headers):', JSON.stringify(req.headers, null, 2)); 
  // Imprime o corpo da requisição
  console.log('Corpo (Body):', JSON.stringify(req.body, null, 2));
  console.log('-------------------------------------------\n');
  // ==========================================================

  const token = req.get('x-webhook-token'); // O header da Nuvemshop é em minúsculas
  
  if (!token || token !== process.env.NUVEMSHOP_WEBHOOK_TOKEN) {
    console.warn('⚠️ Tentativa de webhook com token inválido.');
    return res.status(401).send('Unauthorized');
  }

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