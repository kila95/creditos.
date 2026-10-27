import React, { useEffect, useState } from 'react';

export const SuperAdminPaymentApprovalView: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin-payments')
      .then(res => res.json())
      .then(setPayments)
      .catch(console.error);
  }, []);

  const approve = async (paymentId: string) => {
    try {
      const response = await fetch(`/api/admin-payments/${paymentId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifierUid: 'super-admin-01' }),
      });
      if (!response.ok) throw new Error('Error al aprobar');
      setPayments(prev => prev.map(p => p.id === paymentId ? { ...p, status: 'approved' } : p));
    } catch (err) {
      console.error(err);
      alert('Error al aprobar');
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Aprobación de Pagos de Administradores</h2>
      <table className="w-full bg-white shadow rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-3">Admin ID</th>
            <th className="p-3">Monto</th>
            <th className="p-3">Referencia</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(payment => (
            <tr key={payment.id} className="border-t">
              <td className="p-3">{payment.adminId}</td>
              <td className="p-3">{payment.amount}</td>
              <td className="p-3">{payment.referenceNumber}</td>
              <td className="p-3">{payment.status}</td>
              <td className="p-3">
                {payment.status === 'pending' && (
                  <button onClick={() => approve(payment.id)} className="bg-green-600 text-white px-3 py-1 rounded">
                    Aprobar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
