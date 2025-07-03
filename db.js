const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // A Mongoose já gerencia um singleton de conexão, não precisamos nos preocupar
    // se esta função for chamada múltiplas vezes.
    if (mongoose.connection.readyState >= 1) {
      return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB com sucesso.');
  } catch (error) {
    console.error('❌ Falha ao conectar ao MongoDB:', error);
    // Em um ambiente de produção real, você poderia sair do processo se o DB for essencial
    // process.exit(1); 
  }
};

module.exports = connectDB;