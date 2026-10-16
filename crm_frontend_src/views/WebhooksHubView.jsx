import React, { useState } from 'react';
import {
  Webhook, Copy, Check, Sparkles, Send, Globe, Layers,
  Code2, ShieldCheck, ArrowRight, Zap, Play
} from 'lucide-react';

export default function WebhooksHubView({ onLeadCreated }) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  const [testLead, setTestLead] = useState({
    nome: 'Renato Albuquerque',
    telefone: '5534992019122',
    email: 'renato.albuquerque@empresa.com',
    campanha: 'Meta Ads - Escala de Vendas',
    valor: 2400.00,
    utm_source: 'instagram',
    utm_medium: 'stories_ad'
  });

  const webhookUrl = `${window.location.origin}/api/leads/webhook`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSimulateLead = async (e) => {
    e.preventDefault();
    setSimulating(true);
    setSimulationResult(null);

    try {
      const res = await fetch('/api/leads/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testLead.nome,
          phone: testLead.telefone,
          email: testLead.email,
          campaign_name: testLead.campanha,
          value: Number(testLead.valor),
          utm_source: testLead.utm_source,
          utm_medium: testLead.utm_medium
        })
      });
      const data = await res.json();
      setSimulationResult(data);
      if (onLeadCreated) onLeadCreated();
    } catch (err) {
      console.error(err);
      setSimulationResult({ success: false, error: err.message });
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-crm-darker p-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Hub de Ingestão de Anúncios &amp; Webhooks</h2>
            <p className="text-xs text-crm-textMuted mt-0.5">Receba leads do Meta Ads, Google Ads, Elementor, Hotmart, Kiwify e landing pages automaticamente.</p>
          </div>
        </div>
      </div>

      {/* Universal Webhook Endpoint Banner */}
      <div className="p-6 rounded-2xl glass-card border border-purple-500/30 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[11px] font-bold">ENDPOINT UNIVERSAL POST</span>
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">● Online &amp; Pronto</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">URL para Conectar seus Anúncios</h3>
            <div className="flex items-center gap-2 bg-crm-darker/80 p-2.5 rounded-xl border border-crm-border font-mono text-xs text-emerald-400 max-w-2xl">
              <span className="select-all truncate">{webhookUrl}</span>
            </div>
          </div>

          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all shadow-lg shadow-purple-600/30 whitespace-nowrap self-start lg:self-center"
          >
            {copiedUrl ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            {copiedUrl ? 'URL Copiada!' : 'Copiar URL do Webhook'}
          </button>
        </div>
      </div>

      {/* Two Column Section: Integrations Guide & Live Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Integration Cards */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Como Integrar em Cada Plataforma</h3>

          {/* Meta Ads */}
          <div className="p-5 rounded-2xl glass-card border border-crm-border space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Meta Lead Ads (Facebook &amp; Instagram)
              </h4>
              <span className="text-[10px] text-cyan-400 font-mono">Instantâneo</span>
            </div>
            <p className="text-xs text-crm-textMuted leading-relaxed">
              No Gerenciador de Anúncios da Meta ou via Zapier/Make, aponte os formulários de cadastro (Lead Ads) para a URL do Webhook acima. O lead cairá no funil e receberá o WhatsApp de boas-vindas em segundos.
            </p>
          </div>

          {/* Google Ads */}
          <div className="p-5 rounded-2xl glass-card border border-crm-border space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Google Ads (Extensão de Formulário de Lead)
              </h4>
              <span className="text-[10px] text-cyan-400 font-mono">Webhook Nativo</span>
            </div>
            <p className="text-xs text-crm-textMuted leading-relaxed">
              Cole a URL no campo de Webhook da Extensão de Formulário do Google Ads. O sistema extrai automaticamente o nome, telefone e palavras-chave de busca.
            </p>
          </div>

          {/* Elementor / Landing Pages */}
          <div className="p-5 rounded-2xl glass-card border border-crm-border space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Elementor / WordPress / Webflow
              </h4>
              <span className="text-[10px] text-cyan-400 font-mono">Form Action</span>
            </div>
            <p className="text-xs text-crm-textMuted leading-relaxed">
              Nas configurações do formulário da sua página, adicione a ação "Webhook" após o envio e cole a URL do endpoint.
            </p>
          </div>
        </div>

        {/* Right: Live Interactive Lead Simulator */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Simulador de Lead de Anúncio</h3>
            </div>
            <span className="text-[11px] text-amber-400 font-semibold">Teste em 1 Clique</span>
          </div>

          <p className="text-xs text-crm-textMuted">
            Preencha os campos abaixo para simular uma pessoa preenchendo um anúncio agora e veja o lead cair no CRM em tempo real:
          </p>

          <form onSubmit={handleSimulateLead} className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-crm-text mb-1">Nome do Lead</label>
                <input
                  type="text"
                  value={testLead.nome}
                  onChange={(e) => setTestLead({ ...testLead, nome: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-crm-darker border border-crm-border text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-crm-text mb-1">Telefone WhatsApp</label>
                <input
                  type="text"
                  value={testLead.telefone}
                  onChange={(e) => setTestLead({ ...testLead, telefone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-crm-darker border border-crm-border text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-crm-text mb-1">Nome da Campanha de Anúncio</label>
              <input
                type="text"
                value={testLead.campanha}
                onChange={(e) => setTestLead({ ...testLead, campanha: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-crm-darker border border-crm-border text-xs text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-crm-text mb-1">Valor Estimado da Venda (R$)</label>
                <input
                  type="number"
                  value={testLead.valor}
                  onChange={(e) => setTestLead({ ...testLead, valor: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-crm-darker border border-crm-border text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-crm-text mb-1">Origem (UTM Source)</label>
                <input
                  type="text"
                  value={testLead.utm_source}
                  onChange={(e) => setTestLead({ ...testLead, utm_source: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-crm-darker border border-crm-border text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={simulating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {simulating ? (
                'Disparando Webhook...'
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" /> Disparar Lead Teste no Funil Agora
                </>
              )}
            </button>
          </form>

          {simulationResult && (
            <div className={`p-4 rounded-xl text-xs font-mono border animate-fadeIn ${
              simulationResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              <p className="font-bold mb-1">{simulationResult.success ? '✅ SUCESSO:' : '❌ ERRO:'}</p>
              <pre className="text-[11px] overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(simulationResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
