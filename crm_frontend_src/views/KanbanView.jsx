import React, { useState } from 'react';
import {
  DollarSign, Plus, MessageSquare, Phone, MoreVertical,
  ChevronRight, ChevronLeft, Sparkles, Filter, CheckCircle2, ArrowRight,
  ExternalLink, UserCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function KanbanView({ leads, stages, onUpdateLead, onSelectLead, onOpenNewLeadModal, onSimulateAdLead }) {
  const [selectedTag, setSelectedTag] = useState('all');
  const [activeMobileStage, setActiveMobileStage] = useState('all');

  const handleMoveStage = (leadId, nextStageId) => {
    onUpdateLead(leadId, { stage: nextStageId });
    if (nextStageId === 'ganho') {
      confetti({
        particleCount: 140,
        spread: 90,
        origin: { y: 0.6 }
      });
    }
  };

  const allTags = Array.from(new Set(leads.flatMap(l => l.tags || [])));

  const filteredLeads = leads.filter(l => {
    if (selectedTag === 'all') return true;
    return l.tags?.includes(selectedTag);
  });

  const totalPipelineRevenue = filteredLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#04060C] p-3 sm:p-6 relative">
      {/* Top Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Funil de Vendas 3D</h2>
            <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[11px] sm:text-xs font-extrabold font-mono shadow-lg shadow-orange-500/10">
              Pipeline: R$ {totalPipelineRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Arraste ou avance os leads capturados nos anúncios em cada etapa comercial.</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Tag Filter */}
          <div className="flex items-center gap-1 bg-[#0D1528] border border-orange-500/20 px-2.5 py-1.5 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer text-xs"
            >
              <option value="all" className="bg-[#070B16]">Todas as Tags</option>
              {allTags.map(t => (
                <option key={t} value={t} className="bg-[#070B16]">{t}</option>
              ))}
            </select>
          </div>

          <button
            onClick={onOpenNewLeadModal}
            className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold transition-all shadow-lg shadow-orange-500/25 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Lead</span>
          </button>
        </div>
      </div>

      {/* Mobile Stage Selector Tabs */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar text-xs">
        <button
          onClick={() => setActiveMobileStage('all')}
          className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap transition-all ${
            activeMobileStage === 'all'
              ? 'bg-orange-500 text-white shadow-md'
              : 'bg-[#0D1528] text-slate-400 border border-slate-800'
          }`}
        >
          Todas ({filteredLeads.length})
        </button>
        {stages.map(s => {
          const count = filteredLeads.filter(l => l.stage === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setActiveMobileStage(s.id)}
              className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all text-[11px] ${
                activeMobileStage === s.id
                  ? 'text-white shadow-md'
                  : 'bg-[#0D1528] text-slate-400 border border-slate-800'
              }`}
              style={activeMobileStage === s.id ? { backgroundColor: s.color } : {}}
            >
              {s.title.split(' ')[0]} ({count})
            </button>
          );
        })}
      </div>

      {/* Kanban Board Columns */}
      <div className="flex-1 flex gap-3 sm:gap-5 overflow-x-auto pb-4 -mx-1 px-1">
        {stages
          .filter(stage => activeMobileStage === 'all' || activeMobileStage === stage.id)
          .map((stage, sIdx) => {
            const stageLeads = filteredLeads.filter(l => l.stage === stage.id);
            const stageSum = stageLeads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);

            return (
              <div
                key={stage.id}
                className="w-72 sm:w-84 flex-shrink-0 flex flex-col rounded-2xl bg-[#090E1D]/80 border border-orange-500/15 backdrop-blur-xl overflow-hidden shadow-2xl"
              >
                {/* Column Header */}
                <div className="p-3 sm:p-4 border-b border-orange-500/15 bg-[#060A14]/90 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-lg" style={{ backgroundColor: stage.color, boxShadow: `0 0 10px ${stage.color}` }} />
                    <h3 className="font-extrabold text-white text-xs sm:text-sm truncate">{stage.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400 font-bold">
                      R$ {stageSum.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-900 text-[10px] sm:text-xs font-black text-slate-300 border border-slate-700">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {/* Column Cards List */}
                <div className="flex-1 p-2.5 sm:p-3 space-y-2.5 sm:space-y-3 overflow-y-auto max-h-[calc(100vh-220px)]">
                  {stageLeads.length === 0 ? (
                    <div className="h-28 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-800 rounded-xl">
                      <span className="text-xs text-slate-500">Nenhum lead nesta etapa</span>
                    </div>
                  ) : (
                    stageLeads.map(lead => (
                      <div
                        key={lead.id}
                        className="glass-3d-card p-3 sm:p-4 rounded-xl cursor-pointer group relative"
                        onClick={() => onSelectLead(lead.id)}
                      >
                        {/* Top Row: Name & Stage Mover */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center text-[10px] sm:text-xs font-black flex-shrink-0">
                              {lead.name ? lead.name[0].toUpperCase() : 'L'}
                            </div>
                            <h4 className="font-extrabold text-xs sm:text-sm text-white truncate group-hover:text-orange-400 transition-colors">
                              {lead.name}
                            </h4>
                          </div>

                          {/* Quick Stage Controls */}
                          <div className="flex items-center gap-1 opacity-90 transition-opacity" onClick={e => e.stopPropagation()}>
                            {sIdx > 0 && (
                              <button
                                onClick={() => handleMoveStage(lead.id, stages[sIdx - 1].id)}
                                className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs cursor-pointer"
                                title="Voltar Etapa"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {sIdx < stages.length - 1 && (
                              <button
                                onClick={() => handleMoveStage(lead.id, stages[sIdx + 1].id)}
                                className="w-6 h-6 rounded-md bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center text-xs cursor-pointer shadow-md shadow-orange-500/20"
                                title="Avançar Etapa"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Phone & Campaign */}
                        <div className="space-y-1 mb-2 sm:mb-3 text-xs text-slate-400">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                            <Phone className="w-3 h-3 text-emerald-400" />
                            <span>+{lead.phone}</span>
                          </div>
                          {lead.campaign && (
                            <div className="text-[10px] text-orange-300/80 truncate font-semibold">
                              🎯 {lead.campaign}
                            </div>
                          )}
                        </div>

                        {/* Bottom Row: Value & Direct WhatsApp Action */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                          <span className="text-xs font-mono font-black text-emerald-400">
                            R$ {Number(lead.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                          </span>

                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <a
                              href={`https://wa.me/${lead.phone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 sm:p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                              title="WhatsApp"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span className="hidden xs:inline">WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
