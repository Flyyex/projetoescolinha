import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import {
  Search, Send, Phone, Tag, DollarSign, Calendar, MessageSquare,
  CheckCheck, Check, Clock, User, AlertCircle, Sparkles, Plus,
  ChevronRight, ChevronLeft, ArrowUpRight, Zap, Filter, Bot, UserCheck
} from 'lucide-react';

const CANNED_RESPONSES = [
  { id: '1', title: 'Boas-Vindas FLYEX + Links', text: 'Olá {{primeiro_nome}}! Bem-vindo à FLYEX 🚕.\n\nNossos drones operam 24h gerando rendimentos diários com saque via Pix.\n\n👉 Crie sua conta gratuita: https://SEU_APP.onrender.com/login.html\n📸 Instagram Oficial: https://www.instagram.com/SEU_PERFIL/\n💬 Grupo VIP Telegram: \n\nQual cota você gostaria de simular?' },
  { id: '2', title: 'Tabela Completa (R$ 30 até R$ 5.000)', text: '📊 *Frotas Disponíveis para Ativação FLYEX:*\n\n🟢 *Entrada:*\n• FlyEx Pulse: Cota R$ 30 (Rendimento Diário / 15 dias)\n• FlyEx Zephyr: Cota R$ 150 ➔ R$ 11,20/dia (Total R$ 336 / 30 dias)\n\n🟡 *Popular & Alta Demanda:*\n• FlyEx Dash: Cota R$ 350 ➔ R$ 30/dia (Total R$ 900 / 30 dias)\n• FlyEx Swift: Cota R$ 600 ➔ R$ 68/dia (Total R$ 2.720 / 40 dias)\n• FlyEx Falcon: Cota R$ 900 ➔ R$ 75/dia (Total R$ 3.375 / 45 dias)\n\n🟣 *VIP & Executivo:*\n• FlyEx Stratus: Cota R$ 1.500 ➔ R$ 150/dia (Total R$ 6.750 / 45 dias)\n• FlyEx Titan: Cota R$ 2.800 ➔ R$ 150/dia (Total R$ 9.000 / 60 dias)\n• FlyEx Apex: Cota R$ 5.000 ➔ R$ 250/dia (Total R$ 15.000 / 60 dias)\n\n⚡ Saques liberados todo dia via Pix!\n👉 Ative no app: https://SEU_APP.onrender.com/login.html' },
  { id: '3', title: 'FlyEx Swift (R$ 600 - R$ 68/dia)', text: 'A Cota da Frota *FlyEx Swift* custa R$ 600,00 e gera R$ 68,00 por dia durante 40 dias (Total: R$ 2.720,00).\n\n⚡ Liquidação diária às 00:00 com saque via Pix a qualquer hora!\n\n👉 Ative sua cota no app: https://SEU_APP.onrender.com/login.html\n💬 Grupo VIP com comprovantes: ' },
  { id: '4', title: 'Passo a Passo de Ativação Pix', text: 'Perfeito {{primeiro_nome}}! Para ativar sua cota na FLYEX:\n1️⃣ Acesse o app: https://SEU_APP.onrender.com/login.html\n2️⃣ Vá em Recarga Pix e gere o QR Code do valor da cota.\n3️⃣ Assim que pagar, o saldo cai na hora para você alugar o drone!\n\n💬 Suporte VIP Telegram: ' }
];

export default function LiveChatView({
  leads = [],
  activeLeadId,
  onSelectLead,
  stages = [],
  onUpdateLead,
  whatsappStatus,
  whatsappConnected,
  onOpenWhatsAppModal
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [mobilePane, setMobilePane] = useState('list'); // 'list' | 'chat'
  const messagesEndRef = useRef(null);

  const activeLead = leads.find(l => l.id === activeLeadId) || leads[0] || null;

  useEffect(() => {
    if (!activeLead) return;
    fetchMessages(activeLead.id);

    const socket = io();
    socket.on('chat:message', (payload) => {
      if (payload && payload.message) {
        const msg = payload.message;
        if (payload.leadId === activeLead.id || payload.leadId === activeLead.phone) {
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      }
    });

    return () => socket.disconnect();
  }, [activeLead?.id, activeLead?.phone]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async (leadId) => {
    try {
      const res = await fetch(`/api/messages/${leadId}`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    }
  };

  const handleSelectContact = (leadId) => {
    onSelectLead(leadId);
    setMobilePane('chat');
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeLead || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const tempMsg = {
      id: 'temp-' + Date.now(),
      fromMe: true,
      text: textToSend,
      timestamp: new Date().toISOString(),
      status: 'sending'
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: activeLead.id,
          phone: activeLead.phone,
          text: textToSend
        })
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? data.message : m));
      }
    } catch (err) {
      console.error('Erro ao enviar:', err);
      setMessages(prev => prev.map(m => m.id === tempMsg.id ? { ...m, status: 'error' } : m));
    } finally {
      setSending(false);
    }
  };

  const handleApplyCanned = (text) => {
    const firstName = (activeLead?.name || '').split(' ')[0] || '';
    const formatted = text
      .replace(/\{\{nome\}\}/g, activeLead?.name || '')
      .replace(/\{\{primeiro_nome\}\}/g, firstName)
      .replace(/\{\{campanha\}\}/g, activeLead?.campaign || '');
    setInputText(formatted);
    setShowCanned(false);
  };

  const filteredLeads = leads.filter(lead => {
    const name = lead.name || '';
    const phone = lead.phone || '';
    const campaign = lead.campaign || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm) ||
      campaign.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = stageFilter === 'all' || lead.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  const getStageInfo = (stageId) => {
    return stages.find(s => s.id === stageId) || { title: 'Novo', color: '#FF6B00' };
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#04060C] text-slate-100 relative">
      {/* 1. Contacts Sidebar (Hidden on mobile when chat is active) */}
      <div
        className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-orange-500/15 bg-[#070B16]/90 backdrop-blur-xl transition-all ${
          mobilePane === 'chat' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Search & Filters */}
        <div className="p-3 sm:p-4 border-b border-orange-500/15 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar por nome ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#04060C] border border-orange-500/20 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setStageFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer ${
                stageFilter === 'all'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'bg-[#0D1528] text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Todos ({leads.length})
            </button>
            {stages.map(stage => (
              <button
                key={stage.id}
                onClick={() => setStageFilter(stage.id)}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all text-[11px] cursor-pointer ${
                  stageFilter === stage.id
                    ? 'text-white shadow-md'
                    : 'bg-[#0D1528] text-slate-400 hover:text-white border border-slate-800'
                }`}
                style={stageFilter === stage.id ? { backgroundColor: stage.color } : {}}
              >
                {stage.title.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum contato encontrado
            </div>
          ) : (
            filteredLeads.map(lead => {
              const isSelected = activeLead?.id === lead.id;
              const stageInfo = getStageInfo(lead.stage);

              return (
                <div
                  key={lead.id}
                  onClick={() => handleSelectContact(lead.id)}
                  className={`p-3.5 sm:p-4 flex items-start gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-orange-500/15 border-l-4 border-l-orange-500'
                      : 'hover:bg-slate-800/30'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center text-white font-extrabold text-xs shadow-md">
                      {(lead.name || 'L').slice(0, 2).toUpperCase()}
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#070B16]"
                      style={{ backgroundColor: stageInfo.color }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">{lead.name}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {lead.updatedAt ? new Date(lead.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate mb-1">
                      {lead.lastMessage || 'Sem mensagens'}
                    </p>

                    <div className="flex items-center gap-1 flex-wrap">
                      <span
                        className="px-1.5 py-0.2 rounded text-[9px] font-bold"
                        style={{ backgroundColor: `${stageInfo.color}20`, color: stageInfo.color }}
                      >
                        {stageInfo.title.split(' ')[0]}
                      </span>
                      {lead.campaign && (
                        <span className="px-1.5 py-0.2 rounded bg-slate-900 text-[9px] text-orange-300/80 border border-orange-500/20 truncate max-w-[100px]">
                          {lead.campaign}
                        </span>
                      )}
                    </div>
                  </div>

                  {lead.unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 animate-pulse flex-shrink-0">
                      {lead.unreadCount}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Main Chat Conversation (Shown on mobile when chat is active) */}
      <div
        className={`flex-1 flex-col bg-[#04060C]/95 relative ${
          mobilePane === 'chat' ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeLead ? (
          <>
            {/* Chat Top Bar */}
            <div className="p-3 sm:p-4 border-b border-orange-500/15 bg-[#070B16]/90 backdrop-blur-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Back Button for Mobile */}
                <button
                  onClick={() => setMobilePane('list')}
                  className="p-1.5 rounded-lg bg-[#0D1528] border border-orange-500/20 text-orange-400 md:hidden flex-shrink-0"
                  aria-label="Voltar para a lista de contatos"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-xs shadow-md shadow-orange-500/20 flex-shrink-0">
                  {(activeLead.name || 'L').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-white text-xs sm:text-sm truncate">{activeLead.name}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                    <span className="font-mono">+{activeLead.phone}</span>
                    <span className="hidden xs:inline">•</span>
                    <span className="text-emerald-400 font-bold hidden xs:inline">R$ {Number(activeLead.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href={`https://wa.me/${activeLead.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1"
                  title="Abrir no WhatsApp Web"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">WhatsApp Web</span>
                </a>

                {stages.length > 0 && (
                  <select
                    value={activeLead.stage}
                    onChange={(e) => onUpdateLead && onUpdateLead(activeLead.id, { stage: e.target.value })}
                    className="px-2 py-1.5 rounded-xl bg-[#0D1528] border border-orange-500/20 text-[11px] font-bold text-white focus:outline-none focus:border-orange-500 cursor-pointer max-w-[90px] sm:max-w-none"
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#070B16]">{s.title.split(' ')[0]}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
              {!whatsappConnected && (
                <div
                  onClick={onOpenWhatsAppModal}
                  className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs flex items-center justify-between cursor-pointer hover:bg-orange-500/15 transition-all shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <span className="text-[11.5px]"><b>WhatsApp Offline:</b> Conecte o QR Code.</span>
                  </div>
                  <span className="underline font-bold text-[11px] flex-shrink-0">Conectar &gt;</span>
                </div>
              )}

              {messages.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center text-xl">
                    💬
                  </div>
                  <h4 className="text-sm font-bold text-white">Inicie uma conversa com {activeLead.name}</h4>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Envie as informações oficiais da FLYEX em 1 toque.
                  </p>
                  <button
                    onClick={() => handleApplyCanned(CANNED_RESPONSES[0].text)}
                    className="px-3.5 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold transition-all cursor-pointer"
                  >
                    ⚡ Boas-Vindas FLYEX
                  </button>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.fromMe;
                  return (
                    <div
                      key={msg.id || index}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-md lg:max-w-lg p-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-lg relative ${
                          isMe
                            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-tr-xs font-sans shadow-orange-500/15'
                            : 'bg-[#0E172C] text-slate-100 border border-orange-500/15 rounded-tl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <div className={`flex items-center justify-end gap-1 mt-1 text-[9.5px] ${isMe ? 'text-orange-100' : 'text-slate-400'}`}>
                          <span>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          {isMe && (
                            <span>
                              {msg.status === 'read' ? (
                                <CheckCheck className="w-3 h-3 text-cyan-300 inline" />
                              ) : msg.status === 'sending' ? (
                                <Clock className="w-3 h-3 inline animate-pulse" />
                              ) : (
                                <Check className="w-3 h-3 inline" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Canned Popover */}
            {showCanned && (
              <div className="absolute bottom-16 sm:bottom-20 left-3 right-3 sm:left-6 sm:right-6 p-3 sm:p-4 bg-[#0B1222] rounded-2xl border border-orange-500/30 shadow-2xl z-20 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span>Modelos de Resposta Rápida</span>
                  </div>
                  <button onClick={() => setShowCanned(false)} className="text-xs text-slate-400 hover:text-white cursor-pointer">Fechar</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CANNED_RESPONSES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleApplyCanned(c.text)}
                      className="p-2.5 text-left rounded-xl bg-[#070B16] hover:bg-orange-500/10 border border-slate-800 hover:border-orange-500/40 transition-all text-xs group cursor-pointer"
                    >
                      <p className="font-bold text-white group-hover:text-orange-400 mb-0.5">{c.title}</p>
                      <p className="text-slate-400 line-clamp-2 text-[10.5px]">{c.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 sm:p-4 border-t border-orange-500/15 bg-[#070B16]/90 backdrop-blur-xl">
              <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowCanned(!showCanned)}
                  className={`p-2 sm:p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
                    showCanned
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-[#0D1528] text-slate-300 border-orange-500/20 hover:border-orange-500/50'
                  }`}
                  title="Respostas Rápidas"
                >
                  <Zap className="w-4 h-4 text-orange-400" />
                  <span className="hidden sm:inline">Modelos</span>
                </button>

                <input
                  type="text"
                  placeholder="Mensagem..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-[#04060C] border border-orange-500/20 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 transition-all font-sans"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="p-2.5 sm:px-5 sm:py-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-orange-500/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 flex-shrink-0"
                >
                  {sending ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Enviar</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <MessageSquare className="w-12 h-12 text-slate-700 mb-3" />
            <h4 className="text-base font-bold text-slate-300">Nenhuma conversa selecionada</h4>
            <p className="text-xs text-slate-500 mt-1">Selecione um contato para abrir as mensagens.</p>
          </div>
        )}
      </div>
    </div>
  );
}
