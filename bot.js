require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const connectDB = require('./db');
const SessionFile = require('./models/sessionFile');
const NotificationQueue = require('./models/notificationQueue');

const AUTH_DIR = path.join(__dirname, 'baileys_auth');
let sock = null;

// --- LÓGICA DE BACKUP DA SESSÃO ---
async function uploadSession() {
  try {
    const files = await fs.readdir(AUTH_DIR);
    for (const file of files) {
      const data = await fs.readFile(path.join(AUTH_DIR, file));
      await SessionFile.findOneAndUpdate({ filename: file }, { data }, { upsert: true });
    }
    console.log('🔄 Backup da sessão realizado no MongoDB.');
  } catch (error) {
    console.error('❌ Erro no backup da sessão:', error);
  }
}

async function downloadSession() {
  try {
    const files = await SessionFile.find();
    if (!files.length) return false;
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
async function connectToWhatsApp() {
  console.log('Iniciando conexão com o WhatsApp...');
  await downloadSession();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  
  sock = makeWASocket({ version, auth: state, printQRInTerminal: true, browser: ['Nuvemshop-BOT', 'Chrome', '1.0'] });

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await uploadSession();
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') console.log('✅ Conectado ao WhatsApp!');
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 Conexão fechada. Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
      else console.error('❌ Logout forçado. Delete os dados da sessão no MongoDB para gerar um novo QR Code.');
    }
  });
}

// --- LÓGICA DE PROCESSAMENTO DA FILA ---
async function processQueue() {
  console.log('📡 Iniciando processador de fila...');
  while (true) {
    const job = await NotificationQueue.findOneAndUpdate(
      { status: 'pending' },
      { $set: { status: 'processing', processedAt: new Date() } },
      { sort: { createdAt: 1 } } // Pega o mais antigo primeiro
    );

    if (job) {
      try {
        console.log(`🔨 Processando notificação para pedido #${job.payload.id}`);
        await handleOrderEvent(job.payload.event, job.payload);
        await NotificationQueue.updateOne({ _id: job._id }, { status: 'completed' });
        console.log(`✔ Notificação para pedido #${job.payload.id} enviada.`);
      } catch (error) {
        console.error(`❌ Erro ao processar job ${job._id}:`, error);
        await NotificationQueue.updateOne({ _id: job._id }, { status: 'failed', error: error.message });
      }
    } else {
      // Se não houver jobs, espera 5 segundos antes de verificar novamente
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// --- LÓGICA DA MENSAGEM ---
async function handleOrderEvent(event, orderData) {
  if (!sock) throw new Error("Socket do WhatsApp não está pronto.");

  const customer = orderData.customer;
  const customerPhone = customer.phone;
  if (!customerPhone) throw new Error("Cliente não possui número de telefone.");
  
  const customerName = customer.name.split(' ')[0];
  let message = '';

  switch (event) {
    case 'order/paid':
      message = `Olá, ${customerName}! 🎉 Pagamento do seu pedido #${orderData.id} confirmado! Já estamos preparando tudo para o envio.`;
      break;
    case 'order/shipped':
      const trackingNumber = orderData.shipping_tracking_number || 'não disponível';
      const trackingUrl = orderData.shipping_tracking_url || '';
      message = `Olá, ${customerName}! 🚚 Boas notícias! Seu pedido #${orderData.id} foi enviado.\n\nCódigo de rastreio: ${trackingNumber}\nAcompanhe aqui: ${trackingUrl}`;
      break;
    // Adicione outros casos aqui (order/delivered, order/canceled, etc.)
  }

  if (message) {
    const jid = `${customerPhone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
  }
}

// --- INICIALIZAÇÃO ---
async function start() {
  await connectDB();
  connectToWhatsApp();
  processQueue();
}

start();