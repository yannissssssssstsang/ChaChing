
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
    <div className="space-y-8 pb-20 md:pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t.records}</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Transaction Log & History</p>
        </div>

        <div className="bg-white p-1.5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-1">
          <button 
            onClick={() => setRange('today')}
            className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${range === 'today' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            {lang === Language.ZH ? '今日' : 'Today'}
          </button>
          <button 
            onClick={() => setRange('all')}
            className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${range === 'all' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            {lang === Language.ZH ? '全部' : 'All Time'}
          </button>
        </div>
      </div>

      {/* Payment Method Summary Section */}
      {paymentSummary.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-scale-in">
          {paymentSummary.map(([method, amount]) => (
            <div key={method} className={`p-4 rounded-[24px] border shadow-sm ${getMethodBgLite(method)} flex flex-col gap-2`}>
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${getMethodColor(method)}`}>
                  <i className={`fas ${getMethodIcon(method)} text-[10px]`}></i>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest opacity-60 ${getMethodText(method)}`}>{method}</span>
              </div>
              <div>
                <p className={`text-xl font-black ${getMethodText(method)}`}>${amount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Net Collected</p>
              </div>
            </div>
          ))}
        </div>
      ) : range === 'today' && transactions.length > 0 ? (
        <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No transactions yet today</p>
        </div>
      ) : null}

      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
          {range === 'today' ? 'Today\'s Transactions' : 'Recent Transactions'}
        </h3>
        {sortedTransactions.map((tx) => {
          const effectiveTotal = calculateEffectiveTotal(tx);
          const effectiveProfit = calculateEffectiveProfit(tx);
          const isFullyRefunded = effectiveTotal <= 0 && tx.refunds && tx.refunds.length > 0;
          const isPartiallyRefunded = effectiveTotal > 0 && tx.refunds && tx.refunds.length > 0;

          return (
            <div key={tx.id} className={`bg-white p-5 rounded-3xl border shadow-sm space-y-4 hover:shadow-md transition-shadow group ${isFullyRefunded ? 'opacity-60 border-red-100' : 'border-slate-100'}`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${
                    tx.paymentMethod === 'CASH' ? 'bg-emerald-500' : 
                    tx.paymentMethod === 'PAYME' ? 'bg-red-500' :
                    tx.paymentMethod === 'ALIPAY' ? 'bg-sky-500' : 
                    tx.paymentMethod === 'FPS' ? 'bg-orange-500' : 'bg-slate-500'
                  }`}>
                    <i className={`fas ${
                      tx.paymentMethod === 'CASH' ? 'fa-money-bill-wave' : 
                      tx.paymentMethod === 'PAYME' ? 'fa-qrcode' :
                      tx.paymentMethod === 'ALIPAY' ? 'fa-mobile-screen' : 
                      tx.paymentMethod === 'FPS' ? 'fa-bolt' : 'fa-wallet'
                    } text-xs`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {new Date(tx.timestamp).toLocaleDateString(lang === Language.ZH ? 'zh-HK' : 'en-US', { day: '2-digit', month: 'short' })}
                      </p>
                      {isFullyRefunded && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{t.refunded}</span>}
                      {isPartiallyRefunded && <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{t.partialRefund}</span>}
                    </div>
                    <p className="text-sm font-black text-slate-800">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex flex-col items-end">
                    {tx.discountAmount > 0 && !isFullyRefunded && (
                      <span className="text-[10px] font-black text-slate-300 line-through tracking-tight">
                        ${tx.originalTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    )}
                    <p className={`text-lg font-black ${isFullyRefunded ? 'text-slate-400 line-through' : 'text-blue-600'}`}>
                      ${effectiveTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 uppercase tracking-wider border border-slate-100">
                      {tx.paymentMethod}
                    </span>
                    {!isFullyRefunded && (
                      <button onClick={() => startRefund(tx)} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:text-red-700">
                        <i className="fas fa-undo mr-1"></i> {t.refund}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-4 space-y-2">
                {tx.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-[9px] text-emerald-600 font-black uppercase tracking-widest bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 mb-2">
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
                    <div key={`${tx.id}-item-${idx}`} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 flex items-center justify-center bg-white border rounded-lg text-[9px] font-black ${remainingQty <= 0 ? 'text-slate-300 border-slate-100' : 'text-blue-600 border-slate-200'}`}>
                          {item.quantity}
                        </span>
                        <span className={`font-bold ${remainingQty <= 0 ? 'text-slate-300 line-through' : 'text-slate-600'}`}>{item.name}</span>
                        {refundedQty > 0 && <span className="text-[8px] text-red-400 font-black italic">(-{refundedQty} {t.refunded})</span>}
                      </div>
                      <span className={`font-black ${remainingQty <= 0 ? 'text-slate-300 line-through' : 'text-slate-400'}`}>
                        ${((item.discountedPrice || item.price) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        {item.discountedPrice && item.discountedPrice < item.price && (
                          <span className="ml-1 text-[8px] line-through opacity-50">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {tx.refunds && tx.refunds.length > 0 && (
                <div className="p-3 bg-red-50/30 rounded-2xl border border-red-50 space-y-2">
                  <p className="text-[8px] font-black text-red-400 uppercase tracking-widest">Refund History</p>
                  {tx.refunds.map(refund => (
                    <div key={refund.id} className="flex justify-between items-center text-[9px]">
                      <span className="text-red-600 font-bold">{refund.quantity}x {refund.itemName} - {refund.reason}</span>
                      <span className="text-red-600 font-black">-${refund.amount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center text-[9px] pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-bold uppercase">Transaction ID</span>
                  <span className="text-slate-400 font-mono tracking-tighter">{tx.id}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${isFullyRefunded ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-emerald-50 text-emerald-600 border-emerald-100/50'}`}>
                  <i className="fas fa-chart-line text-[8px]"></i>
                  <span className="font-black uppercase tracking-widest">{t.profit}: ${effectiveProfit.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                </div>
              </div>
            </div>
          );
        })}

        {sortedTransactions.length === 0 && (
          <div className="text-center py-32 bg-white rounded-[40px] border border-dashed border-slate-200">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-receipt text-slate-200 text-4xl"></i>
            </div>
            <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">
              {range === 'today' ? 'No transactions today' : t.noRecords}
            </p>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundingTransaction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-6 md:p-8 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.refund}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Order #{refundingTransaction.id}</p>
              </div>
              <button onClick={() => setRefundingTransaction(null)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"><i className="fas fa-times"></i></button>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.refundItems}</p>
              <div className="space-y-3">
                {refundingTransaction.items.map(item => {
                  const alreadyRefunded = (refundingTransaction.refunds || [])
                    .filter(r => r.itemId === item.id)
                    .reduce((acc, r) => acc + r.quantity, 0);
                  const refundable = item.quantity - alreadyRefunded;
                  const selected = selectedRefundItems[item.id] || 0;

                  if (refundable <= 0) return null;

                  return (
                    <div key={item.id} className={`p-4 rounded-[28px] border-2 transition-all flex items-center justify-between ${selected > 0 ? 'border-red-500 bg-red-50/30' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-800 uppercase">{item.name}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Available: {refundable}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSelectedRefundItems(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))}
                          className="w-8 h-8 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400"
                        >
                          <i className="fas fa-minus text-[10px]"></i>
                        </button>
                        <span className="w-6 text-center text-sm font-black text-slate-700">{selected}</span>
                        <button 
                          onClick={() => setSelectedRefundItems(prev => ({ ...prev, [item.id]: Math.min(refundable, (prev[item.id] || 0) + 1) }))}
                          className="w-8 h-8 bg-red-600 border border-red-700 rounded-xl flex items-center justify-center text-white"
                        >
                          <i className="fas fa-plus text-[10px]"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.refundReason}</label>
                  <select 
                    value={refundReason} 
                    onChange={e => setRefundReason(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-red-500"
                  >
                    <option value="Customer Changed Mind">{t.reasonCustomer}</option>
                    <option value="Damaged Item">{t.reasonDamaged}</option>
                    <option value="Order Mistake">{t.reasonMistake}</option>
                    <option value="Other">{t.reasonOther}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.refundMethod}</label>
                  <select 
                    value={refundMethod} 
                    onChange={e => setRefundMethod(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-red-500"
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
                className="w-full bg-red-600 text-white p-6 rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-red-100 disabled:opacity-50 transition-all active:scale-[0.98]"
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
