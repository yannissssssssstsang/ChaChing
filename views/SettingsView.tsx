
import React, { useRef, useState, useEffect } from 'react';
import { Language, PaymentQRCodes, TelegramConfig, ReceiptConfig, SettlementConfig } from '../types';
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
  isSyncing?: boolean;
  receiptConfig: ReceiptConfig;
  onUpdateReceiptConfig: (config: ReceiptConfig) => void;
  onForceDownload: () => Promise<void>;
  lastSyncTime?: string | null;
  settlementConfig: SettlementConfig;
  onUpdateSettlementConfig: (config: SettlementConfig) => void;
  onManualSettle: () => void;
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
  isSyncing,
  receiptConfig,
  onUpdateReceiptConfig,
  onForceDownload,
  lastSyncTime,
  settlementConfig,
  onUpdateSettlementConfig,
  onManualSettle
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const brandingInputRef = useRef<HTMLInputElement>(null);
  
  const [activeUploadMethod, setActiveUploadMethod] = useState<string | null>(null);
  const [brandingTarget, setBrandingTarget] = useState<'logo' | 'businessCard' | null>(null);
  const [isSavedLocally, setIsSavedLocally] = useState(false);
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
    const base64 = await getDriveFileAsBase64(fileId);
    if (base64 && brandingTarget) {
      const optimized = await optimizeImage(base64);
      onUpdateReceiptConfig({ ...receiptConfig, [brandingTarget]: optimized });
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
    setDriveFiles(result.files || []);
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

  const handleSaveAll = async () => {
    setIsSavedLocally(true);
    await onForceSync();
    setTimeout(() => setIsSavedLocally(false), 2000);
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
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">{t.settings}</h2>
        <button 
          onClick={handleSaveAll}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 ${isSavedLocally ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {isSyncing ? <i className="fas fa-sync fa-spin"></i> : <i className={`fas ${isSavedLocally ? 'fa-check' : 'fa-save'}`}></i>}
          {isSyncing ? 'Syncing...' : (isSavedLocally ? 'Saved & Synced' : 'Save & Sync All')}
        </button>
      </div>

      {/* Daily Settlement Section */}
      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{t.dailySettlement}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{t.settlementDescription}</p>
          </div>
          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
            <i className="fas fa-file-excel"></i>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="flex-1 w-full space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <span className="text-xs font-black text-slate-500 uppercase tracking-tight">{t.enableAutoSettlement}</span>
               <button 
                onClick={() => onUpdateSettlementConfig({...settlementConfig, enabled: !settlementConfig.enabled})}
                className={`w-12 h-6 rounded-full transition-colors relative ${settlementConfig.enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
               >
                 <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settlementConfig.enabled ? 'right-1' : 'left-1'}`}></div>
               </button>
            </div>
            
            <div className={`space-y-2 transition-opacity ${settlementConfig.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t.settlementTime}</label>
              <input 
                type="time" 
                value={settlementConfig.time} 
                onChange={e => onUpdateSettlementConfig({...settlementConfig, time: e.target.value})}
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="w-full md:w-auto">
            <button 
              onClick={onManualSettle}
              className="w-full md:w-auto px-8 py-5 bg-slate-800 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-slate-200 active:scale-95 transition-all"
            >
              <i className="fas fa-file-export"></i>
              {t.settleNow}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Cloud Backup & Recovery</h3>
          <div className="flex gap-2">
            <button 
              onClick={handleManualDownload}
              disabled={isDownloading}
              className="px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-2"
            >
              {isDownloading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-download"></i>}
              Recover from Cloud
            </button>
            <button 
              onClick={runCloudDiagnostic}
              disabled={isCheckingDiag}
              className="px-4 py-1.5 rounded-full bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all"
            >
              {isCheckingDiag ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
              Diagnostic
            </button>
          </div>
        </div>

        {diagStatus && (
          <div className={`p-4 rounded-2xl border ${diagStatus.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} animate-scale-in`}>
            <div className="flex items-center gap-3 mb-2">
              <i className={`fas ${diagStatus.ok ? 'fa-check-circle text-emerald-500' : 'fa-exclamation-circle text-red-500'}`}></i>
              <p className={`text-xs font-black uppercase ${diagStatus.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {diagStatus.ok ? 'Connection Verified' : 'Connection Failed'}
              </p>
            </div>
            <p className="text-xs font-medium text-slate-600">{diagStatus.message}</p>
          </div>
        )}

        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
             <i className="fab fa-google text-blue-500 text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
             <p className="text-xs font-black text-slate-800 uppercase tracking-tight">Cloud Connection Status</p>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
               {lastSyncTime ? `Last Synced: ${new Date(lastSyncTime).toLocaleString()}` : 'No Sync History'}
             </p>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full ${diagStatus?.ok ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
        </div>
      </div>

      {/* Email Receipt Section */}
      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Email Receipt Customization</h3>
          <div className="flex items-center gap-2">
            <i className="fas fa-magic text-blue-500 text-[10px]"></i>
            <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">AI Extraction Ready</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Company Assets</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase ml-1">Company Logo</p>
                <div 
                  className="w-full aspect-square rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50 flex items-center justify-center relative overflow-hidden group cursor-pointer"
                  onClick={() => triggerBrandingUpload('logo')}
                >
                  {receiptConfig.logo ? (
                    <img src={receiptConfig.logo} className="w-full h-full object-contain p-2" alt="Logo" />
                  ) : (
                    <i className="fas fa-image text-slate-200 text-2xl"></i>
                  )}
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                    <button className="text-[8px] text-white font-black uppercase mb-2" onClick={(e) => { e.stopPropagation(); openDrivePicker('logo'); }}>Google Drive</button>
                    <button className="text-[8px] text-white font-black uppercase">Local Storage</button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase ml-1">Business Card</p>
                <div 
                  className="w-full aspect-square rounded-2xl border-2 border-dashed border-slate-100 bg-slate-50 flex items-center justify-center relative overflow-hidden group cursor-pointer"
                  onClick={() => triggerBrandingUpload('businessCard')}
                >
                  {receiptConfig.businessCard ? (
                    <img src={receiptConfig.businessCard} className="w-full h-full object-cover" alt="Card" />
                  ) : (
                    <i className="fas fa-address-card text-slate-200 text-2xl"></i>
                  )}
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity">
                    <button className="text-[8px] text-white font-black uppercase mb-2" onClick={(e) => { e.stopPropagation(); openDrivePicker('businessCard'); }}>Google Drive</button>
                    <button className="text-[8px] text-white font-black uppercase">Local Storage</button>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={handleExtractInfo}
              disabled={!receiptConfig.businessCard || isExtracting}
              className="w-full bg-blue-50 text-blue-600 p-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 border border-blue-100 transition-all hover:bg-blue-100 disabled:opacity-50"
            >
              {isExtracting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
              {isExtracting ? 'Analyzing Card...' : 'Extract Info from Card'}
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Receipt Footer Information</p>
            <div className="space-y-3">
              <input type="text" value={receiptConfig.companyName} onChange={e => onUpdateReceiptConfig({...receiptConfig, companyName: e.target.value})} placeholder="Company Name" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500" />
              <input type="text" value={receiptConfig.address} onChange={e => onUpdateReceiptConfig({...receiptConfig, address: e.target.value})} placeholder="Business Address" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={receiptConfig.phone} onChange={e => onUpdateReceiptConfig({...receiptConfig, phone: e.target.value})} placeholder="Phone" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500" />
                <input type="email" value={receiptConfig.email} onChange={e => onUpdateReceiptConfig({...receiptConfig, email: e.target.value})} placeholder="Email" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Digital Payments (QR)</h3>
        <div className="grid grid-cols-1 gap-4">
          {Object.keys(paymentQRCodes).map((m) => (
            <div key={m} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm overflow-hidden border border-slate-100">
                  {paymentQRCodes[m] ? <img src={paymentQRCodes[m]} className="w-full h-full object-contain" /> : <i className="fas fa-qrcode text-slate-200"></i>}
                </div>
                <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{m}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => triggerUpload(m)} className="bg-white px-4 py-2 rounded-xl text-[10px] font-black shadow-sm uppercase">Update</button>
                <button onClick={() => removePaymentMethod(m)} className="w-10 h-10 bg-white text-red-400 border border-slate-100 rounded-xl flex items-center justify-center"><i className="fas fa-trash-can"></i></button>
              </div>
            </div>
          ))}
          <button onClick={() => { setIsAddingNewMethod(true); setIsCustomMode(false); }} className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50">Add Payment Method</button>
        </div>
      </div>

      <button onClick={onLogout} className="w-full p-5 bg-white border border-slate-100 rounded-[32px] text-red-500 font-black uppercase text-xs tracking-widest">Sign Out</button>

      {/* Modals */}
      {showDrivePicker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-8 shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-xl font-black mb-6 uppercase">Select from Drive</h3>
            <div className="flex-1 overflow-y-auto">
              {isLoadingDrive ? <i className="fas fa-spinner fa-spin"></i> : (
                <div className="grid grid-cols-2 gap-4">
                  {driveFiles.map(file => (
                    <button key={file.id} onClick={() => handleBrandingDriveImport(file.id)} className="p-3 border rounded-2xl hover:bg-slate-50">
                      <img src={file.thumbnailLink?.replace('=s220', '=s400')} className="w-full aspect-square object-cover rounded-xl mb-2" />
                      <p className="text-[10px] truncate">{file.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setShowDrivePicker(false)} className="mt-4 p-4 font-black uppercase text-xs">Close</button>
          </div>
        </div>
      )}

      {isAddingNewMethod && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-md rounded-[48px] p-8 shadow-2xl">
            <h3 className="text-xl font-black mb-6 uppercase">New Payment Method</h3>
            {!isCustomMode ? (
              <div className="space-y-2">
                {HK_METHODS.map(m => (
                  <button key={m.id} onClick={() => addNewMethod(m.id)} className="w-full p-4 border rounded-2xl text-left flex items-center gap-4 hover:bg-slate-50">
                    <i className={`fas ${m.icon} ${m.color}`}></i>
                    <span className="font-bold">{m.name}</span>
                  </button>
                ))}
                <button onClick={() => setIsCustomMode(true)} className="w-full p-4 border border-dashed rounded-2xl">Other / Custom</button>
              </div>
            ) : (
              <div className="space-y-4">
                <input type="text" value={newMethodName} onChange={e => setNewMethodName(e.target.value)} placeholder="Method Name" className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" />
                <div onClick={() => modalFileInputRef.current?.click()} className="aspect-square border-2 border-dashed rounded-2xl flex items-center justify-center overflow-hidden">
                  {tempQRData ? <img src={tempQRData} className="w-full h-full object-contain" /> : 'Tap to Upload QR'}
                </div>
                <button onClick={() => addNewMethod(newMethodName, tempQRData)} className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase">Add Method</button>
              </div>
            )}
            <button onClick={() => setIsAddingNewMethod(false)} className="w-full mt-4 p-2 text-slate-400 font-bold uppercase text-[10px]">Cancel</button>
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
