// server.js (com correção do favicon)
require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const NotificationQueue = require('./models/notificationQueue');
const BotStatus = require('./models/botStatus');

connectDB();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Servidor de Webhooks para Nuvemshop está ATIVO.');
});

// ================== NOVA ROTA PARA FAVICON ==================
// Impede que o navegador mostre um erro de "ícone não encontrado"
app.get('/favicon.ico', (req, res) => res.status(204).send());
// ==========================================================

// Rota para exibir o status e o QR Code
app.get('/status', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  
  try {
    const botStatus = await BotStatus.findOne({ singletonId: 'main_status' });
    let statusMessage = 'Verificando status...';
    let bodyContent = '<p>Aguarde, atualizando...</p>';

    if (botStatus) {
      switch (botStatus.status) {
        case 'CONNECTED':
          statusMessage = '✅ Conectado!';
          bodyContent = `<h1>✅ Bot Conectado</h1><p>O bot da Samantha Fashion está online e pronto para enviar notificações.</p>`;
          break;
        case 'WAITING_FOR_QR':
          statusMessage = '📱 Escaneie o QR Code';
          bodyContent = `<h1>📱 Escaneie para Conectar</h1><p>Abra o WhatsApp no seu celular e escaneie o código abaixo.</p><img src="${botStatus.qrCode}" alt="QR Code do WhatsApp" style="max-width: 300px;"/>`;
          break;
        case 'DISCONNECTED':
        default:
          statusMessage = '❌ Desconectado';
          bodyContent = `<h1>❌ Bot Desconectado</h1><p>O bot não está conectado ao WhatsApp. Verifique os logs do worker na Render.</p>`;
          break;
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="10">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Status do Bot - ${statusMessage}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; text-align: center; }
          div { padding: 40px; background-color: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          h1 { color: #333; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div>
          ${bodyContent}
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Erro ao buscar status do bot:', error);
    res.status(500).send('<h1>Erro interno ao buscar status.</h1>');
  }
});

// A rota de webhook (versão insegura para testes)
app.post('/webhook/nuvemshop', async (req, res) => {
  console.log('✅ Webhook recebido e aceito SEM VERIFICAÇÃO DE SEGURANÇA.');
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