import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseAuth';
import { formatCOP } from '../utils/financialCalculations';
import { History } from 'lucide-react';

interface LiquidatedLoan {
  id: string;
  loan_id: string;
  client_name: string;
  final_principal_amount: number;
  total_paid: number;
  liquidation_date: string;
}

export const LiquidatedHistoryView = ({ organizationId }: { organizationId: string }) => {
  const [history, setHistory] = useState<LiquidatedLoan[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/liquidated-history?organizationId=${organizationId}`);
        if (!response.ok) throw new Error('Error al obtener historial');
        const data = await response.json();
        setHistory(data);
      } catch (error) {
        console.error('Error fetching liquidated history:', error);
      }
    };
    
    fetchHistory();
    
    // Subscribe to real-time updates (This will still use Supabase for real-time)
    const channel = supabase
      .channel('liquidated_history_changes')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'liquidated_loans_history',
        filter: `organization_id=eq.${organizationId}`
      }, (payload) => {
        setHistory(prev => [payload.new as LiquidatedLoan, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600/20 text-indigo-400 rounded-xl flex items-center justify-center">
            <History className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-white">Historial de Créditos Liquidados</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs uppercase bg-slate-950 text-slate-400">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Capital Original</th>
              <th className="px-4 py-3">Total Pagado</th>
              <th className="px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
                <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No hay préstamos liquidados registrados.</td>
                </tr>
            ) : (
                history.map(item => (
                <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-white">{item.client_name}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{formatCOP(item.final_principal_amount)}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{formatCOP(item.total_paid)}</td>
                    <td className="px-4 py-3">{new Date(item.liquidation_date).toLocaleDateString()}</td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
