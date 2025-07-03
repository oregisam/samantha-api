const mongoose = require('mongoose');

const NotificationQueueSchema = new mongoose.Schema({
  payload: {
    type: Object,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  error: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // Deleta automaticamente jobs com mais de 14 dias para manter a coleção limpa
    expires: '14d',
  },
  processedAt: {
    type: Date,
  },
});

module.exports = mongoose.model('NotificationQueue', NotificationQueueSchema);