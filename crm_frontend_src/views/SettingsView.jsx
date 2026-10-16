import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Save, Server, Key, Smartphone, Bot,
  ShieldCheck, RefreshCw, CheckCircle2, AlertCircle, Sparkles
} from 'lucide-react';

export default function SettingsView({ onOpenWhatsAppModal, whatsappStatus, onRefreshStatus }) {
  const [settings, setSettings] = useState({
    evolutionApiUrl: '',
    globalApiKey: '',
    defaultInstance: 'principal',
    aiEnabled: false,
    aiModel: 'gpt-4o-mini',
    autoReplyNewLeads: false,
    welcomeMessageTemplate: 'Olá {{nome}}! Vi que você se interessou pelo nosso anúncio da campanha {{campanha}}. Como posso te ajudar hoje?'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setSettings(data);
      setSavedSuccess(true);
      if (onRefreshStatus) onRefreshStatus();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const isConnected = whatsappStatus?.connectionStatus === 'open';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-crm-darker p-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Configurações do Sistema</h2>
            <p className="text-xs text-crm-textMuted mt-0.5">Gerencie a conexão da Evolution API, instâncias de WhatsApp e automações de IA.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* WhatsApp Connection Card */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Instância de WhatsApp</h3>
                <p className="text-xs text-crm-textMuted">Status da conexão com os servidores do WhatsApp.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenWhatsAppModal}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20'
              }`}
            >
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Conectado ({whatsappStatus?.ownerJid?.split('@')[0]})
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Conectar WhatsApp (QR Code)
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-crm-text mb-1.5">Nome da Instância Ativa</label>
              <input
                type="text"
                value={settings.defaultInstance}
                onChange={(e) => setSettings({ ...settings, defaultInstance: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-crm-darker border border-crm-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-crm-text mb-1.5">Estado Atual</label>
              <div className="px-3.5 py-2.5 rounded-xl bg-crm-darker border border-crm-border text-xs flex items-center justify-between">
                <span className="text-crm-textMuted">Status do Canal:</span>
                <span className={`font-bold font-mono uppercase ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {whatsappStatus?.connectionStatus || 'Desconectado'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Evolution API Gateway Configuration */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Evolution API Backend Gateway</h3>
              <p className="text-xs text-crm-textMuted">Parâmetros de comunicação interna com o container da Evolution API.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-crm-text mb-1.5">URL da Evolution API</label>
              <input
                type="text"
                value={settings.evolutionApiUrl}
                onChange={(e) => setSettings({ ...settings, evolutionApiUrl: e.target.value })}
                placeholder="Digite a URL da Evolution API"
                className="w-full px-3.5 py-2.5 rounded-xl bg-crm-darker border border-crm-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-crm-text mb-1.5">Global API Key</label>
              <input
                type="text"
                value={settings.globalApiKey}
                onChange={(e) => setSettings({ ...settings, globalApiKey: e.target.value })}
                placeholder="Digite a Global API Key"
                className="w-full px-3.5 py-2.5 rounded-xl bg-crm-darker border border-crm-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>
        </div>

        {/* AI & Automation Message Template */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Mensagem Padrão de Boas-Vindas</h3>
              <p className="text-xs text-crm-textMuted">Disparada imediatamente quando um lead entra por anúncio.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-crm-text mb-1.5">
              Template (Variáveis disponíveis: &#123;&#123;nome&#125;&#125;, &#123;&#123;primeiro_nome&#125;&#125;, &#123;&#123;campanha&#125;&#125;)
            </label>
            <textarea
              value={settings.welcomeMessageTemplate}
              onChange={(e) => setSettings({ ...settings, welcomeMessageTemplate: e.target.value })}
              rows={3}
              className="w-full p-3.5 rounded-xl bg-crm-darker border border-crm-border text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-4">
          {savedSuccess && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" /> Configurações salvas com sucesso!
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-xs text-white transition-all shadow-lg shadow-emerald-500/20 ml-auto"
          >
            <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
