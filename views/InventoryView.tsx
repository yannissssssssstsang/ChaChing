
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Language, ProductChangeLog, SyncStatus } from '../types';
import { TRANSLATIONS } from '../constants';
import { extractProductInfo } from '../services/geminiService';
import { listDriveFiles, getDriveFileAsBase64, getDriveFileAsBlob, verifyGoogleConnection } from '../services/googleDriveService';
import * as XLSX from 'xlsx';

interface InventoryViewProps {
  products: Product[];
  lang: Language;
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onDeleteMultipleProducts: (productIds: string[]) => void;
  changeLogs: ProductChangeLog[];
  onBatchUpdateStock: (productIds: string[], amount: number) => void;
  syncStatus?: SyncStatus;
  onManualSync?: () => Promise<void>;
  onTokenExpiry?: () => void;
}

const optimizeImage = (base64: string, maxWidth: number = 500): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
  });
};

const InventoryView: React.FC<InventoryViewProps> = ({ 
  products, 
  lang, 
  onAddProduct, 
  onUpdateProduct, 
  onDeleteProduct, 
  onDeleteMultipleProducts,
  changeLogs, 
  onBatchUpdateStock,
  syncStatus = 'synced',
  onManualSync,
  onTokenExpiry
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0, message: '' });
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [selectedDriveIds, setSelectedDriveIds] = useState<string[]>([]);
  const [tokenStatus, setTokenStatus] = useState<{ active: boolean; label: string }>({ active: false, label: 'Checking Token...' });

  const [swipeState, setSwipeState] = useState<{ id: string; dir: 'left' | 'right' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchAmount, setBatchAmount] = useState<string>('0');

  // Confirmation state
  const [confirmModal, setConfirmModal] = useState<{ show: boolean, type: 'batch_delete', targetIds?: string[] }>({ show: false, type: 'batch_delete' });

  const localInputRef = useRef<HTMLInputElement>(null);
  const manualImageInputRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  useEffect(() => {
    const checkToken = async () => {
      const status = await verifyGoogleConnection();
      setTokenStatus({ active: status.ok, label: status.ok ? 'Cloud Token Active' : 'No Access Token' });
    };
    checkToken();
  }, []);

  const loadDriveFiles = async () => {
    setIsLoadingDrive(true);
    setDriveError(null);
    const result = await listDriveFiles();
    if (result.error === 'UNAUTHORIZED' && onTokenExpiry) {
      onTokenExpiry();
      setShowDrivePicker(false);
    } else if (result.error) {
      setDriveError(result.error);
    }
    setDriveFiles(result.files || []);
    setIsLoadingDrive(false);
  };

  useEffect(() => {
    if (showDrivePicker) loadDriveFiles();
  }, [showDrivePicker]);

  const uniqueCategories = useMemo(() => {
    const cats = new Set(products.map(p => String(p.category || '').trim()).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  const getCategoryColor = (cat: string) => {
    const categoryName = String(cat || '');
    if (!categoryName) return 'bg-slate-100 text-slate-500';
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['bg-blue-50 text-blue-600 border-blue-100', 'bg-emerald-50 text-emerald-600 border-emerald-100', 'bg-purple-50 text-purple-600 border-purple-100', 'bg-amber-50 text-amber-600 border-amber-100', 'bg-rose-50 text-rose-600 border-rose-100'];
    return colors[Math.abs(hash) % colors.length];
  };

  const processFileBatch = async (files: (File | { name: string, data?: string, blob?: Blob, mimeType?: string })[]) => {
    setIsProcessing(true);
    setProcessingProgress({ current: 0, total: files.length, message: lang === Language.ZH ? '正在分析批量檔案...' : 'Analyzing batch...' });

    const imageBatch: { name: string, data: string }[] = [];
    const dataBatch: { name: string, blob: Blob }[] = [];

    for (const f of files) {
      if (f instanceof File) {
        if (f.name.match(/\.(xlsx)$/i)) dataBatch.push({ name: f.name, blob: f });
        else if (f.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
          const base64 = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onloadend = () => res(reader.result as string);
            reader.readAsDataURL(f);
          });
          imageBatch.push({ name: f.name, data: base64 });
        }
      } else {
        if (f.mimeType?.includes('image/')) {
          if (f.data) imageBatch.push({ name: f.name, data: f.data });
        } else if (f.blob || f.data) {
          // Spreadsheet from Drive
          const blob = f.blob || (f.data ? await (await fetch(f.data)).blob() : null);
          if (blob) dataBatch.push({ name: f.name, blob: blob });
        }
      }
    }

    const batchMap = new Map<string, Product>();

    if (dataBatch.length > 0) {
      setProcessingProgress(prev => ({ ...prev, message: lang === Language.ZH ? '正在解析數據表格...' : 'Parsing data tables...' }));
      for (const item of dataBatch) {
        const data: any[] = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const bstr = e.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
          };
          reader.readAsBinaryString(item.blob);
        });

        data.forEach(row => {
          let name = String(row.Name || row['名稱'] || row.ProductName || '').trim();
          if (!name) return;
          // Enforce 30 character limit
          if (name.length > 30) name = name.substring(0, 30);
          
          const productData = {
            price: parseFloat(row.Price || row['價格'] || row['單價'] || 0),
            cost: parseFloat(row.Cost || row['成本'] || 0),
            stock: parseInt(row.Stock || row['庫存'] || row['數量'] || 0),
            category: String(row.Category || row['分類'] || '').trim()
          };
          const existing = products.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
          if (existing) {
            const updated = { ...existing, ...productData };
            onUpdateProduct(updated);
            batchMap.set(name.toLowerCase(), updated);
          } else {
            const newProd: Product = { id: Math.random().toString(36).substr(2, 9), name, ...productData, isExtracting: false };
            onAddProduct(newProd);
            batchMap.set(name.toLowerCase(), newProd);
          }
        });
      }
    }

    if (imageBatch.length > 0) {
      setProcessingProgress(prev => ({ ...prev, current: 0, total: imageBatch.length, message: lang === Language.ZH ? '正在優化並關聯圖片...' : 'Optimizing & associating images...' }));
      for (const img of imageBatch) {
        const thumb = await optimizeImage(img.data, 400);
        const fileNameWithoutExt = img.name.replace(/\.[^/.]+$/, "").trim();
        const fileNameKey = fileNameWithoutExt.toLowerCase();
        const matchedProduct = products.find(p => p.name.trim().toLowerCase() === fileNameKey) || batchMap.get(fileNameKey);

        if (matchedProduct) {
          onUpdateProduct({ ...matchedProduct, image: thumb });
        } else {
          let finalName = fileNameWithoutExt;
          if (finalName.length > 30) finalName = finalName.substring(0, 30);

          onAddProduct({
            id: Math.random().toString(36).substr(2, 9),
            name: finalName,
            price: 0,
            cost: 0,
            category: '',
            stock: 0,
            image: thumb,
            isExtracting: false
          });
        }
        setProcessingProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
    }
    setIsProcessing(false);
    setShowAddMenu(false);
  };

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFileBatch(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleManualImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingProduct) {
      const base64 = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(file);
      });
      const thumb = await optimizeImage(base64, 400);
      setEditingProduct({ ...editingProduct, image: thumb });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isHorizontalSwipe.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (!touchStartRef.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = touchStartRef.current.x - currentX;
    const diffY = Math.abs(touchStartRef.current.y - currentY);
    
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10) isHorizontalSwipe.current = Math.abs(diffX) > diffY;
    }
    
    if (isHorizontalSwipe.current) {
      if (diffX > 50) setSwipeState({ id, dir: 'left' });
      else if (diffX < -50) setSwipeState({ id, dir: 'right' });
      else if (Math.abs(diffX) < 10) setSwipeState(null);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    isHorizontalSwipe.current = null;
  };

  const handleDelete = (id: string) => {
    onDeleteProduct(id);
    setSwipeState(null);
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  const handleDuplicate = (product: Product) => {
    let newName = `${product.name}-copy`;
    if (newName.length > 30) {
      newName = `${product.name.substring(0, 25)}-copy`;
    }
    const newProduct: Product = {
      ...product,
      id: Math.random().toString(36).substr(2, 9),
      name: newName
    };
    onAddProduct(newProduct);
    setSwipeState(null);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  };

  const handlePerformBatchUpdate = () => {
    const amount = parseInt(batchAmount) || 0;
    if (amount !== 0) onBatchUpdateStock(selectedIds, amount);
    setShowBatchModal(false);
    setSelectedIds([]);
    setBatchAmount('0');
  };

  const handleConfirmAction = () => {
    if (confirmModal.type === 'batch_delete' && confirmModal.targetIds) {
      onDeleteMultipleProducts(confirmModal.targetIds);
      setSelectedIds([]);
      // If the editing product was deleted, close the edit modal
      if (editingProduct && confirmModal.targetIds.includes(editingProduct.id)) {
        setEditingProduct(null);
      }
    }
    setConfirmModal({ ...confirmModal, show: false });
  };

  const handleImportFromDrive = async () => {
    setIsLoadingDrive(true);
    const imports: { name: string, data?: string, blob?: Blob, mimeType?: string }[] = [];
    for (const id of selectedDriveIds) {
      const file = driveFiles.find(f => f.id === id);
      if (!file) continue;
      
      if (file.mimeType.includes('image/')) {
        const base64 = await getDriveFileAsBase64(id);
        if (base64) imports.push({ name: file.name, data: base64, mimeType: file.mimeType });
      } else {
        const blob = await getDriveFileAsBlob(id);
        if (blob) imports.push({ name: file.name, blob: blob, mimeType: file.mimeType });
      }
    }
    await processFileBatch(imports);
    setShowDrivePicker(false);
    setSelectedDriveIds([]);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleGlobalClick = () => setSwipeState(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const getFileIcon = (file: any) => {
    if (file.mimeType.includes('image/')) return 'fa-image';
    if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel')) return 'fa-file-excel';
    return 'fa-file';
  };

  const getLogIcon = (field: ProductChangeLog['field']) => {
    switch(field) {
      case 'price': return 'fa-tag';
      case 'stock': return 'fa-box-open';
      case 'batch_stock': return 'fa-boxes-stacked';
      case 'status': return 'fa-circle-info';
      default: return 'fa-history';
    }
  };

  const getLogColor = (log: ProductChangeLog) => {
    if (log.field === 'status') {
      if (log.newValue === 'created') return 'bg-emerald-50 text-emerald-500';
      if (log.newValue === 'deleted') return 'bg-red-50 text-red-500';
    }
    if (log.field === 'price' || log.field === 'stock' || log.field === 'batch_stock') {
      return (Number(log.newValue) > Number(log.oldValue)) ? 'bg-blue-50 text-blue-500' : 'bg-amber-50 text-amber-500';
    }
    return 'bg-slate-50 text-slate-500';
  };

  const formatLogTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${year}${month}${day} ${time}`;
  };

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t.inventory}</h2>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-0.5 rounded-full shadow-sm">
                <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : (syncStatus === 'syncing' ? 'bg-blue-500 sync-pulse' : 'bg-amber-500 animate-pulse')}`}></div>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                  {syncStatus === 'synced' ? 'Cloud Synced' : (syncStatus === 'syncing' ? 'Saving to Cloud' : 'Offline')}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setShowHistory(true)}
            className="w-12 h-12 bg-white border border-slate-100 rounded-xl text-slate-400 flex items-center justify-center hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm active:scale-95"
          >
            <i className="fas fa-clock-rotate-left"></i>
          </button>
          <div className="relative flex-1 sm:w-64">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search items..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>
          
          <div className="flex gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowAddMenu(!showAddMenu); }}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-blue-100 flex items-center gap-2 active:scale-95 transition-all"
            >
              <i className={`fas ${showAddMenu ? 'fa-times' : 'fa-plus'}`}></i>
              <span className="hidden sm:inline">{showAddMenu ? 'Close' : 'Add Item'}</span>
            </button>
          </div>
        </div>
      </div>

      {showAddMenu && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-scale-in" onClick={e => e.stopPropagation()}>
          <button onClick={() => localInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-100 rounded-[32px] hover:bg-slate-50 transition-all shadow-sm group">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-laptop-code text-2xl"></i></div>
            <div>
              <p className="font-black text-slate-800 uppercase tracking-wider text-[11px] mb-1">Local Drive</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Excel (.xlsx) / Images</p>
            </div>
          </button>
          <button onClick={() => setShowDrivePicker(true)} className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-100 rounded-[32px] hover:bg-slate-50 transition-all shadow-sm group">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fab fa-google-drive text-2xl"></i></div>
            <div>
              <p className="font-black text-slate-800 uppercase tracking-wider text-[11px] mb-1">Google Drive</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Sheets / .xlsx / Images</p>
            </div>
          </button>
          <button onClick={() => { setEditingProduct({ id: Math.random().toString(36).substr(2, 9), name: '', price: 0, cost: 0, stock: 0, category: '' }); setShowAddMenu(false); }} className="flex flex-col items-center justify-center gap-3 p-8 bg-white border border-slate-100 rounded-[32px] hover:bg-slate-50 transition-all shadow-sm group">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><i className="fas fa-keyboard text-2xl"></i></div>
            <div>
              <p className="font-black text-slate-800 uppercase tracking-wider text-[11px] mb-1">Manual Entry</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Quick Single Item</p>
            </div>
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-100 animate-scale-in">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3"><i className="fas fa-magic animate-pulse"></i><p className="font-black text-sm uppercase tracking-[0.2em]">{processingProgress.message}</p></div>
            <span className="text-sm font-black">{Math.round((processingProgress.current / (processingProgress.total || 1)) * 100)}%</span>
          </div>
          <div className="w-full bg-blue-500/50 h-2 rounded-full overflow-hidden"><div className="bg-white h-full transition-all duration-500" style={{ width: `${(processingProgress.current / (processingProgress.total || 1)) * 100}%` }}></div></div>
        </div>
      )}

      <div className="space-y-4">
        {filteredProducts.map((product) => (
          <div key={product.id} className={`relative overflow-hidden rounded-3xl bg-white border transition-all group ${selectedIds.includes(product.id) ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-slate-100 shadow-sm hover:shadow-md'}`} onClick={(e) => { e.stopPropagation(); if (swipeState?.id === product.id) setSwipeState(null); else toggleSelection(product.id); }} onTouchStart={handleTouchStart} onTouchMove={(e) => handleTouchMove(e, product.id)} onTouchEnd={handleTouchEnd}>
            {/* Delete Button (Right Side, swipe left) */}
            <div className={`absolute inset-y-0 right-0 w-24 bg-red-500 flex items-center justify-center transition-transform duration-300 ease-out ${swipeState?.id === product.id && swipeState.dir === 'left' ? 'translate-x-0' : 'translate-x-full'}`}>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }} className="text-white flex flex-col items-center gap-1 w-full h-full justify-center active:bg-red-600 transition-colors">
                <i className="fas fa-trash-can text-sm"></i>
                <span className="text-[9px] font-black uppercase tracking-widest">Delete</span>
              </button>
            </div>

            {/* Duplicate Button (Left Side, swipe right) */}
            <div className={`absolute inset-y-0 left-0 w-24 bg-blue-600 flex items-center justify-center transition-transform duration-300 ease-out ${swipeState?.id === product.id && swipeState.dir === 'right' ? 'translate-x-0' : '-translate-x-full'}`}>
              <button onClick={(e) => { e.stopPropagation(); handleDuplicate(product); }} className="text-white flex flex-col items-center gap-1 w-full h-full justify-center active:bg-blue-700 transition-colors">
                <i className="fas fa-copy text-sm"></i>
                <span className="text-[9px] font-black uppercase tracking-widest">Copy</span>
              </button>
            </div>

            <div className={`flex items-center gap-4 p-4 transition-transform duration-300 ease-out ${swipeState?.id === product.id ? (swipeState.dir === 'left' ? '-translate-x-24' : 'translate-x-24') : 'translate-x-0'}`}>
              <div className="relative shrink-0">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden relative"><img src={product.image || `https://picsum.photos/seed/${product.id}/200`} alt={product.name} className="w-full h-full object-cover" /></div>
                {selectedIds.includes(product.id) && <div className="absolute -top-1 -left-1 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 animate-scale-in"><i className="fas fa-check text-[10px]"></i></div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1"><h3 className="font-black text-slate-800 text-sm truncate uppercase tracking-tight">{product.name || 'Unnamed Product'}</h3>{product.category && <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${getCategoryColor(product.category)}`}>{product.category}</span>}</div>
                <div className="flex items-baseline gap-4">
                  <div className="flex flex-col"><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Price</span><span className="text-sm font-black text-blue-600">${product.price}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stock</span><span className={`text-sm font-black ${product.stock < (product.threshold || 5) ? 'text-red-500' : 'text-slate-800'}`}>{product.stock}</span></div>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setEditingProduct(product); }} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-colors"><i className="fas fa-edit text-xs"></i></button>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200"><i className="fas fa-boxes-stacked text-slate-200 text-5xl mb-4"></i><p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">Inventory Empty</p></div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-8 left-4 right-4 md:left-auto md:right-8 md:w-[450px] z-[100] animate-scale-in">
          <div className="bg-slate-900 text-white p-4 rounded-[32px] shadow-2xl flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <span className="bg-blue-600 w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shadow-lg shadow-blue-500/20">{selectedIds.length}</span>
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Selected</span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <button onClick={() => setShowBatchModal(true)} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all">Stock</button>
              <button onClick={() => setSelectedIds([])} className="w-10 h-10 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center hover:text-white transition-colors"><i className="fas fa-times text-xs"></i></button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[300] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-scale-in">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <h3 className="text-xl font-black text-slate-800 text-center uppercase tracking-tight mb-2">
              Delete Selected?
            </h3>
            <p className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed mb-8">
              Are you sure you want to delete {confirmModal.targetIds?.length} products?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setConfirmModal({ ...confirmModal, show: false })} className="p-5 bg-slate-100 text-slate-500 rounded-[24px] font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">Cancel</button>
              <button onClick={handleConfirmAction} className="p-5 bg-red-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-xl shadow-red-100">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => setShowBatchModal(false)}>
          <div className="bg-white w-full max-sm rounded-[40px] p-8 shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6"><div><h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Batch Stock</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Updating {selectedIds.length} items</p></div><button onClick={() => setShowBatchModal(false)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"><i className="fas fa-times"></i></button></div>
            <div className="space-y-6">
              <div className="text-center"><p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Enter quantity to adjust</p><div className="flex items-center justify-center gap-4"><button onClick={() => setBatchAmount(prev => String((parseInt(prev) || 0) - 1))} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 active:scale-90 transition-all"><i className="fas fa-minus"></i></button><input type="number" value={batchAmount} onChange={e => setBatchAmount(e.target.value)} className="w-24 p-4 bg-slate-50 border border-slate-100 rounded-[20px] text-center text-xl font-black text-blue-600 outline-none focus:border-blue-500 shadow-inner" /><button onClick={() => setBatchAmount(prev => String((parseInt(prev) || 0) + 1))} className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 active:scale-90 transition-all"><i className="fas fa-plus"></i></button></div></div>
              <button onClick={handlePerformBatchUpdate} className="w-full bg-blue-600 text-white p-5 rounded-[24px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-100 transition-all active:scale-[0.98]">Process Batch</button>
            </div>
          </div>
        </div>
      )}

      {showDrivePicker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4" onClick={() => setShowDrivePicker(false)}>
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-scale-in max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-emerald-50/30"><div><h3 className="text-xl font-black text-slate-800 flex items-center gap-3"><i className="fab fa-google-drive text-emerald-600"></i>Cloud Picker</h3><div className="flex items-center gap-2 mt-1"><div className={`w-1.5 h-1.5 rounded-full ${tokenStatus.active ? 'bg-emerald-500' : 'bg-red-500'}`}></div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{tokenStatus.label}</p></div></div><button onClick={() => setShowDrivePicker(false)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm"><i className="fas fa-times"></i></button></div>
            <div className="flex-1 overflow-y-auto p-8">
              {isLoadingDrive ? <div className="flex flex-col items-center justify-center py-20 gap-4"><i className="fas fa-spinner fa-spin text-3xl text-emerald-600"></i><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Querying Drive...</p></div> : driveError ? <div className="text-center py-20 bg-red-50 rounded-3xl p-8"><i className="fas fa-triangle-exclamation text-3xl text-red-500 mb-4"></i><p className="font-black text-red-700 uppercase tracking-widest text-xs">Drive Access Error</p><button onClick={loadDriveFiles} className="mt-6 px-6 py-2 bg-white text-red-600 text-[10px] font-black uppercase rounded-xl">Retry Access</button></div> : driveFiles.length > 0 ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">{driveFiles.map(file => <button key={file.id} onClick={() => setSelectedDriveIds(prev => prev.includes(file.id) ? prev.filter(x => x !== file.id) : [...prev, file.id])} className={`relative p-3 rounded-3xl border-2 transition-all ${selectedDriveIds.includes(file.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'}`}><div className="aspect-square bg-slate-50 rounded-2xl mb-2 flex items-center justify-center relative overflow-hidden">{file.thumbnailLink ? <img src={file.thumbnailLink.replace('=s220', '=s400')} className="w-full h-full object-cover" /> : <i className={`fas ${getFileIcon(file)} text-3xl opacity-40`}></i>}{selectedDriveIds.includes(file.id) && <div className="absolute inset-0 bg-emerald-600/20 flex items-center justify-center"><i className="fas fa-check-circle text-white text-3xl"></i></div>}</div><p className="text-[10px] font-black text-slate-600 uppercase tracking-tighter truncate">{file.name}</p></button>)}</div> : <div className="text-center py-20 opacity-30"><i className="fas fa-cloud-moon text-5xl mb-4"></i><p className="font-black uppercase tracking-widest text-xs">No matching files</p></div>}
            </div>
            <div className="p-8 bg-slate-50"><button onClick={handleImportFromDrive} disabled={selectedDriveIds.length === 0 || isLoadingDrive || !!driveError} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 disabled:opacity-50 active:scale-[0.98]">Import Selected ({selectedDriveIds.length})</button></div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-4" onClick={() => setShowHistory(false)}>
          <div className="bg-white w-full max-w-lg rounded-[48px] p-8 shadow-2xl animate-scale-in max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 shrink-0"><h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Inventory History</h3><button onClick={() => setShowHistory(false)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"><i className="fas fa-times"></i></button></div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {changeLogs.length > 0 ? changeLogs.map(log => (
                <div key={log.id} className="p-4 bg-slate-50 border border-slate-100 rounded-3xl flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getLogColor(log)}`}>
                    <i className={`fas ${getLogIcon(log.field)} text-xs`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-black text-slate-800 truncate uppercase tracking-tight">{log.productName}</p>
                      <span className="text-[9px] font-bold text-slate-400 uppercase ml-2 whitespace-nowrap">
                        {formatLogTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {log.field === 'status' ? (log.newValue === 'created' ? 'Created' : 'Deleted') : log.field.replace('_', ' ')}
                      </span>
                      {log.field !== 'status' && (
                        <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
                          <span className="text-[10px] font-bold text-slate-400">{log.oldValue}</span>
                          <i className="fas fa-arrow-right text-[8px] text-slate-300"></i>
                          <span className={`text-[10px] font-black ${Number(log.newValue) > Number(log.oldValue) ? 'text-emerald-500' : 'text-red-500'}`}>{log.newValue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-20 opacity-30">
                  <i className="fas fa-clock-rotate-left text-5xl mb-4"></i>
                  <p className="font-black uppercase tracking-widest text-xs">No edit history</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-4" onClick={() => setEditingProduct(null)}>
          <div className="bg-white w-full max-w-lg rounded-[48px] p-8 shadow-2xl animate-scale-in max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {products.some(p => p.id === editingProduct.id) ? 'Edit Item' : 'Manual Entry'}
              </h3>
              <button onClick={() => setEditingProduct(null)} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"><i className="fas fa-times"></i></button>
            </div>
            
            <div className="space-y-5">
              <div className="w-full aspect-video bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden cursor-pointer group" onClick={() => manualImageInputRef.current?.click()}>
                {editingProduct.image ? (
                  <>
                    <img src={editingProduct.image} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-black uppercase tracking-widest">Update Photo</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm mb-3"><i className="fas fa-camera text-xl"></i></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tap to add photo</p>
                  </>
                )}
              </div>
              <input type="file" ref={manualImageInputRef} onChange={handleManualImageUpload} className="hidden" accept="image/*" />
              
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Product Name</label>
                <input 
                  type="text" 
                  value={editingProduct.name} 
                  maxLength={30}
                  onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold outline-none focus:border-blue-500 shadow-sm" 
                  placeholder="Product Title (Max 30 chars)" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Sell Price ($)</label>
                  <input 
                    type="number" 
                    value={editingProduct.price === 0 ? '' : editingProduct.price} 
                    placeholder="0"
                    onChange={e => setEditingProduct({...editingProduct, price: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold outline-none focus:border-blue-500 shadow-sm text-blue-600" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Cost Price ($)</label>
                  <input 
                    type="number" 
                    value={editingProduct.cost === 0 ? '' : editingProduct.cost} 
                    placeholder="0"
                    onChange={e => setEditingProduct({...editingProduct, cost: e.target.value === '' ? 0 : parseFloat(e.target.value)})} 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold outline-none focus:border-blue-500 shadow-sm text-slate-500" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Available Stock</label>
                  <input 
                    type="number" 
                    value={editingProduct.stock === 0 ? '' : editingProduct.stock} 
                    placeholder="0"
                    onChange={e => setEditingProduct({...editingProduct, stock: e.target.value === '' ? 0 : parseInt(e.target.value)})} 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold outline-none focus:border-blue-500 shadow-sm" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Category</label>
                  <input list="cat-list" type="text" value={editingProduct.category} onChange={e => setEditingProduct({...editingProduct, category: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-[20px] font-bold outline-none focus:border-blue-500 shadow-sm" />
                  <datalist id="cat-list">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
              </div>
              
              <div className="pt-2">
                <button 
                  onClick={() => { 
                    if (products.find(p => p.id === editingProduct.id)) onUpdateProduct(editingProduct); 
                    else onAddProduct(editingProduct); 
                    setEditingProduct(null); 
                  }} 
                  disabled={!editingProduct.name} 
                  className="w-full bg-blue-600 text-white p-5 rounded-[24px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-100 active:scale-95 transition-all"
                >
                  Save Item
                </button>
              </div>

              {/* Redesigned Individual Delete Button */}
              {products.some(p => p.id === editingProduct.id) && (
                <div className="mt-8 pt-6 border-t border-slate-50">
                  <div className="flex items-center gap-3 mb-4 opacity-50 px-1">
                    <i className="fas fa-shield-halved text-[10px] text-red-500"></i>
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-[0.3em]">Danger Zone</p>
                  </div>
                  <button 
                    onClick={() => {
                      setConfirmModal({ show: true, type: 'batch_delete', targetIds: [editingProduct.id] });
                    }}
                    className="w-full py-4 bg-white text-red-500 border border-red-100 rounded-[24px] font-black uppercase tracking-[0.15em] text-[10px] flex items-center justify-center gap-3 shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all active:scale-[0.98]"
                  >
                    <i className="fas fa-trash-can"></i>
                    Remove from Inventory
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <input type="file" ref={localInputRef} onChange={handleLocalUpload} className="hidden" multiple accept=".xlsx,image/*" />
    </div>
  );
};

export default InventoryView;
