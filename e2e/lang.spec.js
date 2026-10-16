const { test, expect } = require('@playwright/test');

test('modal abre e troca para inglês no login', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await expect(page.locator('#modal-lang-login')).toBeVisible();
  await expect(page.locator('#modal-lang-login button[data-lang]')).toHaveCount(4);
  await page.click('#modal-lang-login button[data-lang="en"]');
  await expect(page.locator('#btn-tab-login')).toContainText('Sign In');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});

test('idioma persiste após reload', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="es"]');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('truckauto_lang'))).toBe('es');
  await page.reload();
  await expect(page.locator('.auth-subtitle')).toContainText('Gestión');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-ES');
});

test('ícones sobrevivem à troca de idioma', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="en"]');
  await expect(page.locator('#btn-tab-login i')).toHaveCount(1);
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="pt"]');
  await expect(page.locator('#btn-tab-login')).toContainText('Entrar');
});

test('ZH persiste após reload + document.lang zh-CN', async ({ page }) => {
  await page.goto('/login');
  await page.click('#btn-lang-login');
  await page.click('#modal-lang-login button[data-lang="zh"]');
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('truckauto_lang'))).toBe('zh');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.evaluate(() => localStorage.getItem('truckauto_lang'))).resolves.toBe('zh');
});

const LANGS = { pt: 'pt-BR', es: 'es-ES', en: 'en-US', zh: 'zh-CN' };

async function rawKeyEchoes(page) {
  return page.$$eval('[data-i18n]', (els) =>
    els
      .filter((el) => /^[a-z]+\.[a-zA-Z.]+$/.test((el.textContent || '').trim()))
      .map((el) => el.getAttribute('data-i18n')));
}

for (const [lang, htmlLang] of Object.entries(LANGS)) {
  test(`sweep sem chave crua em /login (${lang})`, async ({ page }) => {
    await page.goto('/login');
    await page.evaluate((l) => { localStorage.setItem('truckauto_lang', l); }, lang);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', htmlLang);
    await expect.poll(() => rawKeyEchoes(page)).toEqual([]);
  });

  test(`sweep /app load-only sem login (${lang})`, async ({ page }) => {
    // Só carrega a página: sem login, sem cliques que mudem estado, sem submits.
    await page.addInitScript((l) => { localStorage.setItem('truckauto_lang', l); }, lang);
    await page.goto('/app');
    // /app sem token redireciona a /login; i18n.js dá boot nas duas.
    await expect.poll(async () => page.evaluate(() => document.documentElement.lang)).toBe(htmlLang);
    await expect.poll(() => rawKeyEchoes(page)).toEqual([]);
  });
}
