import React, { useState } from 'react';
import { X, Plus, User, Phone, Mail, DollarSign, Tag, Layers } from 'lucide-react';

export default function NewLeadModal({ isOpen, onClose, onCreateLead, stages }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    value: 1500,
    stage: 'novo',
    campaign: 'Meta Ads - Prospecção',
    tags: 'Meta Ads, Lead Qualificado',
    notes: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const tagList = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    onCreateLead({
      ...formData,
      value: Number(formData.value) || 0,
      tags: tagList
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md glass-card rounded-2xl border border-crm-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-crm-border/60 bg-crm-dark/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Cadastrar Novo Lead</h3>
              <p className="text-xs text-crm-textMuted">Adicione uma nova oportunidade ao funil comercial.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-crm-textMuted hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-crm-text mb-1">Nome Completo</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: João Paulo Silva"
              className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-crm-text mb-1">WhatsApp (com DDD)</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="5534992019122"
              className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white font-mono focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-crm-text mb-1">Valor da Venda (R$)</label>
              <input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-crm-text mb-1">Etapa Inicial</label>
              <select
                value={formData.stage}
                onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white focus:outline-none focus:border-emerald-500"
              >
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-crm-text mb-1">Campanha / Origem</label>
            <input
              type="text"
              value={formData.campaign}
              onChange={(e) => setFormData({ ...formData, campaign: e.target.value })}
              placeholder="Meta Ads - Escala de Vendas"
              className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-crm-text mb-1">Tags (separadas por vírgula)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="Meta Ads, Decisor, Lead Quente"
              className="w-full px-3 py-2 rounded-xl bg-crm-dark border border-crm-border text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/20"
            >
              Cadastrar Lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
