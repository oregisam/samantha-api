// models/botStatus.js
const mongoose = require('mongoose');

const BotStatusSchema = new mongoose.Schema({
  // Usaremos um ID fixo para garantir que haja apenas um documento de status
  singletonId: { type: String, default: 'main_status', unique: true },
  status: { type: String, default: 'DISCONNECTED' }, // Ex: DISCONNECTED, WAITING_FOR_QR, CONNECTED
  qrCode: { type: String, default: '' }, // Armazenará a imagem do QR Code em formato Data URL
  lastUpdatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BotStatus', BotStatusSchema);