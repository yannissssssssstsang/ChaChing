import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  lang: Language;
  setLang: (l: Language) => void;
  onLogout: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string | null;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  lang, 
  setLang, 
  onLogout, 
  isSyncing, 
  lastSyncTime,
  isDarkMode = false,
  onToggleDarkMode
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS[Language.EN];
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const NavItem = ({ to, icon, label }: { to: string, icon: string, label: string }) => (
    <NavLink 
      to={to} 
      className={({ isActive }) => `flex flex-col md:flex-row items-center gap-2 md:gap-4 p-3 md:px-6 md:py-3 transition-all rounded-2xl ${isActive ? 'text-accent bg-accent/10' : 'text-muted hover:text-primary hover:bg-accent/5'}`}
    >
      <i className={`fas ${icon} text-lg`}></i>
      <span className="text-[10px] md:text-sm font-semibold tracking-tight">{label}</span>
    </NavLink>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-main">
      {/* Sidebar (Desktop & Tablet) */}
      <aside className="hidden md:flex flex-col w-72 shrink-0 p-8 glass-panel border-r border-color">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center shadow-2xl shadow-accent/30">
            <i className="fas fa-cash-register text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t.appName}</h1>
            <p className="text-[10px] text-muted font-medium uppercase tracking-widest">Market POS</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <NavItem to="/" icon="fa-cash-register" label={t.ordering} />
          <NavItem to="/inventory" icon="fa-boxes-stacked" label={t.inventory} />
          <NavItem to="/records" icon="fa-receipt" label={t.records} />
          <NavItem to="/analytics" icon="fa-chart-line" label={t.analytics} />
          <NavItem to="/settings" icon="fa-cog" label={t.settings} />
        </nav>

        <div className="pt-8 mt-8 border-t border-color space-y-4">
          <div className="flex items-center justify-between px-4 py-2 bg-accent/5 rounded-2xl">
            <div className="flex items-center gap-3">
              <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-accent`}></i>
              <span className="text-xs font-semibold">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <button 
              onClick={onToggleDarkMode}
              className={`w-10 h-5 rounded-full relative transition-all ${isDarkMode ? 'bg-accent' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'right-1' : 'left-1'}`}></div>
            </button>
          </div>

          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-accent/5 hover:bg-accent/10 transition-all group"
          >
            <div className="flex items-center gap-3">
              <i className="fas fa-globe text-muted group-hover:text-accent transition-colors"></i>
              <span className="text-xs font-semibold">{lang === Language.EN ? 'English' : '繁體中文'}</span>
            </div>
            <span className="text-[10px] font-bold text-accent">{lang === Language.EN ? 'ZH' : 'EN'}</span>
          </button>

          <button 
            onClick={onLogout}
            className="w-full p-4 rounded-2xl font-bold text-xs text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-all flex items-center justify-center gap-3"
          >
            <i className="fas fa-arrow-right-from-bracket"></i>
            {t.logout || 'Sign Out'}
          </button>
          
          <div className="flex items-center justify-between px-4 pt-2">
             <span className="text-[10px] font-semibold text-muted uppercase tracking-widest">
               {isSyncing ? 'Syncing...' : (isOnline ? 'Cloud Active' : 'Offline')}
             </span>
             <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-accent animate-pulse' : (isOnline ? 'bg-emerald-500' : 'bg-amber-500')}`}></div>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden glass-panel p-4 flex justify-between items-center shrink-0 z-50 border-b border-color">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 bg-accent rounded-xl flex items-center justify-center">
             <i className="fas fa-cash-register text-white text-sm"></i>
           </div>
           <h1 className="text-lg font-bold tracking-tight">{t.appName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onToggleDarkMode}
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-accent/5 text-accent"
          >
            <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'}`}></i>
          </button>
          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className="h-10 px-4 rounded-2xl bg-accent/5 text-accent text-xs font-bold"
          >
            {lang === Language.EN ? '繁中' : 'EN'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative p-6 md:p-12 lg:p-16">
        <div className="max-w-6xl mx-auto animate-fade-in">{children}</div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass-panel border-t border-color flex justify-around items-center py-3 px-4 z-50">
        <NavItem to="/" icon="fa-cash-register" label={t.ordering} />
        <NavItem to="/inventory" icon="fa-boxes-stacked" label={t.inventory} />
        <NavItem to="/records" icon="fa-receipt" label={t.records} />
        <NavItem to="/analytics" icon="fa-chart-line" label={t.analytics} />
        <NavItem to="/settings" icon="fa-cog" label={t.settings} />
      </nav>
    </div>
  );
};

export default Layout;