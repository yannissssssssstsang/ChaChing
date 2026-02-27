
import React, { useRef, useState, useEffect } from 'react';
import { Language, PaymentQRCodes, TelegramConfig, ReceiptConfig, SettlementConfig, SyncStatus } from '../types';
import { TRANSLATIONS } from '../constants';
import { verifyGoogleConnection, ConnectionStatus, listDriveFiles, getDriveFileAsBase64 } from '../services/googleDriveService';
import { extractBusinessCardInfo } from '../services/geminiService';

interface SettingsViewProps {
  lang: Language;
  paymentQRCodes: PaymentQRCodes;
  onUpdateQRCodes: (codes: PaymentQRCodes) => void;
  telegramConfig: TelegramConfig;
  onUpdateTelegramConfig: (config: TelegramConfig) => void;
  onLogout: () => void;
  onTestTelegram: () => Promise<boolean | undefined>;
  onForceSync: () => Promise<void>;
  syncStatus: SyncStatus;
  receiptConfig: ReceiptConfig;
  onUpdateReceiptConfig: (config: ReceiptConfig) => void;
  onForceDownload: () => Promise<void>;
  lastSyncTime?: string | null;
  settlementConfig: SettlementConfig;
  onUpdateSettlementConfig: (config: SettlementConfig) => void;
  onManualSettle: () => void;
  onTokenExpiry?: () => void;
  isOfflineMode: boolean;
  onToggleOfflineMode: () => void;
}

interface HKMethod {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  brandColor: string;
}

const HK_METHODS: HKMethod[] = [
  { id: 'PAYME', name: 'PayMe', icon: 'fa-qrcode', color: 'text-red-600', bgColor: 'bg-red-50', brandColor: '#e60000' },
  { id: 'ALIPAYHK', name: 'AlipayHK', icon: 'fa-brands fa-alipay', color: 'text-sky-500', bgColor: 'bg-sky-50', brandColor: '#00aaee' },
  { id: 'WECHATPAY', name: 'WeChat Pay HK', icon: 'fa-brands fa-weixin', color: 'text-emerald-500', bgColor: 'bg-emerald-50', brandColor: '#07c160' },
  { id: 'FPS', name: 'FPS (轉數快)', icon: 'fa-bolt-lightning', color: 'text-orange-500', bgColor: 'bg-orange-50', brandColor: '#ff8c00' },
  { id: 'OCTOPUS', name: 'Octopus (八達通)', icon: 'fa-credit-card', color: 'text-purple-600', bgColor: 'bg-purple-50', brandColor: '#f48020' },
  { id: 'BOCPAY', name: 'BOC Pay', icon: 'fa-building-columns', color: 'text-red-700', bgColor: 'bg-red-50', brandColor: '#b31c1c' },
];

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

const SettingsView: React.FC<SettingsViewProps> = ({ 
  lang, 
  paymentQRCodes, 
  onUpdateQRCodes, 
  telegramConfig, 
  onUpdateTelegramConfig,
  onLogout,
  onTestTelegram,
  onForceSync,
  syncStatus,
  receiptConfig,
  onUpdateReceiptConfig,
  onForceDownload,
  lastSyncTime,
  settlementConfig,
  onUpdateSettlementConfig,
  onManualSettle,
  onTokenExpiry,
  isOfflineMode,
  onToggleOfflineMode
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const brandingInputRef = useRef<HTMLInputElement>(null);
  
  const [activeUploadMethod, setActiveUploadMethod] = useState<string | null>(null);
  const [brandingTarget, setBrandingTarget] = useState<'logo' | 'businessCard' | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diagStatus, setDiagStatus] = useState<ConnectionStatus | null>(null);
  const [isCheckingDiag, setIsCheckingDiag] = useState(false);
  const [isAddingNewMethod, setIsAddingNewMethod] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [tempQRData, setTempQRData] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawResult = reader.result as string;
      const optimized = await optimizeImage(rawResult);
      
      if (activeUploadMethod) {
        onUpdateQRCodes({ ...paymentQRCodes, [activeUploadMethod]: optimized });
        setActiveUploadMethod(null);
      } else if (brandingTarget) {
        onUpdateReceiptConfig({ ...receiptConfig, [brandingTarget]: optimized });
        setBrandingTarget(null);
      } else {
        setTempQRData(optimized);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleBrandingDriveImport = async (fileId: string) => {
    setIsLoadingDrive(true);
    try {
      const base64 = await getDriveFileAsBase64(fileId);
      if (base64 && brandingTarget) {
        const optimized = await optimizeImage(base64);
        onUpdateReceiptConfig({ ...receiptConfig, [brandingTarget]: optimized });
      }
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED' && onTokenExpiry) {
        onTokenExpiry();
      }
    }
    setIsLoadingDrive(false);
    setShowDrivePicker(false);
    setBrandingTarget(null);
  };

  const openDrivePicker = (target: 'logo' | 'businessCard') => {
    setBrandingTarget(target);
    setShowDrivePicker(true);
    loadDriveFiles();
  };

  const loadDriveFiles = async () => {
    setIsLoadingDrive(true);
    const result = await listDriveFiles();
    if (result.error === 'UNAUTHORIZED' && onTokenExpiry) {
      onTokenExpiry();
      setShowDrivePicker(false);
    } else {
      setDriveFiles(result.files || []);
    }
    setIsLoadingDrive(false);
  };

  const triggerUpload = (method: string) => {
    setActiveUploadMethod(method);
    fileInputRef.current?.click();
  };

  const triggerBrandingUpload = (target: 'logo' | 'businessCard') => {
    setBrandingTarget(target);
    brandingInputRef.current?.click();
  };

  const removePaymentMethod = (method: string) => {
    const next = { ...paymentQRCodes };
    delete next[method];
    onUpdateQRCodes(next);
  };

  const addNewMethod = (name: string, qrData?: string | null) => {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed) return;
    onUpdateQRCodes({ ...paymentQRCodes, [trimmed]: qrData || undefined });
    setNewMethodName('');
    setTempQRData(null);
    setIsAddingNewMethod(false);
    setIsCustomMode(false);
  };

  const handleManualDownload = async () => {
    setIsDownloading(true);
    await onForceDownload();
    setIsDownloading(false);
  };

  const runCloudDiagnostic = async () => {
    setIsCheckingDiag(true);
    const result = await verifyGoogleConnection();
    setDiagStatus(result);
    setIsCheckingDiag(false);
  };

  const handleExtractInfo = async () => {
    if (!receiptConfig.businessCard) return;
    setIsExtracting(true);
    const extracted = await extractBusinessCardInfo(receiptConfig.businessCard);
    if (extracted) {
      onUpdateReceiptConfig({
        ...receiptConfig,
        companyName: extracted.companyName || receiptConfig.companyName,
        address: extracted.address || receiptConfig.address,
        phone: extracted.phone || receiptConfig.phone,
        email: extracted.email || receiptConfig.email,
      });
    }
    setIsExtracting(false);
  };

  return (
    <div className="space-y-10 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-extrabold text-black tracking-tighter">{t.settings}</h2>
      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-zinc-100 space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Cloud Backup & Recovery</h3>
            <p className="text-[10px] text-zinc-300 font-medium uppercase tracking-widest mt-1">Secure your data with Google Drive</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleManualDownload}
              disabled={isDownloading}
              className="px-5 py-2 rounded-2xl bg-zinc-50 text-black text-[10px] font-bold uppercase tracking-widest border border-zinc-100 hover:bg-zinc-100 transition-all flex items-center gap-2.5"
            >
              {isDownloading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-download"></i>}
              Recover
            </button>
            <button 
              onClick={() => onForceSync()}
              disabled={isOfflineMode || syncStatus === 'syncing'}
              className={`px-5 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest border transition-all flex items-center gap-2.5 ${
                isOfflineMode 
                  ? 'bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed' 
                  : 'bg-black text-white border-black hover:bg-zinc-800 shadow-lg shadow-black/10'
              }`}
            >
              {syncStatus === 'syncing' ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-cloud-arrow-up"></i>}
              Sync Now
            </button>
            <button 
              onClick={runCloudDiagnostic}
              disabled={isCheckingDiag}
              className="px-5 py-2 rounded-2xl bg-zinc-50 text-zinc-500 text-[10px] font-bold uppercase tracking-widest border border-zinc-100 hover:bg-zinc-100 transition-all"
            >
              {isCheckingDiag ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
              Diagnostic
            </button>
          </div>
        </div>

        {diagStatus && (
          <div className={`p-5 rounded-[24px] border ${diagStatus.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} animate-scale-in`}>
            <div className="flex items-center gap-3 mb-2.5">
              <i className={`fas ${diagStatus.ok ? 'fa-check-circle text-emerald-500' : 'fa-exclamation-circle text-red-500'}`}></i>
              <p className={`text-[11px] font-bold uppercase tracking-widest ${diagStatus.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {diagStatus.ok ? 'Connection Verified' : 'Connection Failed'}
              </p>
            </div>
            <p className="text-xs font-medium text-zinc-600 leading-relaxed">{diagStatus.message}</p>
          </div>
        )}

        <div className="flex items-center gap-5 p-5 bg-zinc-50 rounded-[28px] border border-zinc-100">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-zinc-100">
             <i className="fab fa-google text-black text-xl"></i>
          </div>
          <div className="flex-1 min-w-0">
             <p className="text-[11px] font-bold text-black uppercase tracking-widest">Cloud Connection Status</p>
             <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1 truncate">
               {lastSyncTime ? `Last Synced: ${new Date(lastSyncTime).toLocaleString()}` : 'No Sync History'}
             </p>
          </div>
          <div className={`w-3 h-3 rounded-full ${diagStatus?.ok ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-zinc-300'}`}></div>
        </div>

        <div className="flex items-center justify-between p-5 bg-zinc-50 rounded-[28px] border border-zinc-100">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isOfflineMode ? 'bg-zinc-200 text-black' : 'bg-black text-white shadow-lg shadow-black/10'}`}>
              <i className={`fas ${isOfflineMode ? 'fa-plane' : 'fa-globe'} text-sm`}></i>
            </div>
            <div>
              <p className="text-[11px] font-bold text-black uppercase tracking-widest">
                {isOfflineMode ? 'Offline Mode' : 'Online Mode'}
              </p>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                {isOfflineMode ? 'Local Storage Only' : 'Real-time Cloud Sync'}
              </p>
            </div>
          </div>
          <button 
            onClick={onToggleOfflineMode}
            className={`w-16 h-8 rounded-full transition-all relative ${isOfflineMode ? 'bg-zinc-300' : 'bg-black'}`}
          >
            <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${isOfflineMode ? 'right-1.5' : 'left-1.5'}`}></div>
          </button>
        </div>
      </div>

      {/* Daily Settlement Section */}
      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-zinc-100 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-[11px] font-bold text-black uppercase tracking-widest">{t.dailySettlement}</h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase mt-1.5 tracking-widest">{t.settlementDescription}</p>
          </div>
          <div className="w-12 h-12 bg-zinc-50 text-black rounded-2xl flex items-center justify-center border border-zinc-100">
            <i className="fas fa-file-excel text-lg"></i>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-center">
          <div className="flex-1 w-full space-y-5">
            <div className="flex items-center justify-between p-5 bg-zinc-50 rounded-[28px] border border-zinc-100">
               <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">{t.enableAutoSettlement}</span>
               <button 
                onClick={() => onUpdateSettlementConfig({...settlementConfig, enabled: !settlementConfig.enabled})}
                className={`w-14 h-7 rounded-full transition-all relative ${settlementConfig.enabled ? 'bg-black' : 'bg-zinc-200'}`}
               >
                 <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${settlementConfig.enabled ? 'right-1' : 'left-1'}`}></div>
               </button>
            </div>
            
            <div className={`space-y-2.5 transition-opacity ${settlementConfig.enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{t.settlementTime}</label>
              <input 
                type="time" 
                value={settlementConfig.time} 
                onChange={e => onUpdateSettlementConfig({...settlementConfig, time: e.target.value})}
                className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-sm font-extrabold text-black outline-none focus:border-black transition-all"
              />
            </div>
          </div>

          <div className="w-full lg:w-auto">
            <button 
              onClick={onManualSettle}
              className="w-full lg:w-auto px-10 py-6 bg-black text-white rounded-[32px] font-extrabold uppercase text-[11px] tracking-widest flex items-center justify-center gap-4 shadow-2xl shadow-black/10 active:scale-95 transition-all"
            >
              <i className="fas fa-file-export"></i>
              {t.settleNow}
            </button>
          </div>
        </div>
      </div>

      {/* Email Receipt Section */}
      <div className={`bg-white p-8 rounded-[40px] shadow-sm border border-zinc-100 space-y-8 transition-all duration-300 ${!receiptConfig.enabled ? 'opacity-50 grayscale-[0.5]' : ''}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Email Receipt Customization</h3>
            <div className="flex items-center gap-2.5 mt-1.5">
              <i className="fas fa-magic text-black text-[10px]"></i>
              <span className="text-[10px] font-bold text-black uppercase tracking-widest">AI Extraction Ready</span>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-zinc-50 px-5 py-2.5 rounded-[24px] border border-zinc-100">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Enable Receipt</span>
            <button 
              onClick={() => onUpdateReceiptConfig({...receiptConfig, enabled: !receiptConfig.enabled})}
              className={`w-14 h-7 rounded-full transition-all relative ${receiptConfig.enabled ? 'bg-black' : 'bg-zinc-200'}`}
            >
              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${receiptConfig.enabled ? 'right-1' : 'left-1'}`}></div>
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 ${!receiptConfig.enabled ? 'pointer-events-none' : ''}`}>
          <div className="space-y-6">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Company Assets</p>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Company Logo</p>
                <div 
                  className="w-full aspect-square rounded-[32px] border-2 border-dashed border-zinc-100 bg-zinc-50 flex items-center justify-center relative overflow-hidden group cursor-pointer transition-all hover:border-zinc-300"
                  onClick={() => triggerBrandingUpload('logo')}
                >
                  {receiptConfig.logo ? (
                    <img src={receiptConfig.logo} className="w-full h-full object-contain p-4" alt="Logo" />
                  ) : (
                    <i className="fas fa-image text-zinc-200 text-3xl"></i>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity backdrop-blur-sm">
                    <button className="text-[10px] text-white font-bold uppercase tracking-widest mb-3 hover:text-zinc-300 transition-colors" onClick={(e) => { e.stopPropagation(); openDrivePicker('logo'); }}>Google Drive</button>
                    <button className="text-[10px] text-white font-bold uppercase tracking-widest hover:text-zinc-300 transition-colors">Local Storage</button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Business Card</p>
                <div 
                  className="w-full aspect-square rounded-[32px] border-2 border-dashed border-zinc-100 bg-zinc-50 flex items-center justify-center relative overflow-hidden group cursor-pointer transition-all hover:border-zinc-300"
                  onClick={() => triggerBrandingUpload('businessCard')}
                >
                  {receiptConfig.businessCard ? (
                    <img src={receiptConfig.businessCard} className="w-full h-full object-cover" alt="Card" />
                  ) : (
                    <i className="fas fa-address-card text-zinc-200 text-3xl"></i>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity backdrop-blur-sm">
                    <button className="text-[10px] text-white font-bold uppercase tracking-widest mb-3 hover:text-zinc-300 transition-colors" onClick={(e) => { e.stopPropagation(); openDrivePicker('businessCard'); }}>Google Drive</button>
                    <button className="text-[10px] text-white font-bold uppercase tracking-widest hover:text-zinc-300 transition-colors">Local Storage</button>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={handleExtractInfo}
              disabled={!receiptConfig.businessCard || isExtracting}
              className="w-full bg-zinc-50 text-black p-5 rounded-[24px] font-bold uppercase tracking-widest text-[11px] flex items-center justify-center gap-3.5 border border-zinc-100 transition-all hover:bg-zinc-100 disabled:opacity-30"
            >
              {isExtracting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
              {isExtracting ? 'Analyzing Card...' : 'Extract Info from Card'}
            </button>
          </div>

          <div className="space-y-6">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Receipt Footer Information</p>
            <div className="space-y-4">
              <input type="text" value={receiptConfig.companyName} onChange={e => onUpdateReceiptConfig({...receiptConfig, companyName: e.target.value})} placeholder="Company Name" className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
              <input type="text" value={receiptConfig.address} onChange={e => onUpdateReceiptConfig({...receiptConfig, address: e.target.value})} placeholder="Business Address" className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={receiptConfig.phone} onChange={e => onUpdateReceiptConfig({...receiptConfig, phone: e.target.value})} placeholder="Phone" className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
                <input type="email" value={receiptConfig.email} onChange={e => onUpdateReceiptConfig({...receiptConfig, email: e.target.value})} placeholder="Email" className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <i className="fab fa-instagram absolute left-5 top-1/2 -translate-y-1/2 text-black"></i>
                  <input type="text" value={receiptConfig.instagram || ''} onChange={e => onUpdateReceiptConfig({...receiptConfig, instagram: e.target.value})} placeholder={t.instagram} className="w-full p-5 pl-12 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
                </div>
                <div className="relative">
                  <i className="fab fa-facebook absolute left-5 top-1/2 -translate-y-1/2 text-black"></i>
                  <input type="text" value={receiptConfig.facebook || ''} onChange={e => onUpdateReceiptConfig({...receiptConfig, facebook: e.target.value})} placeholder={t.facebook} className="w-full p-5 pl-12 bg-zinc-50 border border-zinc-100 rounded-[24px] text-xs font-bold outline-none focus:border-black transition-all" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[40px] shadow-sm border border-zinc-100">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-8 ml-1">Digital Payments (QR)</h3>
        <div className="grid grid-cols-1 gap-5">
          {Object.keys(paymentQRCodes).map((m) => (
            <div key={m} className="flex items-center justify-between p-5 border border-zinc-100 rounded-[32px] bg-zinc-50 transition-all hover:border-zinc-200">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm overflow-hidden border border-zinc-100">
                  {paymentQRCodes[m] ? <img src={paymentQRCodes[m]} className="w-full h-full object-contain p-1" /> : <i className="fas fa-qrcode text-zinc-200 text-xl"></i>}
                </div>
                <p className="font-extrabold text-black text-base uppercase tracking-tight">{m}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => triggerUpload(m)} className="bg-white px-6 py-2.5 rounded-2xl text-[10px] font-bold shadow-sm uppercase tracking-widest border border-zinc-100 hover:bg-zinc-50 transition-all">Update</button>
                <button onClick={() => removePaymentMethod(m)} className="w-12 h-12 bg-white text-red-500 border border-zinc-100 rounded-2xl flex items-center justify-center hover:bg-red-50 transition-all"><i className="fas fa-trash-can"></i></button>
              </div>
            </div>
          ))}
          <button onClick={() => { setIsAddingNewMethod(true); setIsCustomMode(false); }} className="w-full p-6 border-2 border-dashed border-zinc-200 rounded-[32px] text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 transition-all">Add Payment Method</button>
        </div>
      </div>

      <button onClick={onLogout} className="w-full p-6 bg-white border border-zinc-100 rounded-[40px] text-red-500 font-extrabold uppercase text-[11px] tracking-[0.2em] shadow-sm hover:bg-red-50 transition-all">Sign Out</button>

      {/* Modals */}
      {showDrivePicker && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-lg rounded-[56px] p-10 shadow-2xl max-h-[85vh] flex flex-col border border-zinc-100 animate-scale-in">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-extrabold text-black tracking-tighter uppercase">Select from Drive</h3>
              <button onClick={() => setShowDrivePicker(false)} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {isLoadingDrive ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <i className="fas fa-spinner fa-spin text-3xl text-zinc-200"></i>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Loading Drive...</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  {driveFiles.map(file => (
                    <button key={file.id} onClick={() => handleBrandingDriveImport(file.id)} className="group p-4 border border-zinc-100 rounded-[32px] bg-zinc-50 hover:bg-white hover:border-zinc-200 transition-all hover:shadow-xl">
                      <div className="aspect-square rounded-2xl overflow-hidden mb-3 border border-zinc-100 bg-white">
                        <img src={file.thumbnailLink?.replace('=s220', '=s400')} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      </div>
                      <p className="text-[10px] font-bold text-black truncate uppercase tracking-tight">{file.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isAddingNewMethod && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[56px] p-10 shadow-2xl border border-zinc-100 animate-scale-in">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-extrabold text-black tracking-tighter uppercase">New Method</h3>
              <button onClick={() => setIsAddingNewMethod(false)} className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 hover:text-black transition-colors"><i className="fas fa-times"></i></button>
            </div>
            {!isCustomMode ? (
              <div className="space-y-3">
                {HK_METHODS.map(m => (
                  <button key={m.id} onClick={() => addNewMethod(m.id)} className="w-full p-5 border border-zinc-100 rounded-[28px] text-left flex items-center justify-between group hover:bg-zinc-50 transition-all">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.bgColor} ${m.color} shadow-sm group-hover:scale-110 transition-transform`}>
                        <i className={`fas ${m.icon} text-lg`}></i>
                      </div>
                      <span className="font-extrabold text-black uppercase tracking-tight">{m.name}</span>
                    </div>
                    <i className="fas fa-chevron-right text-[10px] text-zinc-300 group-hover:text-black transition-colors"></i>
                  </button>
                ))}
                <button onClick={() => setIsCustomMode(true)} className="w-full p-5 border-2 border-dashed border-zinc-100 rounded-[28px] text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-50 transition-all mt-4">Other / Custom</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Method Name</label>
                  <input type="text" value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder="e.g. CRYPTO" className="w-full p-5 bg-zinc-50 border border-zinc-100 rounded-[24px] text-sm font-extrabold text-black outline-none focus:border-black transition-all" />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">QR Code Image</label>
                  <div 
                    onClick={() => modalFileInputRef.current?.click()} 
                    className="aspect-square border-2 border-dashed border-zinc-100 rounded-[32px] bg-zinc-50 flex items-center justify-center overflow-hidden cursor-pointer group hover:border-zinc-300 transition-all"
                  >
                    {tempQRData ? (
                      <img src={tempQRData} className="w-full h-full object-contain p-4" />
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <i className="fas fa-qrcode text-zinc-200 text-4xl group-hover:scale-110 transition-transform"></i>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tap to Upload</span>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => addNewMethod(newMethodName, tempQRData)} className="w-full bg-black text-white p-6 rounded-[28px] font-extrabold uppercase tracking-widest shadow-2xl shadow-black/10 active:scale-95 transition-all">Add Method</button>
              </div>
            )}
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      <input type="file" ref={brandingInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      <input type="file" ref={modalFileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
    </div>
  );
};

export default SettingsView;
