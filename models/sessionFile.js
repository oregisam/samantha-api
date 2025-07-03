const mongoose = require('mongoose');

const SessionFileSchema = new mongoose.Schema({
  filename: { type: String, required: true, unique: true },
  data: { type: Buffer, required: true }
});

module.exports = mongoose.model('SessionFile', SessionFileSchema);