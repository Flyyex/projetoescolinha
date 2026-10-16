import React, { useState, useEffect } from 'react';
import { Zap, Plus, Check, Power, Bot, Clock, MessageSquare, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

export default function AutomationsView() {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    trigger: 'new_lead_meta',
    triggerValue: '',
    action: 'send_whatsapp',
    actionValue: '',
    delaySeconds: 5
  });

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    try {
      const res = await fetch('/api/automations');
      const data = await res.json();
      setAutomations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/automations/${id}/toggle`, { method: 'PATCH' });
      const updated = await res.json();
      setAutomations(prev => prev.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const created = await res.json();
      setAutomations(prev => [...prev, created]);
      setNewModalOpen(false);
      setFormData({
        name: '',
        trigger: 'new_lead_meta',
        triggerValue: '',
        action: 'send_whatsapp',
        actionValue: '',
        delaySeconds: 5
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-crm-darker p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Automações de Funil &amp; Disparos</h2>
              <p className="text-xs text-crm-textMuted mt-0.5">Responda leads de anúncios em segundos e automatize a passagem de etapas no funil.</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setNewModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" /> Criar Nova Regra
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-crm-textMuted font-semibold">Regras Ativas</span>
            <Power className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{automations.filter(a => a.enabled).length}</div>
          <p className="text-[11px] text-emerald-400 mt-1">Executando em tempo real</p>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-crm-textMuted font-semibold">Tempo Médio de 1º Contato</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white">3.8 segundos</div>
          <p className="text-[11px] text-cyan-400 mt-1">Aumento de +340% na taxa de conversão</p>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-crm-textMuted font-semibold">Disparos Hoje</span>
            <MessageSquare className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">84 mensagens</div>
          <p className="text-[11px] text-amber-400 mt-1">100% entregues via WhatsApp</p>
        </div>
      </div>

      {/* Automation Rules List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Regras Configuradas</h3>

        <div className="grid grid-cols-1 gap-4">
          {automations.map((auto) => (
            <div
              key={auto.id}
              className={`p-6 rounded-2xl border transition-all ${
                auto.enabled
                  ? 'glass-card border-crm-border hover:border-slate-600'
                  : 'bg-crm-dark/30 border-crm-border/40 opacity-60'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${auto.enabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">{auto.name}</h4>
                    <span className="text-xs text-crm-textMuted font-mono">ID: {auto.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(auto.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                      auto.enabled
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {auto.enabled ? 'Ativada' : 'Pausada'}
                  </button>
                </div>
              </div>

              {/* Visual Flow diagram */}
              <div className="p-4 rounded-xl bg-crm-darker/70 border border-crm-border flex flex-col md:flex-row items-center gap-4 text-xs">
                {/* Trigger */}
                <div className="flex-1 bg-crm-dark p-3 rounded-lg border border-crm-border w-full">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 block mb-1">Gatilho (Quando):</span>
                  <span className="font-semibold text-white">
                    {auto.trigger === 'new_lead_meta'
                      ? '📥 Novo Lead entrar via Anúncio Meta Ads'
                      : auto.trigger === 'keyword'
                      ? `💬 Lead enviar mensagem contendo: "${auto.triggerValue}"`
                      : '⏳ Lead não responder por 24 horas'}
                  </span>
                </div>

                <ArrowRight className="w-5 h-5 text-crm-textMuted hidden md:block flex-shrink-0" />

                {/* Action */}
                <div className="flex-1 bg-crm-dark p-3 rounded-lg border border-crm-border w-full">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">Ação (Executar):</span>
                  <span className="font-semibold text-white">
                    {auto.action === 'send_whatsapp'
                      ? `📱 Enviar WhatsApp após ${auto.delaySeconds || 5}s`
                      : `🔄 Mover para a etapa: "${auto.actionValue}"`}
                  </span>
                </div>
              </div>

              {auto.action === 'send_whatsapp' && (
                <div className="mt-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-300 font-sans italic">
                  "{auto.actionValue}"
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg glass-card rounded-2xl border border-crm-border shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Nova Automação de Funil</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-crm-text mb-1">Nome da Regra</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Resposta Rápida Black Friday"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-crm-text mb-1">Tipo de Gatilho</label>
                <select
                  value={formData.trigger}
                  onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="new_lead_meta">Novo Lead de Anúncio Meta Ads / Google</option>
                  <option value="keyword">Palavra-chave na mensagem do Lead</option>
                  <option value="no_reply_24h">Lead sem resposta há 24 horas</option>
                </select>
              </div>

              {formData.trigger === 'keyword' && (
                <div>
                  <label className="block text-xs font-semibold text-crm-text mb-1">Palavras-chave (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={formData.triggerValue}
                    onChange={(e) => setFormData({ ...formData, triggerValue: e.target.value })}
                    placeholder="preco, valor, pix, comprar, condicoes"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-crm-text mb-1">Ação a Executar</label>
                <select
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="send_whatsapp">Enviar Mensagem no WhatsApp</option>
                  <option value="move_stage">Mover para Outra Etapa do Funil</option>
                </select>
              </div>

              {formData.action === 'send_whatsapp' ? (
                <div>
                  <label className="block text-xs font-semibold text-crm-text mb-1">
                    Mensagem de WhatsApp (use &#123;&#123;primeiro_nome&#125;&#125;, &#123;&#123;campanha&#125;&#125;)
                  </label>
                  <textarea
                    value={formData.actionValue}
                    onChange={(e) => setFormData({ ...formData, actionValue: e.target.value })}
                    rows={3}
                    placeholder="Olá {{primeiro_nome}}! Vi que você se interessou pelo nosso produto..."
                    className="w-full p-3 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-crm-text mb-1">Destino da Etapa</label>
                  <select
                    value={formData.actionValue}
                    onChange={(e) => setFormData({ ...formData, actionValue: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="qualificado">Qualificado / Interesse</option>
                    <option value="proposta">Proposta Enviada</option>
                    <option value="ganho">Venda Fechada (Ganho)</option>
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white shadow-lg shadow-emerald-500/20"
                >
                  Salvar Automação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
