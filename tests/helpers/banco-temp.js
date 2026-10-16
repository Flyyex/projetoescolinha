// Ajuda comum dos testes HTTP do Programa Social.
//
// Os testes sobem o servidor de verdade, e o servidor usa data.json. Se cada
// arquivo de teste mexesse no mesmo arquivo, dois testes rodando em paralelo
// (que e o padrao do node --test) escreveriam um por cima do outro -- e um
// teste que caasse no meio deixaria o data.json real corrompido.
//
// A solucao e cada arquivo apontar DB_FILE para uma COPIA temporaria. O
// arquivo de verdade nunca e tocado por teste.

const fs = require('fs');
const os = require('os');
const path = require('path');

function criarBancoTemporario(nome) {
  const origem = path.join(__dirname, '..', 'data.json');
  const destino = path.join(os.tmpdir(), `truckauto-teste-${nome}-${process.pid}.json`);
  if (fs.existsSync(origem)) {
    fs.copyFileSync(origem, destino);
  } else {
    fs.writeFileSync(destino, JSON.stringify({ users: [], transactions: [], contracts: [], products: [] }, null, 2), 'utf-8');
  }
  return destino;
}

function limparBancoTemporario(arquivo) {
  try {
    if (arquivo && fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  } catch (e) { /* limpando o cache nao pode derrubar o teste */ }
}

module.exports = { criarBancoTemporario, limparBancoTemporario };