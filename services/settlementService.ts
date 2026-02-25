
import * as XLSX from 'xlsx';
import { Transaction, Product } from '../types';

export interface SettlementFile {
  fileName: string;
  blob: Blob;
}

export const generateSettlementExcel = (transactions: Transaction[], products: Product[]): SettlementFile => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
  const fileName = `Settlement_${dateStr}_${timeStr}.xlsx`;

  // 1. All daily transactions records
  const transHeaders = ["ID", "Timestamp", "Items", "Payment Method", "Original Total", "Discount Type", "Discount Amount", "Net Total (Paid)", "Refund Amount", "Final Total", "Profit", "Refund Reasons", "Customer Email"];
  const transData = transactions.map(tx => {
    const refundTotal = (tx.refunds || []).reduce((acc, r) => acc + r.amount, 0);
    const refundReasons = (tx.refunds || []).map(r => `${r.itemName}: ${r.reason}`).join('; ');
    const discountInfo = tx.discountType ? `${tx.discountType}${tx.discountIteration && tx.discountIteration > 1 ? ` x${tx.discountIteration}` : ''} (${tx.discountValue}${tx.discountType === 'percentage' ? '%' : ''})` : 'None';
    
    return {
      ID: tx.id,
      Timestamp: new Date(tx.timestamp).toLocaleString(),
      Items: tx.items.map(i => `${i.name} (x${i.quantity})`).join(', '),
      'Payment Method': tx.paymentMethod,
      'Original Total': tx.originalTotal || tx.total,
      'Discount Type': discountInfo,
      'Discount Amount': tx.discountAmount || 0,
      'Net Total (Paid)': tx.total,
      'Refund Amount': refundTotal,
      'Final Total': tx.total - refundTotal,
      Profit: tx.profit - (tx.refunds || []).reduce((acc, r) => acc + r.profitImpact, 0),
      'Refund Reasons': refundReasons || 'None',
      'Customer Email': tx.customerEmail || 'N/A'
    };
  });
  
  const wsTrans = XLSX.utils.json_to_sheet(transData, { header: transHeaders });

  // 2. Product Mix Summary (Sales by Category)
  const categorySummary: Record<string, { revenue: number, units: number, profit: number, damaged: number }> = {};
  
  // Initialize with existing categories if products are available
  products.forEach(p => {
    const cat = p.category || 'Uncategorized';
    if (!categorySummary[cat]) categorySummary[cat] = { revenue: 0, units: 0, profit: 0, damaged: 0 };
  });

  transactions.forEach(tx => {
    tx.items.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!categorySummary[cat]) categorySummary[cat] = { revenue: 0, units: 0, profit: 0, damaged: 0 };
      
      const totalRefundedQty = (tx.refunds || [])
        .filter(r => r.itemId === item.id)
        .reduce((acc, r) => acc + r.quantity, 0);
        
      const damagedQty = (tx.refunds || [])
        .filter(r => r.itemId === item.id && r.reason === 'Damaged Item')
        .reduce((acc, r) => acc + r.quantity, 0);
      
      // Net units sold: Gross - All Refunds
      const netQty = item.quantity - totalRefundedQty;
      const price = item.discountedPrice || item.price;

      categorySummary[cat].revenue += price * netQty;
      categorySummary[cat].units += netQty;
      categorySummary[cat].profit += (price - item.cost) * netQty;
      categorySummary[cat].damaged += damagedQty;
    });
  });
  
  const mixHeaders = ["Category", "Net Units Sold", "Damaged Units", "Net Revenue", "Net Profit", "Margin %"];
  const mixData = Object.entries(categorySummary).map(([cat, stats]) => ({
    Category: cat,
    'Net Units Sold': stats.units,
    'Damaged Units': stats.damaged,
    'Net Revenue': stats.revenue,
    'Net Profit': stats.profit,
    'Margin %': stats.revenue > 0 ? ((stats.profit / stats.revenue) * 100).toFixed(2) + '%' : '0%'
  }));
  
  const wsMix = XLSX.utils.json_to_sheet(mixData, { header: mixHeaders });

  // 3. Financial Summary
  const totalOriginalRevenue = transactions.reduce((acc, tx) => acc + (tx.originalTotal || tx.total), 0);
  const totalDiscountAmount = transactions.reduce((acc, tx) => acc + (tx.discountAmount || 0), 0);
  const totalGrossRevenue = transactions.reduce((acc, tx) => acc + tx.total, 0);
  const totalRefundAmount = transactions.reduce((acc, tx) => acc + (tx.refunds || []).reduce((ra, r) => ra + r.amount, 0), 0);
  const totalNetRevenue = totalGrossRevenue - totalRefundAmount;
  const totalNetProfit = transactions.reduce((acc, tx) => acc + (tx.profit - (tx.refunds || []).reduce((ra, r) => ra + r.profitImpact, 0)), 0);

  const paymentBreakdown: Record<string, number> = {};
  transactions.forEach(tx => {
    const net = tx.total - (tx.refunds || []).reduce((a,b)=>a+b.amount, 0);
    paymentBreakdown[tx.paymentMethod] = (paymentBreakdown[tx.paymentMethod] || 0) + net;
  });

  const financialData = [
    { Label: 'Settlement Date', Value: dateStr },
    { Label: 'Settlement Time', Value: now.toLocaleTimeString() },
    { Label: 'Total Transactions', Value: transactions.length },
    { Label: 'Original Revenue (Pre-Discount)', Value: totalOriginalRevenue },
    { Label: 'Total Discounts Given', Value: totalDiscountAmount },
    { Label: 'Gross Revenue (Post-Discount)', Value: totalGrossRevenue },
    { Label: 'Total Refunds', Value: totalRefundAmount },
    { Label: 'Net Revenue', Value: totalNetRevenue },
    { Label: 'Net Profit', Value: totalNetProfit },
    { Label: 'Average Net Transaction Value', Value: transactions.length > 0 ? (totalNetRevenue / transactions.length).toFixed(2) : 0 },
    { Label: '', Value: '' },
    { Label: 'NET PAYMENT BREAKDOWN (By Method)', Value: '' },
    ...Object.entries(paymentBreakdown).map(([method, amt]) => ({
      Label: method,
      Value: amt
    }))
  ];
  const wsFinancial = XLSX.utils.json_to_sheet(financialData);

  // Create workbook and append sheets
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsTrans, 'Daily Transactions');
  XLSX.utils.book_append_sheet(wb, wsMix, 'Product Mix');
  XLSX.utils.book_append_sheet(wb, wsFinancial, 'Financial Summary');

  // Generate binary output as Uint8Array
  // Note: 'array' type ensures compatibility with Blob construction in most browsers
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  return { fileName, blob };
};
