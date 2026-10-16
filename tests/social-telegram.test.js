// Token falso + fetch interceptado: nenhum HTTP real sai deste teste.
process.env.TELEGRAM_BOT_TOKEN = 'fake:token';
process.env.ADMIN_TELEGRAM_CHAT_ID = '123';
const enviados = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.telegram.org')) {
    enviados.push(JSON.parse((opts && opts.body) || '{}'));
    return { ok: true, json: async () => ({ ok: true }) };
  }
  return realFetch(url, opts);
};

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bot = require('../services/telegramBot');

const limpo = (t) => String(t || '').replace(/\*/g, '');

describe('notifyAdminSocialPost', () => {
  it('manda quem enviou, a rede e o link do video', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({
      operatorName: 'Maria', phone: '11988887777',
      network: 'tiktok', handle: '@maria.voos',
      videoUrl: 'https://www.tiktok.com/@maria.voos/video/7123'
    });
    assert.equal(enviados.length, 1, 'tem que sair 1 mensagem');
    const t = limpo(enviados[0].text);
    assert.match(t, /Maria/);
    assert.match(t, /11988887777/);
    assert.match(t, /tiktok/i);
    assert.match(t, /@maria\.voos/);
    assert.match(t, /7123/, 'o link precisa aparecer para o admin abrir e assistir');
  });

  it('nao quebra nem vazia texto com campos em branco', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({});
    assert.equal(enviados.length, 1);
    const t = limpo(enviados[0].text);
    assert.ok(!/undefined|NaN|\[object/.test(t), 'sem undefined/NaN: ' + t);
    assert.ok(t.length > 20, 'a mensagem precisa ter conteudo');
  });

  it('funciona com handle vazio (pode nao ter @)', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({
      operatorName: 'Joao', phone: '119', network: 'instagram', handle: '', videoUrl: 'https://x/1'
    });
    const t = limpo(enviados[0].text);
    assert.match(t, /instagram/i);
    assert.ok(!/undefined|NaN/.test(t));
  });

  it('desabilita preview de link para o Telegram nao gerar cartao', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({
      operatorName: 'X', phone: '1', network: 'tiktok', handle: '@x', videoUrl: 'https://tiktok.com/@x/video/1'
    });
    assert.equal(enviados[0].disable_web_page_preview, true);
  });
});