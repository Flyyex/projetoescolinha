import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Kanban, Zap, TrendingUp, Webhook, Settings,
  Download, Plus, Sparkles, CheckCircle2, AlertCircle, RefreshCw,
  Bell, Volume2, ShieldCheck, ChevronRight, Lock, Key, LogOut, UserCheck,
  FileSpreadsheet, Users, Activity, Radio, ArrowUpRight, Menu, X
} from 'lucide-react';
import io from 'socket.io-client';

import LiveChatView from './views/LiveChatView';
import KanbanView from './views/KanbanView';
import AutomationsView from './views/AutomationsView';
import AnalyticsView from './views/AnalyticsView';
import WebhooksHubView from './views/WebhooksHubView';
import SettingsView from './views/SettingsView';
import WhatsAppModal from './components/WhatsAppModal';
import NewLeadModal from './components/NewLeadModal';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('flyex_crm_token') ? true : false;
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('kanban'); // kanban | chat | automations | analytics | webhooks | settings
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [activeLeadId, setActiveLeadId] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  // 3D Mouse Movement Tracker
  const [mousePos, setMousePos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchInitialData();
    fetchWhatsAppStatus();

    const socket = io();

    socket.on('leads:update', (updatedLeads) => {
      setLeads(updatedLeads);
    });

    socket.on('leads:new', ({ lead }) => {
      setToastNotification(`🚀 Novo Lead: ${lead.name} (${lead.campaign || 'Meta Ads'})`);
      setTimeout(() => setToastNotification(null), 5000);
      playNotificationSound();
    });

    socket.on('leads:human_requested', ({ lead }) => {
      setToastNotification(`🚨 ATENDIMENTO: ${lead.name} quer falar com atendente!`);
      setTimeout(() => setToastNotification(null), 7000);
      playAlertSound();
    });

    socket.on('whatsapp:connection', () => {
      fetchWhatsAppStatus();
    });

    return () => socket.disconnect();
  }, [isAuthenticated]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  };

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('flyex_crm_token', data.token);
        setIsAuthenticated(true);
        setPasswordInput('');
      } else {
        setLoginError(data.message || 'Senha incorreta.');
      }
    } catch (err) {
      setLoginError('Erro de conexão com o servidor.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('flyex_crm_token');
    setIsAuthenticated(false);
  };

  const fetchInitialData = async () => {
    try {
      const [leadsRes, stagesRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/stages')
      ]);
      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setStages(Array.isArray(stagesData) ? stagesData : []);
      if (leadsData.length > 0 && !activeLeadId) {
        setActiveLeadId(leadsData[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWhatsAppStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setWhatsappStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateLead = async (leadId, updates) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const updated = await res.json();
      setLeads(prev => prev.map(l => l.id === leadId ? updated : l));
      return updated;
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateLead = async (leadData) => {
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const created = await res.json();
      setLeads(prev => [created, ...prev]);
      setActiveLeadId(created.id);
      setActiveTab('kanban');
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportCsv = () => {
    window.open('/api/leads/export/csv', '_blank');
  };

  const handleExportLookalike = () => {
    window.open('/api/leads/export/lookalike', '_blank');
  };

  const isConnected = whatsappStatus?.connectionStatus === 'open';
  const totalUnread = leads.reduce((acc, l) => acc + (l.unreadCount || 0), 0);
  const totalPipelineRevenue = leads.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
  const wonCount = leads.filter(l => l.stage === 'ganho').length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-[#04060C] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div
          className="mouse-spotlight bg-orange-500/15 w-[500px] h-[500px]"
          style={{ left: `${mousePos.x - 250}px`, top: `${mousePos.y - 250}px` }}
        />
        <div className="absolute top-10 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-[#0A0F1D]/90 border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <img src="/apple-touch-icon.png" alt="FlyEx" className="w-16 h-16 rounded-2xl shadow-xl shadow-orange-500/25 mb-4" />
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-wider text-white">FLYEX</h1>
              <span className="px-2.5 py-0.5 text-[10px] font-extrabold bg-orange-500/20 text-orange-400 border border-orange-500/40 rounded-full">CRM PRO 3D</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Central de Gestão de Frotas, Funis & WhatsApp
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-orange-400" />
                <span>Senha de Acesso Operacional</span>
              </label>
              <input
                type="password"
                placeholder="Digite a senha de administrador..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-[#04060C] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-mono"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-black text-sm shadow-lg shadow-orange-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Acessar Painel 3D</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-4 border-t border-slate-800/80 text-center">
            <span className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
              Sessão Criptografada • FLYEX Cloud
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#04060C] text-slate-100 relative">
      {/* 3D Interactive Mouse Spotlight */}
      <div
        className="mouse-spotlight bg-orange-500/10 w-[600px] h-[600px] hidden md:block"
        style={{ left: `${mousePos.x - 300}px`, top: `${mousePos.y - 300}px` }}
      />

      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden animate-fadeIn"
        />
      )}

      {/* 1. Left Sidebar (Desktop & Mobile Drawer) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 w-72 md:w-64 flex flex-col border-r border-orange-500/15 bg-[#070B16] md:bg-[#070B16]/90 backdrop-blur-2xl p-4 flex-shrink-0 z-50 transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          <div className="flex items-center gap-3">
            <img src="/apple-touch-icon.png" alt="FlyEx" className="w-10 h-10 rounded-xl shadow-lg shadow-orange-500/25" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-white text-base tracking-tight">FLYEX</h1>
                <span className="px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 text-[10px] font-extrabold border border-orange-500/30">PRO</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Gestão & Funis de Anúncios</p>
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 rounded-lg text-slate-400 hover:text-white md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => { setActiveTab('kanban'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'kanban'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Kanban className="w-4 h-4" />
            <span>Funil de Vendas (Kanban)</span>
          </button>

          <button
            onClick={() => { setActiveTab('chat'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-4 h-4" />
              <span>Live Chat WhatsApp</span>
            </div>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white animate-pulse">
                {totalUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('automations'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'automations'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Automações Anti-Ban</span>
          </button>

          <button
            onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Performance & UTMs</span>
          </button>

          <button
            onClick={() => { setActiveTab('webhooks'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'webhooks'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Webhook className="w-4 h-4" />
            <span>Hub de Integrações</span>
          </button>

          <button
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 border border-orange-400/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </button>
        </nav>

        {/* Quick Export Button */}
        <div className="my-3 space-y-1.5">
          <button
            onClick={handleExportCsv}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-bold text-slate-200 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-orange-400" />
            <span>Exportar Leads (CSV)</span>
          </button>
          <button
            onClick={handleExportLookalike}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-xs font-bold text-orange-400 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Lookalike (Meta Ads)</span>
          </button>
        </div>

        {/* WhatsApp Card */}
        <div
          onClick={() => { setIsQrModalOpen(true); setIsMobileMenuOpen(false); }}
          className="p-3.5 rounded-2xl bg-[#0D1528] border border-orange-500/20 hover:border-orange-500/50 transition-all cursor-pointer group mb-2 shadow-lg"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-orange-400'}`} />
              <span className="text-xs font-bold text-white">WhatsApp Bot</span>
            </div>
            <span className={`text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded ${
              isConnected ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
            }`}>
              {isConnected ? 'Online' : 'Conectar'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate font-mono">
            {isConnected ? (whatsappStatus?.ownerJid?.split('@')[0] || 'Conectado') : 'Ler QR Code'}
          </p>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair do Painel</span>
        </button>
      </aside>

      {/* 2. Main Content Viewport */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10 pb-16 md:pb-0">
        {/* Top Executive Stats Bar (Responsive) */}
        <header className="h-14 border-b border-orange-500/15 bg-[#070B16]/90 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-[#0D1528] border border-orange-500/20 text-orange-400 md:hidden cursor-pointer"
              aria-label="Abrir Menu Lateral"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] sm:text-xs font-bold text-slate-300 hidden xs:inline">Leads:</span>
                <strong className="text-xs sm:text-sm font-extrabold text-white font-mono">{leads.length}</strong>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-slate-300 hidden xs:inline">Pipeline:</span>
                <strong className="text-xs sm:text-sm font-extrabold text-emerald-400 font-mono">
                  R$ {totalPipelineRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </strong>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-black border border-emerald-500/30">
                  {wonCount} Cotas
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsNewLeadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black transition-all shadow-lg shadow-orange-500/25 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo Lead</span>
            </button>
          </div>
        </header>

        {/* Toast Alert */}
        {toastNotification && (
          <div className="absolute top-16 right-4 sm:right-6 z-50 p-3 sm:p-4 rounded-2xl bg-orange-500 text-white font-extrabold text-xs shadow-2xl flex items-center gap-2.5 animate-bounce border border-orange-400 max-w-sm">
            <Bell className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{toastNotification}</span>
          </div>
        )}

        {/* Views */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'kanban' && (
            <KanbanView
              leads={leads}
              stages={stages}
              onUpdateLead={handleUpdateLead}
              onSelectLead={(id) => {
                setActiveLeadId(id);
                setActiveTab('chat');
              }}
              onOpenNewLeadModal={() => setIsNewLeadModalOpen(true)}
              onSimulateAdLead={fetchInitialData}
            />
          )}

          {activeTab === 'chat' && (
            <LiveChatView
              leads={leads}
              activeLeadId={activeLeadId}
              onSelectLead={setActiveLeadId}
              stages={stages}
              onUpdateLead={handleUpdateLead}
              whatsappStatus={whatsappStatus}
              whatsappConnected={isConnected}
              onOpenWhatsAppModal={() => setIsQrModalOpen(true)}
            />
          )}

          {activeTab === 'automations' && <AutomationsView />}
          {activeTab === 'analytics' && <AnalyticsView leads={leads} />}
          {activeTab === 'webhooks' && <WebhooksHubView />}
          {activeTab === 'settings' && <SettingsView />}
        </div>

        {/* Mobile Bottom Navigation Bar (1-Thumb Access) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#070B16]/95 border-t border-orange-500/20 backdrop-blur-2xl px-2 flex items-center justify-around z-40">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              activeTab === 'kanban' ? 'text-orange-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Kanban className="w-4 h-4" />
            <span className="text-[10px]">Funil</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl relative transition-all ${
              activeTab === 'chat' ? 'text-orange-400 font-bold' : 'text-slate-400'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span className="text-[10px]">Chat</span>
            {totalUnread > 0 && (
              <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('automations')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              activeTab === 'automations' ? 'text-orange-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="text-[10px]">Automações</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
              activeTab === 'analytics' ? 'text-orange-400 font-bold' : 'text-slate-400'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px]">Métricas</span>
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-slate-400 hover:text-white"
          >
            <Menu className="w-4 h-4" />
            <span className="text-[10px]">Mais</span>
          </button>
        </nav>
      </main>

      {/* Modals */}
      {isQrModalOpen && (
        <WhatsAppModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
          whatsappStatus={whatsappStatus}
          onRefreshStatus={fetchWhatsAppStatus}
        />
      )}

      {isNewLeadModalOpen && (
        <NewLeadModal
          isOpen={isNewLeadModalOpen}
          onClose={() => setIsNewLeadModalOpen(false)}
          onCreateLead={handleCreateLead}
          stages={stages}
        />
      )}
    </div>
  );
}
