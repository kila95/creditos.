import React, { useState } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  ShieldCheck, 
  FileText, 
  Check, 
  Clock, 
  AlertCircle,
  Copy,
  Share2
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../data/mockData';
import { generateAiNegotiationProposal, NegotiationProposal } from '../utils/aiNegotiator';
import { formatCOP } from '../utils/financialCalculations';

interface AiNegotiationModalProps {
  clients: ClientProfile[];
  loans: LoanDetail[];
  onApproveAgreement: (proposal: NegotiationProposal) => void;
  onClose: () => void;
}

export const AiNegotiationAssistantModal: React.FC<AiNegotiationModalProps> = ({
  clients,
  loans,
  onApproveAgreement,
  onClose
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[2]?.id || clients[0]?.id);
  const [chatInput, setChatInput] = useState<string>(
    'El cliente dice que no tiene para la cuota de hoy pero puede pagar el doble el jueves si le extendemos el plazo sin reportarlo al fiador.'
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentProposal, setCurrentProposal] = useState<NegotiationProposal | null>(null);
  const [agreementApproved, setAgreementApproved] = useState<boolean>(false);
  const [copiedAgreement, setCopiedAgreement] = useState<boolean>(false);

  const selectedClient = clients.find(c => c.id === selectedClientId) || clients[0];
  const selectedLoan = loans.find(l => l.clientId === selectedClient.id) || loans[0];

  const handleAskAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setIsAnalyzing(true);
    setAgreementApproved(false);

    setTimeout(() => {
      const proposal = generateAiNegotiationProposal(selectedClient, selectedLoan, chatInput);
      setCurrentProposal(proposal);
      setIsAnalyzing(false);
    }, 1200);
  };

  const handleApprove = () => {
    if (!currentProposal) return;
    onApproveAgreement(currentProposal);
    setAgreementApproved(true);
  };

  const handleCopyAgreement = () => {
    if (!currentProposal) return;
    navigator.clipboard.writeText(currentProposal.formalAgreementDraft);
    setCopiedAgreement(true);
    setTimeout(() => setCopiedAgreement(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-purple-950">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Asistente IA de Negociación & Reestructuración</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                  Gemini 3.8
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Evalúa propuestas de deudores, calcula recargos compensatorios y redacta pagarés digitales formales
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* CONTENIDO INTERACTIVO */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* SELECCIÓN DEL CLIENTE A NEGOCIAR */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-slate-300 font-semibold">Cliente solicitando prórroga:</span>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setCurrentProposal(null);
                setAgreementApproved(false);
              }}
              className="bg-slate-800 text-white rounded-lg px-3 py-1.5 border border-slate-700"
            >
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.tradeName} (Mora: {c.daysOverdue}d)
                </option>
              ))}
            </select>
          </div>

          {/* CHAT / PROMPT INPUT */}
          <form onSubmit={handleAskAi} className="space-y-2">
            <label className="text-slate-300 font-bold block">
              Situación planteada por el cliente en calle:
            </label>
            <div className="relative">
              <textarea
                rows={3}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe lo que dice el cliente..."
                className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setChatInput('El cliente propone pagar la mitad hoy y el resto acumulado el sábado.')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[10px]"
                >
                  "Paga mitad hoy"
                </button>
                <button
                  type="button"
                  onClick={() => setChatInput('El cliente dice que no tiene para la cuota hoy pero puede pagar el doble el jueves.')}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[10px]"
                >
                  "Paga doble el jueves"
                </button>
              </div>

              <button
                type="submit"
                disabled={isAnalyzing}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-md shadow-purple-950 flex items-center gap-1.5 transition-all"
              >
                {isAnalyzing ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Analizando Riesgo...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    Consultar IA
                  </>
                )}
              </button>
            </div>
          </form>

          {/* PROPUESTA GENERADA POR LA IA */}
          {currentProposal && (
            <div className="bg-slate-950/90 border border-purple-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="font-bold text-white text-sm">Dictamen Financiero & Acuerdo Estructurado</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Acuerdo Viable
                </span>
              </div>

              {/* EVALUACIÓN DE RIESGO */}
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-[11px] leading-relaxed text-slate-300">
                <strong className="text-purple-300 block mb-1">Evaluación del Modelo de Riesgo:</strong>
                {currentProposal.riskEvaluation}
              </div>

              {/* MÉTRICAS FINANCIERAS DE LA PROPUESTA */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Recargo Compensatorio</span>
                  <span className="font-bold text-amber-400 font-mono text-xs">
                    +{formatCOP(currentProposal.compensatoryInterestFee)}
                  </span>
                </div>

                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Nueva Cuota Acordada</span>
                  <span className="font-bold text-white font-mono text-xs">
                    {formatCOP(currentProposal.proposedInstallment)}/día
                  </span>
                </div>

                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[10px] block">Nuevo Vencimiento</span>
                  <span className="font-bold text-emerald-400 font-mono text-xs">
                    {currentProposal.newDueDate}
                  </span>
                </div>
              </div>

              {/* BORRADOR DEL CONTRATO / PAGARÉ */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Texto Oficial del Acuerdo Transaccional:</span>
                  <button
                    onClick={handleCopyAgreement}
                    className="flex items-center gap-1 text-slate-300 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedAgreement ? '¡Copiado!' : 'Copiar Pagaré'}
                  </button>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {currentProposal.formalAgreementDraft}
                </div>
              </div>

              {/* ACCIONES DE APROBACIÓN POR ADMINISTRADOR */}
              <div className="pt-2 flex gap-3">
                {agreementApproved ? (
                  <div className="w-full p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-center font-bold flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    ¡Acuerdo aprobado por el Administrador y registrado en el sistema!
                  </div>
                ) : (
                  <button
                    onClick={handleApprove}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 transition-all text-xs"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Aprobar Acuerdo con 1 Toque y Notificar al Deudor por WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
