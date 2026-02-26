
import React, { useState, useMemo, useEffect } from 'react';
import { Product, CartItem, Language, Transaction, PaymentQRCodes, ReceiptConfig } from '../types';
import { TRANSLATIONS } from '../constants';
import { sendReceiptEmail } from '../services/gmailService';

interface OrderingViewProps {
  products: Product[];
  lang: Language;
  onCompleteSale: (transaction: Transaction) => void;
  updateStock: (productId: string, quantity: number) => void;
  customQRCodes?: PaymentQRCodes;
  receiptConfig?: ReceiptConfig;
}

const OrderingView: React.FC<OrderingViewProps> = ({ products, lang, onCompleteSale, updateStock, customQRCodes = {}, receiptConfig }) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  
  const [showReceiptChoice, setShowReceiptChoice] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocationLocked, setIsLocationLocked] = useState(false);

  // Cash calculator state
  const [receivedBills, setReceivedBills] = useState<number[]>([]);
  const totalReceived = useMemo(() => receivedBills.reduce((a, b) => a + b, 0), [receivedBills]);

  // Discount state
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [oneTimeOfferPrice, setOneTimeOfferPrice] = useState<number>(0);
  const [discountTargetIds, setDiscountTargetIds] = useState<string[]>([]); // Empty means all
  
  const [showImages, setShowImages] = useState(() => {
    const saved = localStorage.getItem('stall_show_images');
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('stall_show_images', String(showImages));
  }, [showImages]);

  useEffect(() => {
    let watchId: number | null = null;
    if (isCheckoutOpen && navigator.geolocation) {
      setIsLocationLocked(false);
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
          setIsLocationLocked(true);
        },
        (error) => { console.warn("Geolocation failed", error); setIsLocationLocked(false); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
    return () => { if (watchId !== null) navigator.geolocation.clearWatch(watchId); };
  }, [isCheckoutOpen]);

  const availableProducts = useMemo(() => products.filter(p => !p.isExtracting), [products]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return availableProducts;
    const lowerQuery = searchTerm.toLowerCase();
    return availableProducts.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.category && p.category.toLowerCase().includes(lowerQuery))
    );
  }, [availableProducts, searchTerm]);

  const availablePaymentMethods = useMemo(() => {
    const methods = ['CASH'];
    Object.keys(customQRCodes).forEach(key => { if (customQRCodes[key]) methods.push(key); });
    return methods;
  }, [customQRCodes]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomerEmail(val);
    setApiError(null);
    setEmailError((val && !validateEmail(val)) ? (lang === Language.ZH ? '請輸入有效的電子郵件' : 'Invalid email') : null);
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => item.id === productId ? { ...item, quantity: item.quantity - 1 } : item);
      }
      const newCart = prev.filter(item => item.id !== productId);
      // Remove from discount targets if item is removed from cart
      setDiscountTargetIds(targets => targets.filter(id => id !== productId));
      return newCart;
    });
  };

  // Auto-switch to "All Items" if all items are selected
  useEffect(() => {
    if (discountTargetIds.length > 0 && discountTargetIds.length >= cart.length) {
      setDiscountTargetIds([]);
    }
  }, [discountTargetIds, cart.length]);

  const discountedCart = useMemo(() => {
    if (discountType === 'none') return cart.map(item => ({ ...item, discountedPrice: item.price }));

    const targetItems = discountTargetIds.length === 0 
      ? cart 
      : cart.filter(item => discountTargetIds.includes(item.id));
    
    if (targetItems.length === 0) return cart.map(item => ({ ...item, discountedPrice: item.price }));

    if (discountType === 'percentage') {
      const multiplier = (100 - discountPercentage) / 100;
      return cart.map(item => {
        if (discountTargetIds.length === 0 || discountTargetIds.includes(item.id)) {
          return { ...item, discountedPrice: item.price * multiplier };
        }
        return { ...item, discountedPrice: item.price };
      });
    }

    if (discountType === 'fixed') {
      const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const totalDiscount = cartTotal - oneTimeOfferPrice;
      
      const numUniqueTargetItems = targetItems.length;
      if (numUniqueTargetItems === 0) return cart.map(item => ({ ...item, discountedPrice: item.price }));

      const discountPerUniqueItem = totalDiscount / numUniqueTargetItems;

      return cart.map(item => {
        const isTarget = discountTargetIds.length === 0 || discountTargetIds.includes(item.id);
        if (isTarget) {
          const unitDiscount = (discountPerUniqueItem / item.quantity);
          return { ...item, discountedPrice: Math.max(0, item.price - unitDiscount) };
        }
        return { ...item, discountedPrice: item.price };
      });
    }

    return cart.map(item => ({ ...item, discountedPrice: item.price }));
  }, [cart, discountType, discountPercentage, oneTimeOfferPrice, discountTargetIds]);

  const cartTotal = discountedCart.reduce((acc, item) => acc + ((item.discountedPrice !== undefined ? item.discountedPrice : item.price) * item.quantity), 0);
  const originalTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const discountAmount = originalTotal - cartTotal;
  const cartProfit = discountedCart.reduce((acc, item) => acc + (((item.discountedPrice !== undefined ? item.discountedPrice : item.price) - item.cost) * item.quantity), 0);

  const changeDue = useMemo(() => {
    return Math.max(0, totalReceived - cartTotal);
  }, [totalReceived, cartTotal]);

  const finalizeTransaction = async (emailSent: boolean = false) => {
    if (emailSent && !validateEmail(customerEmail)) return;
    setApiError(null);

    const transaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      items: [...discountedCart],
      total: cartTotal,
      originalTotal: originalTotal,
      discountAmount: discountAmount,
      discountType: discountType !== 'none' ? discountType : undefined,
      discountValue: discountType === 'percentage' ? discountPercentage : (discountType === 'fixed' ? oneTimeOfferPrice : undefined),
      paymentMethod: selectedPayment!,
      profit: cartProfit,
      customerEmail: (emailSent && customerEmail) ? customerEmail : undefined,
      location: currentCoords ? { ...currentCoords, name: 'Stall Transaction' } : undefined
    };

    if (emailSent) {
      setIsSendingEmail(true);
      try {
        const result = await sendReceiptEmail(transaction, customerEmail, lang, receiptConfig);
        if (result.success) {
          setIsEmailSent(true);
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          let msg = lang === Language.ZH ? '發送失敗' : 'Failed to send';
          if (result.error === 'TOKEN_EXPIRED') msg = lang === Language.ZH ? 'Session 已過期，請重新登錄' : 'Session expired. Please re-login.';
          else if (result.error === 'NO_TOKEN') msg = lang === Language.ZH ? '找不到授權' : 'No authorization token.';
          else if (result.error) msg = result.error;
          
          setApiError(msg);
          return; // Exit if email fails so user can retry or skip
        }
      } catch (err) {
        setApiError(lang === Language.ZH ? '網絡錯誤' : 'Network Error');
        return;
      } finally {
        setIsSendingEmail(false);
      }
    }

    // Success path
    onCompleteSale(transaction);
    cart.forEach(item => updateStock(item.id, -item.quantity));
    setCart([]);
    setIsCheckoutOpen(false);
    setSelectedPayment(null);
    setShowReceiptChoice(false);
    setShowEmailInput(false);
    setCustomerEmail('');
    setIsEmailSent(false);
    setApiError(null);
    setCurrentCoords(null);
    setReceivedBills([]);
    setDiscountType('none');
    setDiscountPercentage(0);
    setOneTimeOfferPrice(0);
    setDiscountTargetIds([]);
  };

  const groupedProducts = useMemo(() => {
    return filteredProducts.reduce((acc, product) => {
      const cat = String(product.category || '').trim() || (lang === Language.ZH ? '未分類' : 'Uncategorized');
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {} as Record<string, Product[]>);
  }, [filteredProducts, lang]);

  const categories = useMemo(() => Object.keys(groupedProducts).sort(), [groupedProducts]);

  return (
    <div className="space-y-8 pb-32 md:pb-8">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t.ordering}</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select items for cart</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setShowImages(!showImages)}
            title={showImages ? t.hideImages : t.showImages}
            className="flex items-center justify-center w-10 h-10 sm:w-auto sm:px-4 bg-white border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all shadow-sm shrink-0"
          >
            <i className={`fas ${showImages ? 'fa-image' : 'fa-font'} ${showImages ? '' : 'text-blue-500'}`}></i>
            <span className="hidden sm:inline ml-2">{showImages ? t.hideImages : t.showImages}</span>
          </button>
        </div>
      </div>

      {categories.length > 0 ? categories.map((category) => {
        const catColor = (cat: string) => {
          let hash = 0;
          for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
          const colors = ['bg-blue-50 text-blue-600 border-blue-100', 'bg-emerald-50 text-emerald-600 border-emerald-100', 'bg-purple-50 text-purple-600 border-purple-100', 'bg-amber-50 text-amber-600 border-amber-100', 'bg-rose-50 text-rose-600 border-rose-100'];
          return colors[Math.abs(hash) % colors.length];
        };
        const colorClass = catColor(category);
        return (
          <div key={category} className="space-y-4">
            <button onClick={() => setCollapsedCategories(prev => ({...prev, [category]: !prev[category]}))} className={`w-full flex justify-between items-center p-4 rounded-2xl border ${colorClass} shadow-sm`}>
              <div className="flex items-center gap-3">
                <i className="fas fa-layer-group text-xs opacity-50"></i>
                <h2 className="text-xs font-black uppercase tracking-widest">{category}</h2>
              </div>
              <i className={`fas fa-chevron-down text-xs transition-transform ${collapsedCategories[category] ? '-rotate-90' : ''}`}></i>
            </button>
            {!collapsedCategories[category] && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 animate-scale-in origin-top">
                {groupedProducts[category].map(product => {
                  const qty = cart.find(i => i.id === product.id)?.quantity || 0;
                  return (
                    <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0} className={`relative flex flex-col p-3 bg-white rounded-2xl shadow-sm border border-slate-100 text-left transition-all hover:shadow-md ${product.stock <= 0 ? 'opacity-50 grayscale' : ''}`}>
                      {qty > 0 && <div className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white z-10">{qty}</div>}
                      {showImages && (
                        <div className="w-full aspect-square bg-slate-50 rounded-xl mb-3 overflow-hidden border border-slate-100">
                          <img src={product.image || `https://picsum.photos/seed/${product.id}/400`} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <h3 className="font-bold text-sm text-slate-800 line-clamp-1 uppercase tracking-tight">{product.name}</h3>
                      <div className="flex justify-between w-full items-center mt-1">
                        <span className="text-blue-600 font-extrabold text-base">${product.price}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${product.stock < (product.threshold || 5) ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'}`}>{product.stock}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      }) : (
        <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200">
          <i className="fas fa-search text-slate-200 text-5xl mb-4"></i>
          <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">No matching products</p>
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-20 md:bottom-8 left-4 right-4 md:left-auto md:right-8 md:w-96 z-[100] animate-scale-in">
          <button onClick={() => setIsCheckoutOpen(true)} className="w-full bg-blue-600 text-white p-5 rounded-[24px] shadow-2xl shadow-blue-200 flex justify-between items-center font-black hover:bg-blue-700 transition-all group">
            <div className="flex items-center gap-3">
              <span className="bg-white text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black">{cart.reduce((a, b) => a + b.quantity, 0)}</span>
              <span className="uppercase tracking-widest text-xs">{t.checkout}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">${cartTotal.toFixed(1)}</span>
              <i className="fas fa-arrow-right text-xs"></i>
            </div>
          </button>
        </div>
      )}

      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-end md:items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-6 md:p-8 shadow-2xl animate-scale-in max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{showReceiptChoice ? 'Record Status' : 'Order Summary'}</h3>
              <button onClick={() => { setIsCheckoutOpen(false); setReceivedBills([]); }} className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"><i className="fas fa-times"></i></button>
            </div>

            {!showReceiptChoice ? (
              <div className="space-y-6">
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                  {discountedCart.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                      <div className="flex flex-col flex-1 min-w-0 mr-4">
                        <span className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${item.discountedPrice !== item.price ? 'text-slate-300 line-through' : 'text-slate-400'}`}>
                            ${item.price}
                          </span>
                          {item.discountedPrice !== item.price && (
                            <span className={`text-[10px] font-black uppercase tracking-widest ${item.discountedPrice! < item.price ? 'text-emerald-500' : 'text-blue-500'}`}>
                              ${item.discountedPrice?.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center bg-white rounded-full p-1 border border-slate-200 shadow-sm">
                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600"><i className="fas fa-minus text-[10px]"></i></button>
                        <span className="w-8 text-center text-sm font-black text-slate-700">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white"><i className="fas fa-plus text-[10px]"></i></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col px-4 pt-4 border-t border-slate-100 space-y-2">
                   {discountAmount !== 0 && (
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{t.originalTotal}</span>
                       <span className="text-sm font-black text-slate-300 line-through">${originalTotal.toFixed(1)}</span>
                     </div>
                   )}
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.total}</span>
                     <span className="text-3xl font-black text-blue-600">${cartTotal.toFixed(1)}</span>
                   </div>
                   {discountAmount !== 0 && (
                     <div className="flex justify-between items-center">
                       <span className={`text-[10px] font-black uppercase tracking-widest ${discountAmount > 0 ? 'text-emerald-500' : 'text-blue-500'}`}>
                         {discountAmount > 0 ? t.discountAmount : (lang === Language.ZH ? '價格調整' : 'Adjustment')}
                       </span>
                       <span className={`text-sm font-black ${discountAmount > 0 ? 'text-emerald-500' : 'text-blue-500'}`}>
                         {discountAmount > 0 ? '-' : '+'}${Math.abs(discountAmount).toFixed(1)}
                       </span>
                     </div>
                   )}
                </div>

                {/* Discount Section */}
                <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{t.discount}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{discountType !== 'none' ? (lang === Language.ZH ? '已開啟' : 'Enabled') : (lang === Language.ZH ? '已關閉' : 'Disabled')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={discountType !== 'none'} 
                        onChange={() => {
                          if (discountType !== 'none') {
                            setDiscountType('none');
                          } else {
                            setDiscountType('percentage');
                            if (discountPercentage === 0) setDiscountPercentage(10);
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {discountType !== 'none' && (
                    <div className="space-y-6 animate-scale-in">
                      <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1 w-full">
                        <button 
                          onClick={() => setDiscountType('percentage')}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${discountType === 'percentage' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                        >
                          {t.percentage}
                        </button>
                        <button 
                          onClick={() => {
                            setDiscountType('fixed');
                            const totalCartPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                            setOneTimeOfferPrice(totalCartPrice);
                          }}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${discountType === 'fixed' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                        >
                          {t.oneTimeOffer}
                        </button>
                      </div>

                      {discountType === 'percentage' ? (
                        <div className="flex flex-col gap-2 animate-scale-in">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.percentage}</span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setDiscountPercentage(prev => Math.max(0, prev - 5))}
                              className="w-12 h-12 shrink-0 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                            >
                              <i className="fas fa-minus"></i>
                            </button>
                            
                            <div className="flex-1 flex items-center gap-1 bg-white px-3 h-12 rounded-2xl border border-slate-200 shadow-sm min-w-0">
                              <input 
                                type="number" 
                                value={discountPercentage}
                                onChange={(e) => setDiscountPercentage(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                className="w-full bg-transparent outline-none font-black text-slate-800 text-right text-base"
                              />
                              <span className="text-slate-400 font-bold text-xs shrink-0">%</span>
                            </div>

                            <button 
                              onClick={() => setDiscountPercentage(prev => Math.min(100, prev + 5))}
                              className="w-12 h-12 shrink-0 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 animate-scale-in">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.targetPrice}</span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setOneTimeOfferPrice(prev => Math.max(0, prev - 5))}
                              className="w-12 h-12 shrink-0 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                            >
                              <i className="fas fa-minus"></i>
                            </button>
                            
                            <div className="flex-1 flex items-center gap-1 bg-white px-3 h-12 rounded-2xl border border-slate-200 shadow-sm min-w-0">
                              <span className="text-slate-400 font-bold shrink-0">$</span>
                              <input 
                                type="number" 
                                value={oneTimeOfferPrice}
                                onChange={(e) => setOneTimeOfferPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-full bg-transparent outline-none font-black text-slate-800 text-right text-base"
                                placeholder="0.0"
                              />
                            </div>

                            <button 
                              onClick={() => setOneTimeOfferPrice(prev => prev + 5)}
                              className="w-12 h-12 shrink-0 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95 shadow-sm"
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.applyToSelected}</span>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => setDiscountTargetIds([])}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-tight transition-all ${discountTargetIds.length === 0 ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}
                          >
                            {t.applyToAll}
                          </button>
                          {cart.map(item => {
                            const totalDiscount = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0) - oneTimeOfferPrice;
                            const isFixedDiscount = discountType === 'fixed' && totalDiscount > 0;
                            const isTooSmall = isFixedDiscount && (item.price * item.quantity) < totalDiscount;
                            const isSelected = discountTargetIds.includes(item.id);

                            return (
                              <button 
                                key={item.id}
                                disabled={isTooSmall && !isSelected}
                                onClick={() => {
                                  setDiscountTargetIds(prev => {
                                    if (prev.length === 0) {
                                      return [item.id];
                                    }
                                    return prev.includes(item.id) 
                                      ? prev.filter(id => id !== item.id) 
                                      : [...prev, item.id]
                                  });
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-tight transition-all ${
                                  isSelected 
                                    ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                                    : isTooSmall 
                                      ? 'bg-slate-50 text-slate-200 border border-slate-100 cursor-not-allowed opacity-50'
                                      : 'bg-white text-slate-300 border border-slate-100'
                                }`}
                              >
                                {item.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {availablePaymentMethods.map(method => (
                    <button key={method} onClick={() => setSelectedPayment(method)} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedPayment === method ? 'border-blue-600 bg-blue-50/50' : 'border-slate-50'}`}>
                      <i className={`fas ${method === 'CASH' ? 'fa-money-bill-wave' : 'fa-qrcode'} ${selectedPayment === method ? 'text-blue-600' : 'text-slate-300'}`}></i>
                      <span className="text-[10px] font-black uppercase tracking-widest">{method}</span>
                    </button>
                  ))}
                </div>

                {/* Cash Calculator Logic */}
                {selectedPayment === 'CASH' && (
                  <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4 animate-scale-in">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.cashReceived}</span>
                        {receivedBills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {receivedBills.map((bill, idx) => (
                              <span key={idx} className="text-[8px] font-black bg-white border border-slate-200 px-1.5 py-0.5 rounded-md text-slate-500 animate-scale-in">
                                ${bill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                          <span className="text-slate-400 font-bold">$</span>
                          <span className="font-black text-slate-800 text-right min-w-[40px]">{totalReceived.toFixed(1)}</span>
                        </div>
                        {receivedBills.length > 0 && (
                          <button 
                            onClick={() => setReceivedBills(prev => prev.slice(0, -1))}
                            className="w-10 h-10 bg-white text-red-500 border border-slate-200 rounded-xl flex items-center justify-center shadow-sm hover:bg-red-50 active:scale-95 transition-all"
                            title="Undo last bill"
                          >
                            <i className="fas fa-rotate-left text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[10, 20, 50, 100, 500, 1000].map(amt => (
                        <button 
                          key={amt} 
                          onClick={() => setReceivedBills(prev => [...prev, amt])}
                          className="py-2 px-1 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95"
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.changeDue}</span>
                      <span className={`text-xl font-black ${changeDue > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        ${changeDue.toFixed(1)}
                      </span>
                    </div>
                  </div>
                )}

                {/* QR Code Display Logic - Enlarged */}
                {selectedPayment && selectedPayment !== 'CASH' && customQRCodes[selectedPayment] && (
                  <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-100 flex flex-col items-center gap-6 animate-scale-in">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">{t.scanToPay}</p>
                    <div className="w-full max-w-[320px] aspect-square bg-white p-6 rounded-[48px] shadow-lg border border-slate-200 overflow-hidden flex items-center justify-center transition-all hover:scale-[1.02]">
                      <img src={customQRCodes[selectedPayment]} className="w-full h-full object-contain" alt="Payment QR" />
                    </div>
                    <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-600 text-white rounded-full shadow-md shadow-blue-100">
                      <i className="fas fa-mobile-screen text-xs"></i>
                      <span className="text-[11px] font-black uppercase tracking-widest">{selectedPayment}</span>
                    </div>
                  </div>
                )}

                <button onClick={() => setShowReceiptChoice(true)} disabled={!selectedPayment} className="w-full bg-emerald-600 text-white p-6 rounded-[24px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50 transition-all active:scale-[0.98]">
                  {t.confirmPayment}
                </button>
              </div>
            ) : (
              <div className="space-y-6 animate-scale-in">
                <div className="text-center py-4">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl transition-all ${isEmailSent ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                    <i className={`fas ${isEmailSent ? 'fa-paper-plane' : (isSendingEmail ? 'fa-spinner fa-spin' : 'fa-check')}`}></i>
                  </div>
                  <h4 className="text-slate-800 font-black text-lg uppercase tracking-tight">
                    {isEmailSent ? 'Receipt Sent!' : (isSendingEmail ? 'Processing...' : 'Sale Recorded')}
                  </h4>
                </div>

                {showEmailInput ? (
                  <div className="space-y-4">
                    {!isEmailSent && (
                      <>
                        <div>
                          <input type="email" disabled={isSendingEmail} value={customerEmail} onChange={handleEmailChange} className={`w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none ${emailError || apiError ? 'border-red-500' : 'border-slate-100'}`} placeholder="customer@email.com" />
                          {(emailError || apiError) && <p className="text-[9px] text-red-500 font-bold mt-2 ml-1">{emailError || apiError}</p>}
                        </div>
                        <button onClick={() => finalizeTransaction(true)} disabled={!customerEmail || !!emailError || isSendingEmail} className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg disabled:opacity-50 flex items-center justify-center gap-3">
                          {isSendingEmail ? <><i className="fas fa-spinner fa-spin"></i> Sending...</> : <><i className="fas fa-paper-plane"></i> Send Receipt</>}
                        </button>
                        {!isSendingEmail && <button onClick={() => finalizeTransaction(false)} className="w-full text-slate-400 text-[10px] font-black uppercase tracking-widest">Skip</button>}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setShowEmailInput(true)} className="p-5 border-2 border-slate-50 bg-slate-50 rounded-[24px] font-black uppercase tracking-widest text-[10px] flex flex-col items-center gap-3"><i className="fas fa-envelope text-lg text-blue-500"></i>Email</button>
                    <button onClick={() => finalizeTransaction(false)} className="p-5 border-2 border-slate-50 bg-slate-50 rounded-[24px] font-black uppercase tracking-widest text-[10px] flex flex-col items-center gap-3"><i className="fas fa-ban text-lg text-slate-300"></i>None</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderingView;
