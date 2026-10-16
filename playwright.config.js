module.exports = {
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3100', locale: 'pt-BR' },
  webServer: { command: 'node server.js', port: 3100, env: { PORT: '3100' }, reuseExistingServer: true },
};
