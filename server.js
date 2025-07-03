require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');

// Conecta ao banco de dados ao iniciar
connectDB();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Rota de saúde para verificar se o serviço está no ar
app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO.');
});

// Rota que recebe os webhooks da Nuvemshop
app.post('/webhook/nuvemshop', async (req, res) => {
  const token = req.get('X-Webhook-Token');
  if (!token || token !== process.env.NUVEMSHOP_WEBHOOK_TOKEN) {
    console.warn('⚠️ Tentativa de webhook com token inválido.');
    return res.status(401).send('Unauthorized');
  }

  try {
    // Cria um novo item na fila com o corpo da requisição
    const queueItem = new NotificationQueue({ payload: req.body });
    await queueItem.save();
    
    console.log(`📦 Webhook para pedido #${req.body.id} enfileirado com sucesso.`);
    // Responde IMEDIATAMENTE para a Nuvemshop
    res.status(200).send('Webhook enfileirado.');

  } catch (error) {
    console.error('❌ Erro ao enfileirar webhook no MongoDB:', error);
    res.status(500).send('Erro interno ao processar webhook.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de webhooks rodando na porta ${PORT}`);
});