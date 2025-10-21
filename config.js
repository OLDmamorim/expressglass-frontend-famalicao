// 🌐 Configuração Dinâmica - Variáveis de Ambiente
// Este ficheiro é injectado automaticamente pelo Netlify durante o build

// API_URL - URL base da API backend
// Desenvolvedor: Obter do ambiente dev local
// Produção: Obter do environment variable do Netlify
const API_URL = 
  window.EXPRESSGLASS_API_URL || // Injectado no HTML (prioritário)
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:8888/.netlify/functions'
    : 'https://expressglass-backend-famalicao.netlify.app/.netlify/functions');

console.log('🌐 Configuração carregada:', {
  API_URL,
  hostname: window.location.hostname
});

// Exportar para uso global
window.EXPRESSGLASS_CONFIG = {
  API_URL,
  isProduction: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
};

export default {
  API_URL,
  ...window.EXPRESSGLASS_CONFIG
};
