
import React from 'react';
import { Language } from '../types';

interface LandingViewProps {
  onLogin: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  isLoggingIn?: boolean;
  loginError?: string | null;
}

const LandingView: React.FC<LandingViewProps> = ({ onLogin, lang, setLang, isLoggingIn, loginError }) => {
  return (
    <div className="min-h-screen bg-main flex flex-col items-center justify-center p-8 relative overflow-hidden transition-colors duration-500">
      {/* Subtle Background Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-accent rounded-full blur-[140px] opacity-5"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-accent rounded-full blur-[140px] opacity-5"></div>

      <div className="max-w-md w-full text-center space-y-16 z-10 animate-fade-in">
        <div className="flex flex-col items-center gap-8">
          <div className="w-20 h-20 bg-accent rounded-[28px] flex items-center justify-center shadow-2xl shadow-accent/30">
            <i className="fas fa-cash-register text-white text-3xl"></i>
          </div>
          <div className="space-y-3">
            <h1 className="text-6xl font-bold tracking-tight">
              Stallmate
            </h1>
            <p className="text-sm font-semibold text-accent uppercase tracking-[0.3em]">
              {lang === Language.ZH ? '智能零售生態系統' : 'Intelligent Retail Ecosystem'}
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <button 
            onClick={onLogin}
            disabled={isLoggingIn}
            className={`w-full bg-accent text-white p-6 rounded-3xl font-bold text-sm shadow-2xl shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-4 group ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? (
              <i className="fas fa-circle-notch fa-spin"></i>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center">
                 <svg viewBox="0 0 24 24" className="w-full h-full">
                   <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                   <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white" opacity="0.8"/>
                   <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="white" opacity="0.6"/>
                   <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white" opacity="0.4"/>
                 </svg>
              </div>
            )}
            <span>{isLoggingIn ? (lang === Language.ZH ? '正在連接...' : 'Connecting...') : (lang === Language.ZH ? '使用 Google 帳戶登入' : 'Sign in with Google')}</span>
          </button>

          {loginError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-bold flex items-center gap-3 animate-shake">
              <i className="fas fa-circle-exclamation"></i>
              <span>{loginError}</span>
            </div>
          )}
        </div>

        {/* Privacy Note */}
        <div className="glass-panel p-8 rounded-[32px] text-left space-y-4 border border-color">
          <div className="flex items-center gap-3 text-accent">
            <i className="fas fa-shield-halved text-sm"></i>
            <p className="text-[10px] font-bold uppercase tracking-widest">Privacy Guarantee</p>
          </div>
          <p className="text-xs font-medium text-muted leading-relaxed">
            {lang === Language.ZH 
              ? '您的數據（庫存、銷售記錄）將私密地儲存在您自己的 Google Drive 中。我們不會訪問您的個人檔案，也不會儲存您的客戶資料。' 
              : 'Your data (inventory, sales) is stored privately in your own Google Drive. We never access your personal files or store your customer data on our servers.'}
          </p>
          <div className="pt-2 flex gap-6">
            <a 
              href="/privacy.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-accent uppercase tracking-widest hover:underline"
            >
              {lang === Language.ZH ? '隱私政策' : 'Privacy Policy'}
            </a>
            <a 
              href="/tos.html" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-accent uppercase tracking-widest hover:underline"
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
