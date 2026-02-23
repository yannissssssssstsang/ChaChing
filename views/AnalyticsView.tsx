
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Transaction, Language, Product } from '../types';
import { TRANSLATIONS } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

declare const L: any;

interface AnalyticsViewProps {
  transactions: Transaction[];
  products: Product[];
  lang: Language;
}

type DateRange = 'today' | 'all';
type SummaryMode = 'item' | 'category';

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ transactions, lang, products }) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const mapRef = useRef<any>(null);
  const [range, setRange] = useState<DateRange>('today');
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('item');
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  // Filtering transactions based on range
  const filteredTransactions = useMemo(() => {
    if (range === 'all') return transactions;
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    return transactions.filter(tx => new Date(tx.timestamp).getTime() >= startOfToday);
  }, [transactions, range]);

  const effectiveTotals = useMemo(() => {
    return filteredTransactions.map(tx => {
      const refundTotal = (tx.refunds || []).reduce((acc, r) => acc + r.amount, 0);
      const refundProfit = (tx.refunds || []).reduce((acc, r) => acc + r.profitImpact, 0);
      return {
        ...tx,
        effectiveTotal: tx.total - refundTotal,
        effectiveProfit: tx.profit - refundProfit
      };
    });
  }, [filteredTransactions]);

  const totalRevenue = effectiveTotals.reduce((acc, curr) => acc + curr.effectiveTotal, 0);
  const totalProfit = effectiveTotals.reduce((acc, curr) => acc + curr.effectiveProfit, 0);

  const totalRefundCount = useMemo(() => {
    return filteredTransactions.reduce((acc, tx) => acc + (tx.refunds?.length || 0), 0);
  }, [filteredTransactions]);

  // Comprehensive Product Mix Calculation
  const productMixData = useMemo(() => {
    const summary: Record<string, { label: string; units: number; revenue: number; refundedUnits: number }> = {};

    filteredTransactions.forEach(tx => {
      tx.items.forEach(item => {
        // Look up the current product info to ensure category updates are reflected
        const currentProduct = products.find(p => p.id === item.id);
        const activeCategory = currentProduct ? currentProduct.category : (item.category || (lang === Language.ZH ? '未分類' : 'Uncategorized'));
        const activeName = currentProduct ? currentProduct.name : item.name;

        const key = summaryMode === 'item' ? item.id : activeCategory;
        const label = summaryMode === 'item' ? activeName : activeCategory;

        if (!summary[key]) {
          summary[key] = { label, units: 0, revenue: 0, refundedUnits: 0 };
        }

        const refundedQty = (tx.refunds || [])
          .filter(r => r.itemId === item.id)
          .reduce((acc, r) => acc + r.quantity, 0);
        
        const netQty = item.quantity - refundedQty;
        
        // Accumulate gross and refunds separately for display
        summary[key].units += netQty;
        summary[key].refundedUnits += refundedQty;
        summary[key].revenue += (item.price * netQty);
      });
    });

    return Object.values(summary)
      .sort((a, b) => b.units - a.units)
      .slice(0, 8); // Top 8 for the summary list
  }, [filteredTransactions, summaryMode, lang, products]);

  const locationStats = useMemo(() => {
    const stats: Record<string, { lat: number; lng: number; revenue: number; count: number; name: string }> = {};
    effectiveTotals.forEach(tx => {
      if (tx.location) {
        const key = `${tx.location.lat.toFixed(5)},${tx.location.lng.toFixed(5)}`;
        if (!stats[key]) {
          stats[key] = { 
            lat: tx.location.lat, 
            lng: tx.location.lng, 
            revenue: 0, 
            count: 0, 
            name: tx.location.name || 'Unnamed Stall' 
          };
        }
        stats[key].revenue += tx.effectiveTotal;
        stats[key].count += 1;
      }
    });
    return Object.values(stats);
  }, [effectiveTotals]);

  const maxRevenue = useMemo(() => {
    return Math.max(...locationStats.map(s => s.revenue), 1);
  }, [locationStats]);

  const hourlyData = useMemo(() => {
    const map: Record<number, number> = {};
    effectiveTotals.forEach(tx => {
      const hour = new Date(tx.timestamp).getHours();
      map[hour] = (map[hour] || 0) + tx.effectiveTotal;
    });
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      amount: map[i] || 0
    }));
  }, [effectiveTotals]);

  const bestSellers = useMemo(() => {
    const productSalesMap: Record<string, number> = {};
    filteredTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const refundedQty = (tx.refunds || [])
          .filter(r => r.itemId === item.id)
          .reduce((acc, r) => acc + r.quantity, 0);
        const netQty = item.quantity - refundedQty;
        if (netQty > 0) {
          // Use current name if possible
          const currentProduct = products.find(p => p.id === item.id);
          const name = currentProduct ? currentProduct.name : item.name;
          productSalesMap[name] = (productSalesMap[name] || 0) + netQty;
        }
      });
    });
    return Object.entries(productSalesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredTransactions, products]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.warn("Initial user location fetch failed"),
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    if (typeof L === 'undefined') return;
    const container = document.getElementById('analytics-map');
    if (!container) return;

    if (!mapRef.current) {
      let initialCenter: [number, number] = [22.3193, 114.1694];
      if (locationStats.length > 0) {
        initialCenter = [locationStats[0].lat, locationStats[0].lng];
      } else if (userLoc) {
        initialCenter = [userLoc.lat, userLoc.lng];
      }

      try {
        const mapInstance = L.map('analytics-map', {
          zoomControl: false,
          attributionControl: false,
          trackResize: true
        }).setView(initialCenter, locationStats.length > 0 ? 15 : 13);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
          attribution: '&copy; OpenStreetMap' 
        }).addTo(mapInstance);
        
        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
        mapRef.current = mapInstance;
      } catch (err) {
        console.error("Leaflet initialization failed", err);
      }
    }

    if (mapRef.current) {
      const map = mapRef.current;
      const resizeTimer = setTimeout(() => {
        if (map) map.invalidateSize();
      }, 400);

      map.eachLayer((layer: any) => { 
        if (layer instanceof L.CircleMarker) map.removeLayer(layer); 
      });

      locationStats.forEach(stat => {
        const radius = 8 + (Math.sqrt(Math.max(0, stat.revenue) / maxRevenue) * 25);
        const bubble = L.circleMarker([stat.lat, stat.lng], {
          radius: radius,
          fillColor: '#3b82f6',
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.7
        }).addTo(map);

        bubble.bindPopup(`
          <div class="p-2 min-w-[140px]">
            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">STALL LOCATION</p>
            <div class="flex justify-between items-baseline mb-1">
              <span class="text-lg font-black text-slate-800">$${stat.revenue.toLocaleString()}</span>
            </div>
            <p class="text-[10px] text-slate-500 font-bold uppercase tracking-tight">${stat.count} Transactions</p>
          </div>
        `, { closeButton: false, className: 'custom-map-popup' });
      });

      return () => clearTimeout(resizeTimer);
    }
  }, [locationStats, maxRevenue, userLoc, range]);

  return (
    <div className="space-y-8 pb-20 md:pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-800">{t.analytics}</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Stall Performance & Spatial Data</p>
        </div>
        
        <div className="bg-white p-1.5 rounded-[20px] border border-slate-100 shadow-sm flex items-center gap-1">
          <button onClick={() => setRange('today')} className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${range === 'today' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>{lang === Language.ZH ? '今日' : 'Today'}</button>
          <button onClick={() => setRange('all')} className={`px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${range === 'all' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>{lang === Language.ZH ? '全部' : 'All Time'}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="dashboard-card p-6 border-l-4 border-l-slate-800 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.revenue}</p>
          <p className="text-3xl font-black text-slate-800">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="dashboard-card p-6 border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.profit}</p>
          <p className="text-3xl font-black text-slate-800">${totalProfit.toLocaleString()}</p>
        </div>
        <div className="dashboard-card p-6 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net Sales</p>
          <p className="text-3xl font-black text-slate-800">{filteredTransactions.length}</p>
        </div>
        <div className="dashboard-card p-6 flex flex-col justify-between border-l-4 border-l-red-400">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.refundCount}</p>
          <p className="text-3xl font-black text-red-600">{totalRefundCount}</p>
        </div>
      </div>

      {/* Product Mix Summary Section */}
      <div className="dashboard-card p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Product Mix Summary</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Distribution of net sales volume</p>
          </div>
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1">
            <button 
              onClick={() => setSummaryMode('item')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${summaryMode === 'item' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
            >
              {lang === Language.ZH ? '按單品' : 'By Item'}
            </button>
            <button 
              onClick={() => setSummaryMode('category')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${summaryMode === 'category' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
            >
              {lang === Language.ZH ? '按分類' : 'By Category'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {productMixData.length > 0 ? productMixData.map((item, idx) => {
            const maxUnits = Math.max(...productMixData.map(d => d.units), 1);
            const progress = (item.units / maxUnits) * 100;
            return (
              <div key={idx} className="space-y-3 p-4 bg-slate-50 rounded-[24px] border border-slate-100 transition-all hover:border-blue-200 group">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate max-w-[70%]">{item.label}</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-blue-600">{item.units} Qty</span>
                    {item.refundedUnits > 0 && (
                      <span className="text-[8px] font-black text-red-500 italic mt-0.5 whitespace-nowrap">
                        (-{item.refundedUnits} refunded)
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full bg-white rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out group-hover:bg-blue-600"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center opacity-60">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Revenue</span>
                  <span className="text-[10px] font-bold text-slate-700">${item.revenue.toFixed(1)}</span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full py-12 text-center opacity-30">
               <i className="fas fa-layer-group text-4xl mb-3"></i>
               <p className="text-[10px] font-black uppercase tracking-widest">No data available for this range</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="dashboard-card overflow-hidden lg:col-span-8 h-[500px] flex flex-col">
          <div className="p-4 px-6 border-b border-slate-50 flex justify-between items-center bg-white shrink-0 z-10">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Transaction Density Map</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Spatial concentration of net sales</p>
            </div>
          </div>
          <div className="flex-1 relative bg-slate-50">
            <div id="analytics-map" className="h-full w-full"></div>
          </div>
        </div>

        <div className="dashboard-card p-6 lg:col-span-4 h-[500px] flex flex-col">
          <div className="flex justify-between items-center mb-8 shrink-0">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">{t.bestSellers}</h3>
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500">
              <i className="fas fa-crown text-sm"></i>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-6">
            {bestSellers.length > 0 ? bestSellers.map((item, i) => (
              <div key={i} className="group relative">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.name}</span>
                  <span className="text-[10px] font-black text-blue-600">{item.count} Sold</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(item.count / Math.max(...bestSellers.map(b => b.count))) * 100}%` }}></div>
                </div>
              </div>
            )) : <p className="text-center py-20 opacity-30 text-xs uppercase font-black">No records</p>}
          </div>
        </div>

        <div className="dashboard-card p-6 lg:col-span-12 h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-8 shrink-0">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Revenue Velocity</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{range === 'today' ? 'Real-time hourly breakdown' : 'Historical aggregate by hour'}</p>
            </div>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontWeight: 800}} />
                <YAxis hide={true} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={5} fill="url(#colorRevenue)" animationDuration={2000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
