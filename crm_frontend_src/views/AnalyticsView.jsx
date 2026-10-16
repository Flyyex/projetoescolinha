import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Users, DollarSign, Target, ArrowUpRight, BarChart3,
  PieChart as PieIcon, Flame, ShieldAlert, Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899'];

export default function AnalyticsView({ leads }) {
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, [leads]);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error(err);
    }
  };

  const wonLeads = leads.filter(l => l.stage === 'ganho');
  const totalRevenue = wonLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
  const totalPipeline = leads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
  const conversionRate = leads.length > 0 ? ((wonLeads.length / leads.length) * 100).toFixed(1) : 0;

  // Chart data: Leads by source
  const sourceCount = {};
  leads.forEach(l => {
    const src = (l.tags && l.tags[0]) || l.utm_source || 'Meta Ads';
    sourceCount[src] = (sourceCount[src] || 0) + 1;
  });
  const pieData = Object.keys(sourceCount).map((name, i) => ({
    name,
    value: sourceCount[name],
    color: COLORS[i % COLORS.length]
  }));

  const campaignBarData = (analytics?.campaigns || []).map(c => ({
    name: c.name.split(' - ')[0],
    leads: c.leads,
    revenue: c.revenue,
    spend: c.spend
  }));

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-crm-darker p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Performance de Anúncios &amp; Vendas</h2>
              <p className="text-xs text-crm-textMuted mt-0.5">Acompanhe o retorno das suas campanhas de tráfego pago (Meta Ads e Google Ads) em tempo real.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-crm-textMuted font-bold uppercase tracking-wider">Total de Leads</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-black text-white">{leads.length}</div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold mt-2">
            <ArrowUpRight className="w-3.5 h-3.5" /> +24% comparado à semana anterior
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-crm-textMuted font-bold uppercase tracking-wider">Vendas Fechadas</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">
            R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-crm-textMuted mt-2">
            {wonLeads.length} contratos fechados via WhatsApp
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-crm-textMuted font-bold uppercase tracking-wider">Pipeline em Negociação</span>
            <Target className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-white font-mono">
            R$ {totalPipeline.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-amber-400 mt-2 font-medium">
            Em propostas e qualificação
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-crm-textMuted font-bold uppercase tracking-wider">Taxa de Conversão</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-3xl font-black text-white">{conversionRate}%</div>
          <div className="text-[11px] text-emerald-400 mt-2 font-semibold">
            Acima da média de mercado (18%)
          </div>
        </div>
      </div>

      {/* Visual Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Leads by Traffic Source */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Leads por Canal de Tráfego</h3>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graph 2: Revenue by Campaign */}
        <div className="p-6 rounded-2xl glass-card border border-crm-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Receita por Campanha (R$)</h3>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignBarData}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} name="Receita Gerada (R$)" />
                <Bar dataKey="spend" fill="#ef4444" radius={[6, 6, 0, 0]} name="Gasto em Anúncios (R$)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="p-6 rounded-2xl glass-card border border-crm-border">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Desempenho por Campanha de Tráfego</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-crm-border/60 text-crm-textMuted uppercase text-[10px]">
              <tr>
                <th className="pb-3">Campanha</th>
                <th className="pb-3">Canal</th>
                <th className="pb-3">Leads</th>
                <th className="pb-3">Gasto</th>
                <th className="pb-3">Faturamento</th>
                <th className="pb-3">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-border/30">
              {(analytics?.campaigns || []).map(camp => (
                <tr key={camp.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 font-semibold text-white">{camp.name}</td>
                  <td className="py-3 text-cyan-400 font-medium">{camp.source}</td>
                  <td className="py-3 font-mono">{camp.leads}</td>
                  <td className="py-3 font-mono text-rose-400">R$ {camp.spend.toFixed(2)}</td>
                  <td className="py-3 font-mono text-emerald-400 font-bold">R$ {camp.revenue.toFixed(2)}</td>
                  <td className="py-3 font-mono font-black text-amber-400">{camp.roas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
