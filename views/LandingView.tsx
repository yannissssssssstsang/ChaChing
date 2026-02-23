
import React from 'react';
import { Language } from '../types';

interface LandingViewProps {
  onLogin: () => void;
  lang: Language;
  setLang: (l: Language) => void;
}

const LandingView: React.FC<LandingViewProps> = ({ onLogin, lang, setLang }) => {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden text-slate-900">
      {/* Background Accents - THEME COLOR #0088CC */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0088CC] rounded-full blur-[120px] opacity-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0088CC] rounded-full blur-[120px] opacity-5"></div>

      <div className="max-w-md w-full text-center space-y-12 z-10">
        <div className="flex flex-col items-center gap-6">
          <div className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center shadow-2xl shadow-blue-200">
            <i className="fas fa-cash-register text-white text-4xl"></i>
          </div>
          <div className="space-y-2">
            <h1 className="text-5xl font-black tracking-tighter text-slate-900">
              StallMate
            </h1>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-[0.4em]">
              {lang === Language.ZH ? '智能零售生態系統' : 'Intelligent Retail Ecosystem'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <button 
            onClick={onLogin}
            className="w-full bg-slate-900 text-white p-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-slate-200 transition-all active:scale-95 flex items-center justify-center gap-4 group hover:bg-slate-800"
          >
            <div className="w-6 h-6 flex items-center justify-center">
               <svg viewBox="0 0 24 24" className="w-full h-full">
                 <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                 <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" opacity="0.8"/>
                 <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" opacity="0.6"/>
                 <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" opacity="0.4"/>
               </svg>
            </div>
            <span>{lang === Language.ZH ? '使用 Google 帳戶登入' : 'Sign in with Google'}</span>
          </button>
        </div>

        {/* Privacy Note for End Users */}
        <div className="bg-blue-50/50 p-6 rounded-[32px] border border-blue-100/50 text-left space-y-3">
          <div className="flex items-center gap-3 text-blue-600">
            <i className="fas fa-shield-halved text-sm"></i>
            <p className="text-[10px] font-black uppercase tracking-widest">Privacy Guarantee</p>
          </div>
          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
            {lang === Language.ZH 
              ? '您的數據（庫存、銷售記錄）將私密地儲存在您自己的 Google Drive 中。我們不會訪問您的個人檔案，也不會儲存您的客戶資料。' 
              : 'Your data (inventory, sales) is stored privately in your own Google Drive. We never access your personal files or store your customer data on our servers.'}
          </p>
          <div className="pt-2 flex gap-4">
            <a 
              href="/privacy.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              {lang === Language.ZH ? '隱私政策' : 'Privacy Policy'}
            </a>
            <span className="text-slate-300">|</span>
            <a 
              href="/tos.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
            >
              {lang === Language.ZH ? '服務條款' : 'Terms of Service'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingView;
