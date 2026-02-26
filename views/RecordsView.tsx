
import React, { useMemo, useState } from 'react';
import { Transaction, Language, Refund, PaymentQRCodes } from '../types';
import { TRANSLATIONS } from '../constants';

interface RecordsViewProps {
  transactions: Transaction[];
  lang: Language;
  onRefund: (transactionId: string, refunds: Refund[]) => void;
  paymentQRCodes: PaymentQRCodes;
}

type DateRange = 'today' | 'all';

const RecordsView: React.FC<RecordsViewProps> = ({ transactions, lang, onRefund, paymentQRCodes }) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const [range, setRange] = useState<DateRange>('today');
  
  const [refundingTransaction, setRefundingTransaction] = useState<Transaction | null>(null);
  const [selectedRefundItems, setSelectedRefundItems] = useState<Record<string, number>>({});
  const [refundReason, setRefundReason] = useState('Customer Changed Mind');
  const [refundMethod, setRefundMethod] = useState('CASH');

  const filteredTransactions = useMemo(() => {
    if (range === 'all') return transactions;
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    return transactions.filter(tx => new Date(tx.timestamp).getTime() >= startOfToday);
  }, [transactions, range]);

  const sortedTransactions = useMemo(() => 
    [...filteredTransactions].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ), [filteredTransactions]
  );

  // Dynamically calculate available payment methods for refund selection
  const availableRefundMethods = useMemo(() => {
    const methods = ['CASH'];
    Object.keys(paymentQRCodes).forEach(key => {
      if (paymentQRCodes[key]) methods.push(key);
    });
    return methods;
  }, [paymentQRCodes]);

  const calculateEffectiveTotal = (tx: Transaction) => {
    const refundTotal = (tx.refunds || []).reduce((acc, r) => acc + r.amount, 0);
    return tx.total - refundTotal;
  };

  const calculateEffectiveProfit = (tx: Transaction) => {
    const refundProfit = (tx.refunds || []).reduce((acc, r) => acc + r.profitImpact, 0);
    return tx.profit - refundProfit;
  };

  const paymentSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    filteredTransactions.forEach(tx => {
      summary[tx.paymentMethod] = (summary[tx.paymentMethod] || 0) + calculateEffectiveTotal(tx);
    });
    return Object.entries(summary).sort((a, b) => b[1] - a[1]);
  }, [filteredTransactions]);

  const getMethodIcon = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH': return 'fa-money-bill-wave';
      case 'PAYME': return 'fa-qrcode';
      case 'ALIPAY': return 'fa-mobile-screen';
      case 'FPS': return 'fa-bolt';
      default: return 'fa-wallet';
    }
  };

  const getMethodColor = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH': return 'bg-emerald-500 shadow-emerald-100 text-white';
      case 'PAYME': return 'bg-red-500 shadow-red-100 text-white';
      case 'ALIPAY': return 'bg-sky-500 shadow-sky-100 text-white';
      case 'FPS': return 'bg-orange-500 shadow-orange-100 text-white';
      default: return 'bg-slate-500 shadow-slate-100 text-white';
    }
  };

  const getMethodBgLite = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH': return 'bg-emerald-50 border-emerald-100';
      case 'PAYME': return 'bg-red-50 border-red-100';
      case 'ALIPAY': return 'bg-sky-50 border-sky-100';
      case 'FPS': return 'bg-orange-50 border-orange-100';
      default: return 'bg-slate-50 border-slate-100';
    }
  };

  const getMethodText = (method: string) => {
    switch (method.toUpperCase()) {
      case 'CASH': return 'text-emerald-600';
      case 'PAYME': return 'text-red-600';
      case 'ALIPAY': return 'text-sky-600';
      case 'FPS': return 'text-orange-600';
      default: return 'text-slate-600';
    }
  };

  const startRefund = (tx: Transaction) => {
    setRefundingTransaction(tx);
    setSelectedRefundItems({});
    setRefundReason('Customer Changed Mind');
    // Set default refund method to either the transaction's original method (if available) or CASH
    setRefundMethod(availableRefundMethods.includes(tx.paymentMethod) ? tx.paymentMethod : 'CASH');
  };

  const toggleRefundItem = (itemId: string, maxQty: number) => {
    setSelectedRefundItems(prev => {
      const current = prev[itemId] || 0;
      if (current >= maxQty) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: current + 1 };
    });
  };

  const handleProcessRefund = () => {
    if (!refundingTransaction) return;

    const newRefunds: Refund[] = Object.entries(selectedRefundItems).map(([itemId, qty]) => {
      const item = refundingTransaction.items.find(i => i.id === itemId)!;
      const quantity = qty as number;
      const price = item.discountedPrice || item.price;
      return {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        itemId,
        itemName: item.name,
        quantity,
        amount: price * quantity,
        profitImpact: (price - item.cost) * quantity,
        reason: refundReason,
        method: refundMethod
      };
    });

    onRefund(refundingTransaction.id, newRefunds);
    setRefundingTransaction(null);
  };

  return (
    <div className="space-y-10 pb-24 md:pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-black tracking-tighter">{t.records}</h2>
          <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest mt-1.5">Transaction Log & History</p>
        </div>

        <div className="bg-white p-1.5 rounded-[24px] border border-zinc-100 shadow-sm flex items-center gap-1.5">
          <button 
            onClick={() => setRange('today')}
            className={`px-7 py-2.5 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all ${range === 'today' ? 'bg-black text-white shadow-xl shadow-black/10' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}
          >
            {lang === Language.ZH ? '今日' : 'Today'}
          </button>
          <button 
            onClick={() => setRange('all')}
            className={`px-7 py-2.5 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all ${range === 'all' ? 'bg-black text-white shadow-xl shadow-black/10' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}
          >
            {lang === Language.ZH ? '全部' : 'All Time'}
          </button>
        </div>
      </div>

      {/* Payment Method Summary Section */}
      {paymentSummary.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 animate-scale-in">
          {paymentSummary.map(([method, amount]) => (
            <div key={method} className={`p-5 rounded-[32px] border shadow-sm bg-white border-zinc-100 flex flex-col gap-3 transition-all hover:shadow-xl hover:border-zinc-200`}>
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm bg-zinc-50 text-black border border-zinc-100`}>
                  <i className={`fas ${getMethodIcon(method)} text-[11px]`}></i>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest text-zinc-400`}>{method}</span>
              </div>
              <div>
                <p className={`text-2xl font-extrabold text-black tracking-tight`}>${amount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Net Collected</p>
              </div>
            </div>
          ))}
        </div>
      ) : range === 'today' && transactions.length > 0 ? (
        <div className="p-10 bg-zinc-50 border border-zinc-100 rounded-[40px] text-center">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">No transactions yet today</p>
        </div>
      ) : null}

      <div className="space-y-5">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.25em] ml-1">
          {range === 'today' ? 'Today\'s Transactions' : 'Recent Transactions'}
        </h3>
        {sortedTransactions.map((tx) => {
          const effectiveTotal = calculateEffectiveTotal(tx);
          const effectiveProfit = calculateEffectiveProfit(tx);
          const isFullyRefunded = effectiveTotal <= 0 && tx.refunds && tx.refunds.length > 0;
          const isPartiallyRefunded = effectiveTotal > 0 && tx.refunds && tx.refunds.length > 0;

          return (
            <div key={tx.id} className={`bg-white p-6 rounded-[32px] border shadow-sm space-y-5 hover:shadow-xl transition-all group ${isFullyRefunded ? 'opacity-60 border-red-100' : 'border-zinc-100'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
                    tx.paymentMethod === 'CASH' ? 'bg-emerald-500 shadow-emerald-100' : 
                    tx.paymentMethod === 'PAYME' ? 'bg-red-500 shadow-red-100' :
                    tx.paymentMethod === 'ALIPAY' ? 'bg-sky-500 shadow-sky-100' : 
                    tx.paymentMethod === 'FPS' ? 'bg-orange-500 shadow-orange-100' : 'bg-zinc-800 shadow-zinc-100'
                  }`}>
                    <i className={`fas ${
                      tx.paymentMethod === 'CASH' ? 'fa-money-bill-wave' : 
                      tx.paymentMethod === 'PAYME' ? 'fa-qrcode' :
                      tx.paymentMethod === 'ALIPAY' ? 'fa-mobile-screen' : 
                      tx.paymentMethod === 'FPS' ? 'fa-bolt' : 'fa-wallet'
                    } text-sm`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                        {new Date(tx.timestamp).toLocaleDateString(lang === Language.ZH ? 'zh-HK' : 'en-US', { day: '2-digit', month: 'short' })}
                      </p>
                      {isFullyRefunded && <span className="text-[9px] bg-red-100 text-red-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">{t.refunded}</span>}
                      {isPartiallyRefunded && <span className="text-[9px] bg-amber-100 text-amber-600 px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">{t.partialRefund}</span>}
                    </div>
                    <p className="text-base font-bold text-black">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end">
                    {tx.discountAmount > 0 && !isFullyRefunded && (
                      <span className="text-[11px] font-bold text-zinc-300 line-through tracking-tight">
                        ${tx.originalTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    )}
                    <p className={`text-xl font-extrabold ${isFullyRefunded ? 'text-zinc-400 line-through' : 'text-black'}`}>
                      ${effectiveTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 justify-end mt-1">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-zinc-50 text-zinc-400 uppercase tracking-widest border border-zinc-100">
                      {tx.paymentMethod}
                    </span>
                    {!isFullyRefunded && (
                      <button onClick={() => startRefund(tx)} className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors">
                        <i className="fas fa-undo mr-1.5"></i> {t.refund}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-50/50 border border-zinc-100/50 rounded-[24px] p-5 space-y-3">
                {tx.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-[10px] text-emerald-600 font-bold uppercase tracking-widest bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 mb-3">
                    <span>{t.discount} ({tx.discountType === 'percentage' ? `${tx.discountValue}%` : t.oneTimeOffer})</span>
                    <span>-${tx.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                  </div>
                )}
                {tx.items.map((item, idx) => {
                  const refundedQty = (tx.refunds || [])
                    .filter(r => r.itemId === item.id)
                    .reduce((acc, r) => acc + r.quantity, 0);
                  const remainingQty = item.quantity - refundedQty;

                  return (
                    <div key={`${tx.id}-item-${idx}`} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 flex items-center justify-center bg-white border rounded-xl text-[10px] font-bold ${remainingQty <= 0 ? 'text-zinc-300 border-zinc-100' : 'text-black border-zinc-200'}`}>
                          {item.quantity}
                        </span>
                        <span className={`font-bold uppercase tracking-tight ${remainingQty <= 0 ? 'text-zinc-300 line-through' : 'text-zinc-600'}`}>{item.name}</span>
                        {refundedQty > 0 && <span className="text-[9px] text-red-400 font-bold italic">(-{refundedQty} {t.refunded})</span>}
                      </div>
                      <span className={`font-bold ${remainingQty <= 0 ? 'text-zinc-300 line-through' : 'text-zinc-400'}`}>
                        ${((item.discountedPrice || item.price) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        {item.discountedPrice && item.discountedPrice < item.price && (
                          <span className="ml-1.5 text-[9px] line-through opacity-40">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {tx.refunds && tx.refunds.length > 0 && (
                <div className="p-4 bg-red-50/30 rounded-[24px] border border-red-50 space-y-2.5">
                  <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Refund History</p>
                  {tx.refunds.map(refund => (
                    <div key={refund.id} className="flex justify-between items-center text-[10px]">
                      <span className="text-red-600 font-bold uppercase tracking-tight">{refund.quantity}x {refund.itemName} - {refund.reason}</span>
                      <span className="text-red-600 font-extrabold">-${refund.amount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] pt-1">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 font-bold uppercase tracking-widest">Transaction ID</span>
                  <span className="text-zinc-400 font-mono tracking-tighter">{tx.id}</span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${isFullyRefunded ? 'bg-zinc-100 border-zinc-200 text-zinc-400' : 'bg-zinc-50 text-black border-zinc-100'}`}>
                  <i className="fas fa-chart-line text-[9px]"></i>
                  <span className="font-bold uppercase tracking-widest">{t.profit}: ${effectiveProfit.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                </div>
              </div>
            </div>
          );
        })}

        {sortedTransactions.length === 0 && (
          <div className="text-center py-32 bg-white rounded-[48px] border border-dashed border-zinc-200">
            <div className="w-24 h-24 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <i className="fas fa-receipt text-zinc-200 text-5xl"></i>
            </div>
            <p className="text-zinc-400 font-bold uppercase tracking-[0.25em] text-xs">
              {range === 'today' ? 'No transactions today' : t.noRecords}
            </p>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundingTransaction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[200] flex items-end md:items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[56px] p-10 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto border border-zinc-100">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-extrabold text-black tracking-tighter">{t.refund}</h3>
                <p className="text-[11px] text-zinc-400 font-bold uppercase mt-1.5 tracking-widest">Order #{refundingTransaction.id}</p>
              </div>
              <button onClick={() => setRefundingTransaction(null)} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors"><i className="fas fa-times"></i></button>
            </div>

            <div className="space-y-8">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{t.refundItems}</p>
              <div className="space-y-4">
                {refundingTransaction.items.map(item => {
                  const alreadyRefunded = (refundingTransaction.refunds || [])
                    .filter(r => r.itemId === item.id)
                    .reduce((acc, r) => acc + r.quantity, 0);
                  const refundable = item.quantity - alreadyRefunded;
                  const selected = selectedRefundItems[item.id] || 0;

                  if (refundable <= 0) return null;

                  return (
                    <div key={item.id} className={`p-5 rounded-[32px] border-2 transition-all flex items-center justify-between ${selected > 0 ? 'border-red-500 bg-red-50/30' : 'border-zinc-100 bg-zinc-50'}`}>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-black uppercase tracking-tight">{item.name}</span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Available: {refundable}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setSelectedRefundItems(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
                          className="w-10 h-10 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center text-zinc-400 hover:text-black transition-all active:scale-90"
                        >
                          <i className="fas fa-minus text-[11px]"></i>
                        </button>
                        <span className="w-8 text-center text-base font-extrabold text-black">{selected}</span>
                        <button 
                          onClick={() => setSelectedRefundItems(prev => ({ ...prev, [item.id]: Math.min(refundable, (prev[item.id] || 0) + 1) }))}
                          className="w-10 h-10 bg-red-600 border border-red-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-100 active:scale-90"
                        >
                          <i className="fas fa-plus text-[11px]"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{t.refundReason}</label>
                  <select 
                    value={refundReason} 
                    onChange={e => setRefundReason(e.target.value)}
                    className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-red-500 transition-all"
                  >
                    <option value="Customer Changed Mind">{t.reasonCustomer}</option>
                    <option value="Damaged Item">{t.reasonDamaged}</option>
                    <option value="Order Mistake">{t.reasonMistake}</option>
                    <option value="Other">{t.reasonOther}</option>
                  </select>
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{t.refundMethod}</label>
                  <select 
                    value={refundMethod} 
                    onChange={e => setRefundMethod(e.target.value)}
                    className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-red-500 transition-all"
                  >
                    {availableRefundMethods.map(method => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button 
                onClick={handleProcessRefund}
                disabled={(Object.values(selectedRefundItems) as number[]).reduce((a, b) => a + b, 0) === 0}
                className="w-full bg-red-600 text-white p-6 rounded-[28px] font-bold uppercase tracking-widest shadow-2xl shadow-red-100 disabled:opacity-30 transition-all active:scale-[0.98]"
              >
                {t.processRefund}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordsView;
