
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import OrderingView from './views/OrderingView';
import InventoryView from './views/InventoryView';
import AnalyticsView from './views/AnalyticsView';
import RecordsView from './views/RecordsView';
import SettingsView from './views/SettingsView';
import LandingView from './views/LandingView';
import { Product, Language, Transaction, DailyReport, PaymentQRCodes, ProductChangeLog, TelegramConfig, SyncStatus, ReceiptConfig, SettlementConfig, Refund } from './types';
import { TRANSLATIONS } from './constants';
import { syncToGoogleDrive, downloadFromGoogleDrive, uploadSettlementToDrive } from './services/googleDriveService';
import { generateSettlementExcel } from './services/settlementService';

declare const google: any;

const GOOGLE_CLIENT_ID = '950489680613-dnvqv44q1aml8tdakijnp0r0hr5gqqt0.apps.googleusercontent.com';

const INITIAL_PRODUCTS: Product[] = [
  { id: '1', name: 'Artisan Coffee', price: 45, cost: 15, stock: 50, threshold: 5, category: 'Beverage', image: 'https://picsum.photos/seed/coffee/200' },
  { id: '2', name: 'Handmade Cookie', price: 20, cost: 8, stock: 120, threshold: 10, category: 'Food', image: 'https://picsum.photos/seed/cookie/200' },
  { id: '3', name: 'Organic Honey', price: 120, cost: 60, stock: 15, threshold: 5, category: 'Produce', image: 'https://picsum.photos/seed/honey/200' },
];

const App: React.FC = () => {
  const [googleToken, setGoogleToken] = useState<string | null>(() => {
    return localStorage.getItem('google_access_token');
  });

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('stall_logged_in') === 'true' || !!localStorage.getItem('google_access_token');
  });

  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('stall_lang');
    return (saved as Language) || Language.EN;
  });
  
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(localStorage.getItem('stall_last_sync'));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('stall_dark_mode') === 'true');
  const [isInitialCloudLoading, setIsInitialCloudLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [paymentQRCodes, setPaymentQRCodes] = useState<PaymentQRCodes>({});
  const [changeLogs, setChangeLogs] = useState<ProductChangeLog[]>([]);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({ botToken: '', chatId: '', alertType: 'both' });
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>({ companyName: '', address: '', phone: '', email: '' });
  const [settlementConfig, setSettlementConfig] = useState<SettlementConfig>({ enabled: false, time: '22:00' });

  const [tokenClient, setTokenClient] = useState<any>(null);
  const isInitialMount = useRef(true);
  const isHydrated = useRef(false);
  const t = (TRANSLATIONS as any)[lang];

  useEffect(() => {
    const savedProducts = localStorage.getItem('stall_products');
    const savedTransactions = localStorage.getItem('stall_transactions');
    const savedReports = localStorage.getItem('stall_reports');
    const savedQRs = localStorage.getItem('stall_payment_qrs');
    const savedLogs = localStorage.getItem('stall_change_logs');
    const savedTelegram = localStorage.getItem('stall_telegram_config');
    const savedReceipt = localStorage.getItem('stall_receipt_config');
    const savedSettlement = localStorage.getItem('stall_settlement_config');

    if (savedProducts) setProducts(JSON.parse(savedProducts));
    else setProducts(INITIAL_PRODUCTS);

    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedReports) setReports(JSON.parse(savedReports));
    if (savedQRs) setPaymentQRCodes(JSON.parse(savedQRs));
    if (savedLogs) setChangeLogs(JSON.parse(savedLogs));
    if (savedTelegram) setTelegramConfig(JSON.parse(savedTelegram));
    if (savedReceipt) setReceiptConfig(JSON.parse(savedReceipt));
    if (savedSettlement) setSettlementConfig(JSON.parse(savedSettlement));
  }, []);

  const handleManualSettle = useCallback(async (options: { skipDownload?: boolean; isAuto?: boolean } = {}) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Improved date filtering to handle local vs UTC differences more reliably
    const todaysTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      return txDate.getFullYear() === today.getFullYear() &&
             txDate.getMonth() === today.getMonth() &&
             txDate.getDate() === today.getDate();
    });
    
    if (todaysTransactions.length === 0) {
      const msg = t.settlementSkipped;
      
      console.log(msg);
      
      if (!options.isAuto) {
        alert(msg);
      }

      // Still mark as settled for today to prevent repeated auto-triggers
      const newConfig = { ...settlementConfig, lastSettledDate: todayStr };
      setSettlementConfig(newConfig);
      localStorage.setItem('stall_settlement_config', JSON.stringify(newConfig));
      return;
    }
    
    const { fileName, blob } = generateSettlementExcel(todaysTransactions, products);
    
    // 1. Local Download as backup (only if not skipped)
    if (!options.skipDownload) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }

    // 2. Cloud Upload if possible
    if (isLoggedIn && isOnline) {
      console.log(`Uploading ${fileName} to Google Drive...`);
      const result = await uploadSettlementToDrive(fileName, blob);
      if (!result.success) {
        console.error("Cloud settlement upload failed:", result.error);
        if (!options.isAuto) {
          alert(`${t.settlementFailed}: ${result.error}`);
        }
      } else {
        console.log(t.settlementSuccess);
      }
    } else if (!options.isAuto) {
      alert(t.settlementOffline);
    }
    
    const newConfig = { ...settlementConfig, lastSettledDate: todayStr };
    setSettlementConfig(newConfig);
    localStorage.setItem('stall_settlement_config', JSON.stringify(newConfig));
  }, [transactions, products, settlementConfig, isLoggedIn, isOnline, lang]);

  const addLog = useCallback((productId: string, productName: string, field: ProductChangeLog['field'], oldValue: string | number, newValue: string | number) => {
    const log: ProductChangeLog = {
      id: Math.random().toString(36).substr(2, 9),
      productId,
      productName,
      field,
      oldValue,
      newValue,
      timestamp: new Date().toISOString()
    };
    setChangeLogs(prev => [log, ...prev].slice(0, 200));
  }, []);

  const handleRefund = useCallback((transactionId: string, refunds: Refund[]) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.id === transactionId) {
        return { 
          ...tx, 
          refunds: [...(tx.refunds || []), ...refunds]
        };
      }
      return tx;
    }));

    // Update stock level for each refunded item
    refunds.forEach(refund => {
      // If reason is 'Damaged Item', we do not restock the item.
      if (refund.reason !== 'Damaged Item') {
        setProducts(prevProducts => prevProducts.map(p => {
          if (p.id === refund.itemId) {
            return { ...p, stock: p.stock + refund.quantity };
          }
          return p;
        }));
        
        // Log the change
        const product = products.find(p => p.id === refund.itemId);
        if (product) {
          addLog(refund.itemId, product.name, 'stock', product.stock, product.stock + refund.quantity);
        }
      }
    });
  }, [products, addLog]);

  // Auto-Settlement Checker - Refactored for reliability
  const settlementConfigRef = useRef(settlementConfig);
  const handleManualSettleRef = useRef(handleManualSettle);
  
  useEffect(() => { settlementConfigRef.current = settlementConfig; }, [settlementConfig]);
  useEffect(() => { handleManualSettleRef.current = handleManualSettle; }, [handleManualSettle]);

  useEffect(() => {
    const checkSettlement = () => {
      const config = settlementConfigRef.current;
      if (!config.enabled) return;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      // If already settled today, skip
      if (config.lastSettledDate === todayStr) return;

      const [targetH, targetM] = config.time.split(':').map(Number);
      const currentH = now.getHours();
      const currentM = now.getMinutes();

      // Trigger if current time is after/at the target time
      if (currentH > targetH || (currentH === targetH && currentM >= targetM)) {
        console.log("Automatic Daily Settlement Triggered at", now.toLocaleTimeString());
        handleManualSettleRef.current({ skipDownload: true, isAuto: true });
      }
    };

    // Run immediately on mount
    checkSettlement();

    // Then check every minute
    const interval = setInterval(checkSettlement, 60000);
    return () => clearInterval(interval);
  }, []); // Stable interval, uses refs for latest state/functions

  const handleCloudDownload = useCallback(async () => {
    if (!isLoggedIn || !isOnline) return;
    setIsInitialCloudLoading(true);
    try {
      const result = await downloadFromGoogleDrive();
      if (result.success && result.data) {
        const { products: p, transactions: t, reports: r, settings: s } = result.data;
        if (p) setProducts(p);
        if (t) setTransactions(t);
        if (r) setReports(r);
        if (s) {
          if (s.paymentQRCodes) setPaymentQRCodes(s.paymentQRCodes);
          if (s.telegramConfig) setTelegramConfig(s.telegramConfig);
          if (s.receiptConfig) setReceiptConfig(s.receiptConfig);
          if (s.lang) setLang(s.lang as Language);
          if (s.changeLogs) setChangeLogs(s.changeLogs);
          if ((s as any).settlementConfig) setSettlementConfig((s as any).settlementConfig);
        }
        isHydrated.current = true;
        setSyncStatus('synced');
      }
    } catch (e) {
      console.error("Cloud restoration failed:", e);
    } finally {
      setIsInitialCloudLoading(false);
    }
  }, [isLoggedIn, isOnline]);

  useEffect(() => {
    if (googleToken) {
      (window as any).google_access_token = googleToken;
      localStorage.setItem('google_access_token', googleToken);
    }
  }, [googleToken]);

  useEffect(() => { localStorage.setItem('stall_lang', lang); }, [lang]);
  useEffect(() => { localStorage.setItem('stall_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('stall_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('stall_reports', JSON.stringify(reports)); }, [reports]);
  useEffect(() => { localStorage.setItem('stall_change_logs', JSON.stringify(changeLogs)); }, [changeLogs]);
  useEffect(() => { localStorage.setItem('stall_payment_qrs', JSON.stringify(paymentQRCodes)); }, [paymentQRCodes]);
  useEffect(() => { localStorage.setItem('stall_telegram_config', JSON.stringify(telegramConfig)); }, [telegramConfig]);
  useEffect(() => { localStorage.setItem('stall_receipt_config', JSON.stringify(receiptConfig)); }, [receiptConfig]);
  useEffect(() => { localStorage.setItem('stall_settlement_config', JSON.stringify(settlementConfig)); }, [settlementConfig]);

  const initGsi = () => {
    if (typeof google !== 'undefined') {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.send',
          callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              setGoogleToken(tokenResponse.access_token);
              setIsLoggedIn(true);
              setLoginError(null);
              localStorage.setItem('stall_logged_in', 'true');
              handleCloudDownload();
            } else if (tokenResponse.error) {
              setLoginError(tokenResponse.error_description || tokenResponse.error);
            }
          },
          error_callback: (err: any) => {
            setLoginError(err.message || "Initialization error");
          }
        });
        setTokenClient(client);
      } catch (err) { 
        console.error("GSI Init Error:", err); 
        setLoginError("Failed to initialize Google Login.");
      }
    }
  };

  useEffect(() => {
    if (document.readyState === 'complete') initGsi();
    else window.addEventListener('load', initGsi);
    return () => window.removeEventListener('load', initGsi);
  }, []);

  useEffect(() => {
    if (isLoggedIn && isOnline && !isHydrated.current) {
      handleCloudDownload();
    }
  }, [isLoggedIn, isOnline, handleCloudDownload]);

  const handleLogin = () => {
    setLoginError(null);
    if (tokenClient) {
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      setLoginError("Login library not ready. Please check your internet connection.");
    }
  };

  const handleTokenExpiry = useCallback(() => {
    setGoogleToken(null);
    setIsLoggedIn(false);
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('stall_logged_in');
    if ((window as any).google_access_token) delete (window as any).google_access_token;
  }, []);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setGoogleToken(null);
    localStorage.clear();
    setProducts(INITIAL_PRODUCTS);
    setTransactions([]);
    setReports([]);
    isHydrated.current = false;
    if ((window as any).google_access_token) delete (window as any).google_access_token;
  }, []);

  const handleCloudSync = useCallback(async () => {
    if (!navigator.onLine || !isLoggedIn || !googleToken) {
      setSyncStatus('offline');
      return;
    }
    
    setSyncStatus('syncing');
    try {
      const result = await syncToGoogleDrive({
        products, 
        transactions, 
        reports,
        settings: { lang, telegramConfig, paymentQRCodes, receiptConfig, changeLogs, settlementConfig }
      });
      
      if (result.success) {
        const now = new Date().toISOString();
        setLastSyncTime(now);
        setSyncStatus('synced');
        localStorage.setItem('stall_last_sync', now);
      } else {
        if (result.error === 'UNAUTHORIZED') handleTokenExpiry();
        else setSyncStatus('error');
      }
    } catch (e) {
      setSyncStatus('error');
    }
  }, [products, transactions, reports, changeLogs, lang, telegramConfig, paymentQRCodes, receiptConfig, settlementConfig, isLoggedIn, googleToken, handleTokenExpiry]);

  useEffect(() => {
    if (isInitialMount.current || !isHydrated.current) {
      isInitialMount.current = false;
      return;
    }
    if (!isLoggedIn || !isOnline) return;

    const timer = setTimeout(() => handleCloudSync(), 2000);
    return () => clearTimeout(timer);
  }, [products, transactions, reports, changeLogs, lang, telegramConfig, paymentQRCodes, receiptConfig, settlementConfig, isLoggedIn, isOnline, handleCloudSync]);

  const handleCompleteSale = (tx: Transaction) => setTransactions(prev => [...prev, tx]);
  const handleUpdateStock = (productId: string, diff: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const newStock = Math.max(0, p.stock + diff);
        return { ...p, stock: newStock };
      }
      return p;
    }));
  };

  const handleBatchUpdateStock = (productIds: string[], amount: number) => {
    setProducts(prev => prev.map(p => {
      if (productIds.includes(p.id)) {
        const newStock = Math.max(0, p.stock + amount);
        addLog(p.id, p.name, 'batch_stock', p.stock, newStock);
        return { ...p, stock: newStock };
      }
      return p;
    }));
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts(prev => prev.map(p => {
      if (p.id === updated.id) {
        if (p.price !== updated.price) addLog(p.id, p.name, 'price', p.price, updated.price);
        if (p.stock !== updated.stock) addLog(p.id, p.name, 'stock', p.stock, updated.stock);
        return updated;
      }
      return p;
    }));
  };

  const handleDeleteProduct = (id: string) => {
    const product = products.find(p => p.id === id);
    if (product) addLog(id, product.name, 'status', 'active', 'deleted');
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleDeleteMultipleProducts = (ids: string[]) => {
    ids.forEach(id => {
      const product = products.find(p => p.id === id);
      if (product) addLog(id, product.name, 'status', 'active', 'deleted');
    });
    setProducts(prev => prev.filter(p => !ids.includes(p.id)));
  };

  const handleAddProduct = (p: Product) => {
    addLog(p.id, p.name, 'status', 'none', 'created');
    setProducts(prev => [...prev, p]);
  };

  if (!isLoggedIn) return <LandingView lang={lang} setLang={setLang} onLogin={handleLogin} />;

  if (isInitialCloudLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-[32px] flex items-center justify-center shadow-2xl shadow-blue-200 animate-bounce mb-8">
           <i className="fas fa-cloud-download-alt text-white text-3xl"></i>
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Restoring Your Stall...</h2>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Syncing Registry & Binary Assets</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <Layout 
        lang={lang} 
        setLang={setLang} 
        onLogout={handleLogout} 
        isSyncing={syncStatus === 'syncing'} 
        lastSyncTime={lastSyncTime}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      >
        <Routes>
          <Route path="/" element={<OrderingView products={products} lang={lang} onCompleteSale={handleCompleteSale} updateStock={handleUpdateStock} customQRCodes={paymentQRCodes} receiptConfig={receiptConfig} />} />
          <Route path="/inventory" element={<InventoryView products={products} lang={lang} onAddProduct={handleAddProduct} onUpdateProduct={handleUpdateProduct} onDeleteProduct={handleDeleteProduct} onDeleteMultipleProducts={handleDeleteMultipleProducts} changeLogs={changeLogs} onBatchUpdateStock={handleBatchUpdateStock} syncStatus={syncStatus} onManualSync={handleCloudSync} />} />
          <Route path="/analytics" element={<AnalyticsView transactions={transactions} products={products} lang={lang} />} />
          <Route path="/records" element={<RecordsView transactions={transactions} lang={lang} onRefund={handleRefund} paymentQRCodes={paymentQRCodes} />} />
          <Route path="/settings" element={
            <SettingsView 
              lang={lang} 
              paymentQRCodes={paymentQRCodes} 
              onUpdateQRCodes={setPaymentQRCodes} 
              telegramConfig={telegramConfig} 
              onUpdateTelegramConfig={setTelegramConfig} 
              onLogout={handleLogout} 
              onTestTelegram={async () => true} 
              onForceSync={handleCloudSync} 
              isSyncing={syncStatus === 'syncing'} 
              receiptConfig={receiptConfig} 
              onUpdateReceiptConfig={setReceiptConfig} 
              onForceDownload={handleCloudDownload} 
              lastSyncTime={lastSyncTime}
              settlementConfig={settlementConfig}
              onUpdateSettlementConfig={setSettlementConfig}
              onManualSettle={handleManualSettle}
            />
          } />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;
