
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
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
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

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    availableProducts.forEach(p => {
      const cat = String(p.category || '').trim();
      if (cat) cats.add(cat);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [availableProducts]);

  const filteredProducts = useMemo(() => {
    let result = availableProducts;
    
    if (selectedCategory !== 'All') {
      result = result.filter(p => String(p.category || '').trim() === selectedCategory);
    }

    if (!searchTerm.trim()) return result;
    const lowerQuery = searchTerm.toLowerCase();
    return result.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      (p.category && p.category.toLowerCase().includes(lowerQuery))
    );
  }, [availableProducts, searchTerm, selectedCategory]);

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

  return (
    <div className="space-y-10 pb-32 md:pb-8">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-black tracking-tighter">{t.ordering}</h2>
          <p className="text-[11px] text-zinc-400 font-semibold uppercase tracking-widest mt-1.5">Select items for cart</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-zinc-300 text-xs"></i>
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-zinc-100 rounded-2xl text-sm font-medium outline-none focus:border-black transition-all shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setShowImages(!showImages)}
            title={showImages ? t.hideImages : t.showImages}
            className="flex items-center justify-center w-12 h-12 sm:w-auto sm:px-5 bg-white border border-zinc-100 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:bg-zinc-50 transition-all shadow-sm shrink-0"
          >
            <i className={`fas ${showImages ? 'fa-image' : 'fa-font'} ${showImages ? '' : 'text-black'}`}></i>
            <span className="hidden sm:inline ml-2.5">{showImages ? t.hideImages : t.showImages}</span>
          </button>
        </div>
      </div>

      {/* Category Tags */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-3 no-scrollbar -mx-6 px-6 sm:mx-0 sm:px-0">
        {allCategories.map((category) => {
          const isActive = selectedCategory === category;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-7 py-3 rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border shadow-sm active:scale-95 ${
                isActive 
                  ? 'bg-black text-white border-black' 
                  : 'bg-white text-zinc-400 border-zinc-100 hover:border-zinc-300 hover:text-zinc-600'
              }`}
            >
              {category === 'All' ? (lang === Language.ZH ? '全部' : 'All') : category}
            </button>
          );
        })}
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 animate-scale-in origin-top">
          {filteredProducts.map(product => {
            const qty = cart.find(i => i.id === product.id)?.quantity || 0;
            return (
              <button key={product.id} onClick={() => addToCart(product)} disabled={product.stock <= 0} className={`relative flex flex-col p-4 bg-white rounded-[24px] shadow-sm border border-zinc-100 text-left transition-all hover:shadow-xl hover:border-zinc-200 group ${product.stock <= 0 ? 'opacity-50 grayscale' : ''}`}>
                {qty > 0 && <div className="absolute -top-2 -right-2 bg-black text-white text-[11px] font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-xl border-2 border-white z-10">{qty}</div>}
                {showImages && (
                  <div className="w-full aspect-square bg-zinc-50 rounded-2xl mb-4 overflow-hidden border border-zinc-100 group-hover:scale-[1.02] transition-transform">
                    <img src={product.image || `https://picsum.photos/seed/${product.id}/400`} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <h3 className="font-bold text-sm text-zinc-800 line-clamp-1 uppercase tracking-tight">{product.name}</h3>
                <div className="flex justify-between w-full items-center mt-2">
                  <span className="text-black font-extrabold text-base">${product.price.toLocaleString()}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${product.stock < (product.threshold || 5) ? 'bg-red-50 text-red-500' : 'bg-zinc-50 text-zinc-400'}`}>{product.stock.toLocaleString()}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-24 bg-white rounded-[40px] border border-dashed border-zinc-200">
          <i className="fas fa-search text-zinc-200 text-6xl mb-5"></i>
          <p className="text-zinc-400 font-bold uppercase tracking-[0.2em] text-xs">No matching products</p>
        </div>
      )}

      {cart.length > 0 && (
        <div className="fixed bottom-24 md:bottom-10 left-6 right-6 md:left-auto md:right-10 md:w-[400px] z-[100] animate-scale-in">
          <button onClick={() => setIsCheckoutOpen(true)} className="w-full glass p-6 rounded-[32px] shadow-2xl shadow-black/10 flex justify-between items-center font-bold hover:scale-[1.02] transition-all group border border-white/50">
            <div className="flex items-center gap-4">
              <span className="bg-black text-white w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold">{cart.reduce((a, b) => a + b.quantity, 0)}</span>
              <span className="uppercase tracking-[0.15em] text-[11px] font-black text-black">{t.checkout}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-extrabold text-black">${cartTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
              <i className="fas fa-arrow-right text-xs text-black/40 group-hover:translate-x-1 transition-transform"></i>
            </div>
          </button>
        </div>
      )}

      {isCheckoutOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[200] flex items-end md:items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[40px] p-8 md:p-10 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto border border-zinc-100">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-extrabold text-black uppercase tracking-tighter">{showReceiptChoice ? 'Record Status' : 'Order Summary'}</h3>
              <button onClick={() => { setIsCheckoutOpen(false); setReceivedBills([]); }} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100 transition-colors"><i className="fas fa-times"></i></button>
            </div>


            {!showReceiptChoice ? (
              <div className="space-y-6">
                <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
                  {discountedCart.map(item => (
                    <div key={item.id} className="flex justify-between items-center bg-zinc-50 p-5 rounded-[24px] border border-zinc-100">
                      <div className="flex flex-col flex-1 min-w-0 mr-4">
                        <span className="text-sm font-bold text-black uppercase tracking-tight truncate">{item.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold uppercase tracking-widest ${item.discountedPrice !== item.price ? 'text-zinc-300 line-through' : 'text-zinc-400'}`}>
                            ${item.price.toLocaleString()}
                          </span>
                          {item.discountedPrice !== item.price && (
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${item.discountedPrice! < item.price ? 'text-emerald-500' : 'text-black'}`}>
                              ${item.discountedPrice?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center bg-white rounded-2xl p-1 border border-zinc-200 shadow-sm">
                        <button onClick={() => removeFromCart(item.id)} className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 hover:text-black transition-colors"><i className="fas fa-minus text-[10px]"></i></button>
                        <span className="w-10 text-center text-sm font-bold text-black">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white transition-all active:scale-95"><i className="fas fa-plus text-[10px]"></i></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col px-4 pt-6 border-t border-zinc-100 space-y-3">
                   {discountAmount !== 0 && (
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{t.originalTotal}</span>
                       <span className="text-sm font-bold text-zinc-300 line-through">${originalTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                     </div>
                   )}
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{t.total}</span>
                     <span className="text-4xl font-extrabold text-black tracking-tighter">${cartTotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                   </div>
                   {discountAmount !== 0 && (
                     <div className="flex justify-between items-center">
                       <span className={`text-[10px] font-bold uppercase tracking-widest ${discountAmount > 0 ? 'text-emerald-500' : 'text-black'}`}>
                         {discountAmount > 0 ? t.discountAmount : (lang === Language.ZH ? '價格調整' : 'Adjustment')}
                       </span>
                       <span className={`text-sm font-bold ${discountAmount > 0 ? 'text-emerald-500' : 'text-black'}`}>
                         {discountAmount > 0 ? '-' : '+'}${Math.abs(discountAmount).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                       </span>
                     </div>
                   )}
                </div>

                {/* Discount Section */}
                <div className="bg-zinc-50 p-7 rounded-[32px] border border-zinc-100 space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-black uppercase tracking-widest">{t.discount}</span>
                      <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">{discountType !== 'none' ? (lang === Language.ZH ? '已開啟' : 'Enabled') : (lang === Language.ZH ? '已關閉' : 'Disabled')}</span>
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
                      <div className="w-12 h-7 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-black"></div>
                    </label>
                  </div>

                  {discountType !== 'none' && (
                    <div className="space-y-6 animate-scale-in">
                      <div className="bg-zinc-100 p-1.5 rounded-2xl flex items-center gap-1.5 w-full">
                        <button 
                          onClick={() => setDiscountType('percentage')}
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${discountType === 'percentage' ? 'bg-white text-black shadow-sm' : 'text-zinc-400'}`}
                        >
                          {t.percentage}
                        </button>
                        <button 
                          onClick={() => {
                            setDiscountType('fixed');
                            const totalCartPrice = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                            setOneTimeOfferPrice(totalCartPrice);
                          }}
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${discountType === 'fixed' ? 'bg-white text-black shadow-sm' : 'text-zinc-400'}`}
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

                <div className="grid grid-cols-2 gap-4">
                  {availablePaymentMethods.map(method => (
                    <button key={method} onClick={() => setSelectedPayment(method)} className={`p-5 rounded-[24px] border-2 transition-all flex flex-col items-center gap-3 ${selectedPayment === method ? 'border-black bg-zinc-50' : 'border-zinc-50 bg-zinc-50/50 hover:bg-zinc-50'}`}>
                      <i className={`fas ${method === 'CASH' ? 'fa-money-bill-wave' : 'fa-qrcode'} ${selectedPayment === method ? 'text-black' : 'text-zinc-300'}`}></i>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-black">{method}</span>
                    </button>
                  ))}
                </div>

                {/* Cash Calculator Logic */}
                {selectedPayment === 'CASH' && (
                  <div className="bg-zinc-50 p-7 rounded-[32px] border border-zinc-100 space-y-5 animate-scale-in">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t.cashReceived}</span>
                        {receivedBills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {receivedBills.map((bill, idx) => (
                              <span key={idx} className="text-[9px] font-bold bg-white border border-zinc-200 px-2 py-1 rounded-lg text-zinc-600 animate-scale-in">
                                ${bill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-white px-5 py-3 rounded-2xl border border-zinc-200 shadow-sm">
                          <span className="text-zinc-400 font-bold">$</span>
                          <span className="font-extrabold text-black text-right min-w-[50px] text-lg">{totalReceived.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                        </div>
                        {receivedBills.length > 0 && (
                          <button 
                            onClick={() => setReceivedBills(prev => prev.slice(0, -1))}
                            className="w-12 h-12 bg-white text-black border border-zinc-200 rounded-2xl flex items-center justify-center shadow-sm hover:bg-zinc-50 active:scale-95 transition-all"
                            title="Undo last bill"
                          >
                            <i className="fas fa-rotate-left text-xs"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                      {[10, 20, 50, 100, 500, 1000].map(amt => (
                        <button 
                          key={amt} 
                          onClick={() => setReceivedBills(prev => [...prev, amt])}
                          className="py-3 px-1 bg-white border border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-500 hover:bg-black hover:text-white hover:border-black transition-all active:scale-95"
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-zinc-200/50">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t.changeDue}</span>
                      <span className={`text-2xl font-extrabold ${changeDue > 0 ? 'text-emerald-600' : 'text-zinc-300'}`}>
                        ${changeDue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  </div>
                )}

                {/* QR Code Display Logic - Enlarged */}
                {selectedPayment && selectedPayment !== 'CASH' && customQRCodes[selectedPayment] && (
                  <div className="bg-zinc-50 p-10 rounded-[40px] border border-zinc-100 flex flex-col items-center gap-8 animate-scale-in">
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.4em]">{t.scanToPay}</p>
                    <div className="w-full max-w-[340px] aspect-square bg-white p-8 rounded-[56px] shadow-2xl border border-zinc-200 overflow-hidden flex items-center justify-center transition-all hover:scale-[1.02]">
                      <img src={customQRCodes[selectedPayment]} className="w-full h-full object-contain" alt="Payment QR" />
                    </div>
                    <div className="flex items-center gap-3 px-8 py-3 bg-black text-white rounded-full shadow-xl">
                      <i className="fas fa-mobile-screen text-xs"></i>
                      <span className="text-[11px] font-bold uppercase tracking-widest">{selectedPayment}</span>
                    </div>
                  </div>
                )}

                <button 
                  onClick={() => {
                    if (receiptConfig?.enabled) {
                      setShowReceiptChoice(true);
                    } else {
                      finalizeTransaction(false);
                    }
                  }} 
                  disabled={!selectedPayment} 
                  className="w-full bg-black text-white p-7 rounded-[32px] font-bold uppercase tracking-[0.2em] text-xs shadow-2xl disabled:opacity-30 transition-all active:scale-[0.98] mt-4"
                >
                  {t.confirmPayment}
                </button>
              </div>
            ) : (
              <div className="space-y-8 animate-scale-in">
                <div className="text-center py-6">
                  <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center mx-auto mb-6 text-4xl transition-all ${isEmailSent ? 'bg-black text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                    <i className={`fas ${isEmailSent ? 'fa-paper-plane' : (isSendingEmail ? 'fa-spinner fa-spin' : 'fa-check')}`}></i>
                  </div>
                  <h4 className="text-black font-extrabold text-2xl uppercase tracking-tighter">
                    {isEmailSent ? 'Receipt Sent!' : (isSendingEmail ? 'Processing...' : 'Sale Recorded')}
                  </h4>
                </div>

                {showEmailInput ? (
                  <div className="space-y-5">
                    {!isEmailSent && (
                      <>
                        <div>
                          <input type="email" disabled={isSendingEmail} value={customerEmail} onChange={handleEmailChange} className={`w-full p-5 bg-zinc-50 border rounded-[24px] font-bold outline-none transition-all ${emailError || apiError ? 'border-red-500' : 'border-zinc-100 focus:border-black'}`} placeholder="customer@email.com" />
                          {(emailError || apiError) && <p className="text-[10px] text-red-500 font-bold mt-2.5 ml-2">{emailError || apiError}</p>}
                        </div>
                        <button onClick={() => finalizeTransaction(true)} disabled={!customerEmail || !!emailError || isSendingEmail} className="w-full bg-black text-white p-6 rounded-[24px] font-bold uppercase tracking-widest text-xs shadow-xl disabled:opacity-30 flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
                          {isSendingEmail ? <><i className="fas fa-spinner fa-spin"></i> Sending...</> : <><i className="fas fa-paper-plane"></i> Send Receipt</>}
                        </button>
                        {!isSendingEmail && <button onClick={() => finalizeTransaction(false)} className="w-full text-zinc-400 text-[11px] font-bold uppercase tracking-widest hover:text-black transition-colors">Skip</button>}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-5">
                    <button onClick={() => setShowEmailInput(true)} className="p-7 border border-zinc-100 bg-zinc-50 rounded-[32px] font-bold uppercase tracking-widest text-[11px] flex flex-col items-center gap-4 hover:bg-zinc-100 transition-all"><i className="fas fa-envelope text-2xl text-black"></i>Email</button>
                    <button onClick={() => finalizeTransaction(false)} className="p-7 border border-zinc-100 bg-zinc-50 rounded-[32px] font-bold uppercase tracking-widest text-[11px] flex flex-col items-center gap-4 hover:bg-zinc-100 transition-all"><i className="fas fa-ban text-2xl text-zinc-300"></i>None</button>
                  </div>
                )}
              </div>
            )}}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderingView;
