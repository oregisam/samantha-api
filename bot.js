// bot.js (versão completa com QR Code na web)
require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const axios = require('axios');
const qrcode = require('qrcode'); // Usamos a biblioteca 'qrcode' para gerar a imagem
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const connectDB = require('./db');
const SessionFile = require('./models/sessionFile');
const NotificationQueue = require('./models/notificationQueue');
const BotStatus = require('./models/botStatus'); // Importamos o novo modelo de status

const AUTH_DIR = path.join(__dirname, 'baileys_auth');
let sock = null;
let debounceTimeout = null;

// --- LÓGICA DE BACKUP DA SESSÃO ---
async function uploadSession() {
  try {
    const files = await fs.readdir(AUTH_DIR);
    for (const file of files) {
      try {
        const data = await fs.readFile(path.join(AUTH_DIR, file));
        await SessionFile.findOneAndUpdate({ filename: file }, { data }, { upsert: true });
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`❌ Erro ao fazer backup do arquivo ${file}:`, error);
        }
      }
    }
    console.log('🔄 Backup da sessão (debounce) realizado no MongoDB.');
  } catch (error) {
    console.error('❌ Erro no processo de backup da sessão:', error);
  }
}

async function downloadSession() {
  try {
    const files = await SessionFile.find();
    if (!files.length) {
      console.log('ℹ️ Nenhum backup de sessão encontrado no MongoDB.');
      return false;
    }
    await fs.mkdir(AUTH_DIR, { recursive: true });
    for (const file of files) {
      await fs.writeFile(path.join(AUTH_DIR, file.filename), file.data);
    }
    console.log('✅ Sessão restaurada do MongoDB.');
    return true;
  } catch (error) {
    console.error('❌ Erro ao restaurar sessão:', error);
    return false;
  }
}

// --- LÓGICA DE CONEXÃO DO WHATSAPP ---
function connectToWhatsApp() {
  return new Promise(async (resolve, reject) => {
    console.log('Iniciando conexão com o WhatsApp...');
    await downloadSession();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    
    // Removemos a opção 'printQRInTerminal'
    sock = makeWASocket({ version, auth: state, browser: ['Samantha-Fashion-BOT', 'Chrome', '1.0'] });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(uploadSession, 5000);
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📱 QR Code recebido. Gerando imagem para a página web...');
        try {
          const qrImage = await qrcode.toDataURL(qr);
          await BotStatus.findOneAndUpdate(
            { singletonId: 'main_status' },
            { status: 'WAITING_FOR_QR', qrCode: qrImage, lastUpdatedAt: new Date() },
            { upsert: true }
          );
        } catch (e) {
          console.error('❌ Falha ao gerar ou salvar QR Code', e);
        }
      }
      
      if (connection === 'open') {
        console.log('✅ Conectado ao WhatsApp!');
        await BotStatus.findOneAndUpdate(
          { singletonId: 'main_status' },
          { status: 'CONNECTED', qrCode: '', lastUpdatedAt: new Date() },
          { upsert: true }
        );
        resolve(sock);
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`🔌 Conexão fechada. Reconectando: ${shouldReconnect}`);
        await BotStatus.findOneAndUpdate(
          { singletonId: 'main_status' },
          { status: 'DISCONNECTED', qrCode: '', lastUpdatedAt: new Date() },
          { upsert: true }
        );

        if (shouldReconnect) {
          setTimeout(connectToWhatsApp, 5000);
        } else {
          const err = new Error('❌ Logout forçado. Delete a sessão no DB e acesse a página /status para um novo QR Code.');
          console.error(err);
          reject(err);
        }
      }
    });
  });
}

// --- LÓGICA DE PROCESSAMENTO DA FILA ---
async function processQueue() {
  console.log('📡 Iniciando processador de fila...');
  while (true) {
    const job = await NotificationQueue.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'processing', processedAt: new Date() } },
      { sort: { createdAt: 1 } }
    );
    if (job) {
      try {
        console.log(`🔨 Processando notificação para o evento: ${job.payload.event}, ID: ${job.payload.id}`);
        await handleOrderEvent(job.payload);
        await NotificationQueue.updateOne({ _id: job._id }, { status: 'completed' });
        console.log(`✔ Notificação para o ID ${job.payload.id} processada com sucesso.`);
      } catch (error) {
        console.error(`❌ Erro ao processar job ${job._id}:`, error.message);
        await NotificationQueue.updateOne({ _id: job._id }, { status: 'failed', error: error.message });
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// --- LÓGICA DA MENSAGEM ---
async function handleOrderEvent(webhookPayload) {
  if (!sock) throw new Error("Socket do WhatsApp não está pronto.");
  const { event, id: orderId } = webhookPayload;
  const storeId = process.env.NUVEMSHOP_STORE_ID;
  const accessToken = process.env.NUVEMSHOP_ACCESS_TOKEN;
  if (!storeId || !accessToken) {
    throw new Error("As variáveis de ambiente NUVEMSHOP_STORE_ID e NUVEMSHOP_ACCESS_TOKEN não estão configuradas.");
  }
  console.log(`Buscando detalhes do pedido ${orderId}...`);
  const response = await axios.get(
    `https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`,
    { headers: { 'Authentication': `bearer ${accessToken}`, 'User-Agent': 'SamanthaAPI (oregisam@email.com)' } }
  );
  const orderData = response.data;
  const customer = orderData.customer;
  if (!customer) throw new Error("Dados do cliente não encontrados no pedido.");
  const customerPhone = customer.phone;
  if (!customerPhone) throw new Error("O cliente neste pedido não possui número de telefone cadastrado.");
  const customerName = customer.name.split(' ')[0];
  let message = '';
  switch (event) {
    case 'order/paid':
      message = `Olá, ${customerName}! 💖\n\nSeu pagamento do pedido #${orderData.number} foi confirmado com sucesso! ✨\n\nJá estamos separando suas peças maravilhosas da Samantha Fashion com todo o carinho. Em breve, elas estarão a caminho!\n\nCom amor,\nEquipe Samantha Fashion 🛍️`;
      break;
    case 'order/fulfilled':
      const trackingNumber = orderData.shipping_tracking_number || 'não disponível';
      const trackingUrl = orderData.shipping_tracking_url || '';
      message = `Oba, ${customerName}! 🎀\n\nSua comprinha da Samantha Fashion já está a caminho! 🚚💨\n\nSeu pedido #${orderData.number} foi enviado e você pode acompanhá-lo por aqui:\n\n*Código de Rastreio:* ${trackingNumber}\n*Link:* ${trackingUrl}\n\nMal podemos esperar para ver você arrasando com seus novos looks! 👗✨`;
      break;
    case 'order/cancelled':
        message = `Olá, ${customerName}. 🌸\n\nPassando para avisar que o seu pedido #${orderData.number} da Samantha Fashion foi cancelado.\n\nSe tiver qualquer dúvida ou se precisar de ajuda para fazer um novo pedido, estamos à sua disposição!\n\nCom carinho,\nEquipe Samantha Fashion 🛍️`;
        break;
  }
  if (message) {
    const jid = `${customerPhone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
  } else {
    console.log(`Nenhuma mensagem configurada para o evento "${event}". Nenhuma ação foi tomada.`);
  }
}

// --- INICIALIZAÇÃO ---
async function start() {
  try {
    await connectDB();
    await connectToWhatsApp();
    processQueue();
  } catch (error) {
    console.error("❌ Falha crítica na inicialização, o bot não será iniciado:", error);
    process.exit(1);
  }
}

start();