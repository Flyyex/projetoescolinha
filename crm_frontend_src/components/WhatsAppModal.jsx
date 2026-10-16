import React, { useState, useEffect } from 'react';
import { QrCode, Smartphone, RefreshCw, X, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

export default function WhatsAppModal({ isOpen, onClose, whatsappStatus, onRefreshStatus }) {
  const [activeTab, setActiveTab] = useState('qrcode'); // qrcode | pairing
  const [phoneNumber, setPhoneNumber] = useState('5534992019122');
  const [pairingCode, setPairingCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState(null);
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    if (!isOpen) return;

    fetchQrCode();
    const interval = setInterval(() => {
      fetchQrCode();
    }, 15000);

    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 15 : prev - 1));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [isOpen]);

  const fetchQrCode = async () => {
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      const qr = data.base64 || data.qrcode?.base64 || (typeof data.qrcode === 'string' ? data.qrcode : null) || data.data?.base64 || data.data?.qrcode?.base64;
      if (qr) {
        setQrBase64(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);
      }
      if (data.pairingCode || data.data?.pairingCode) {
        setPairingCode(data.pairingCode || data.data?.pairingCode);
      }
      if (onRefreshStatus) onRefreshStatus();
    } catch (err) {
      try {
        const res2 = await fetch('/api/whatsapp/status');
        const data2 = await res2.json();
        const qr2 = data2.qrcode?.base64 || (typeof data2.qrcode === 'string' ? data2.qrcode : null);
        if (qr2) {
          setQrBase64(qr2.startsWith('data:') ? qr2 : `data:image/png;base64,${qr2}`);
        }
      } catch (e) {}
    }
  };

  const handleRequestPairing = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPairingCode(null);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone })
      });
      const data = await res.json();
      if (data.data?.pairingCode) {
        setPairingCode(data.data.pairingCode);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = whatsappStatus?.connectionStatus === 'open';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg overflow-hidden glass-card rounded-2xl border border-crm-border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-crm-border/60 bg-crm-dark/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-crm-text text-lg">Conexão WhatsApp</h3>
              <p className="text-xs text-crm-textMuted">Instância: <span className="font-mono text-emerald-400 font-semibold">{whatsappStatus?.instanceName || 'principal'}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-crm-textMuted hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isConnected ? (
            <div className="text-center py-6">
              <div className="inline-flex p-4 rounded-full bg-emerald-500/10 text-emerald-400 mb-4 border border-emerald-500/20">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">WhatsApp Conectado!</h4>
              <p className="text-sm text-crm-textMuted mb-6 max-w-sm mx-auto">
                Sua instância está 100% online e pronta para enviar e receber leads dos seus anúncios.
              </p>
              <div className="p-4 rounded-xl bg-crm-dark/70 border border-crm-border text-left max-w-sm mx-auto space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-crm-textMuted">Status:</span>
                  <span className="text-emerald-400 font-semibold uppercase">Online (Open)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crm-textMuted">Perfil:</span>
                  <span className="text-white font-medium">{whatsappStatus?.profileName || 'WhatsApp Business'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-crm-textMuted">Número:</span>
                  <span className="text-white font-mono">{whatsappStatus?.ownerJid?.split('@')[0] || '-'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Tabs */}
              <div className="flex p-1 bg-crm-darker rounded-xl border border-crm-border mb-6">
                <button
                  onClick={() => setActiveTab('qrcode')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === 'qrcode'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-crm-textMuted hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" /> Escanear QR Code
                </button>
                <button
                  onClick={() => setActiveTab('pairing')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === 'pairing'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-crm-textMuted hover:text-white'
                  }`}
                >
                  <Smartphone className="w-4 h-4" /> Código por Número
                </button>
              </div>

              {activeTab === 'qrcode' ? (
                <div className="flex flex-col items-center text-center">
                  <div className="relative p-3 bg-white rounded-2xl shadow-xl border border-slate-700/50 mb-4 group">
                    {qrBase64 ? (
                      <img
                        src={qrBase64}
                        alt="QR Code"
                        className="w-56 h-56 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="w-56 h-56 flex flex-col items-center justify-center bg-slate-100 rounded-lg text-slate-500">
                        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
                        <span className="text-xs font-medium">Carregando QR Code...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-crm-textMuted mb-4">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Atualizando em tempo real ({countdown}s)</span>
                  </div>

                  <div className="text-left bg-crm-dark/60 p-4 rounded-xl border border-crm-border text-xs text-crm-textMuted space-y-1.5 w-full">
                    <p className="font-semibold text-crm-text">Como escanear no celular:</p>
                    <p>1. Abra o WhatsApp no celular</p>
                    <p>2. Toque em <b>Mais opções (⋮)</b> ou <b>Configurações</b></p>
                    <p>3. Toque em <b>Aparelhos conectados &gt; Conectar um aparelho</b></p>
                    <p>4. Aponte a câmera para o QR Code acima</p>
                  </div>
                </div>
              ) : (
                <div>
                  <form onSubmit={handleRequestPairing} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-crm-text mb-1.5">
                        Número de Telefone com DDD (Ex: 5534992019122)
                      </label>
                      <input
                        type="text"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="55 + DDD + Número"
                        className="w-full px-4 py-2.5 rounded-xl bg-crm-dark border border-crm-border text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-semibold text-sm text-white transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Gerando Código...
                        </>
                      ) : (
                        'Solicitar Código de 8 Dígitos'
                      )}
                    </button>
                  </form>

                  {pairingCode && (
                    <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center animate-fadeIn">
                      <p className="text-xs text-emerald-400 font-medium mb-1">Digite este código no seu WhatsApp:</p>
                      <div className="text-2xl font-black text-white font-mono tracking-widest bg-crm-darker/60 py-2 rounded-lg border border-emerald-500/30">
                        {pairingCode}
                      </div>
                      <p className="text-[11px] text-crm-textMuted mt-2">
                        WhatsApp &gt; Aparelhos conectados &gt; Conectar com número de telefone
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-crm-dark/80 border-t border-crm-border/60 flex items-center justify-between text-xs text-crm-textMuted">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Criptografia Ponta a Ponta Ativa</span>
          </div>
          <button
            onClick={fetchQrCode}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
