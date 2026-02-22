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
  const t = TRANSLATIONS[lang];
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
      className={({ isActive }) => `flex flex-col md:flex-row items-center gap-1 md:gap-4 p-2 md:px-6 md:py-4 transition-all rounded-2xl ${isActive ? 'text-blue-600 bg-blue-50 md:bg-blue-600 md:text-white' : 'text-slate-400 hover:text-slate-600 md:hover:bg-slate-50'}`}
    >
      <i className={`fas ${icon} text-lg md:text-xl`}></i>
      <span className="text-[9px] md:text-sm uppercase md:capitalize font-bold">{label}</span>
    </NavLink>
  );

  return (
    <div className={`flex flex-col md:flex-row h-screen overflow-hidden transition-colors duration-300 ${isDarkMode ? 'dark-mode bg-slate-950' : 'bg-white md:bg-slate-50'}`}>
      {/* Sidebar (Desktop & Tablet) */}
      <aside className={`hidden md:flex flex-col w-64 border-r shrink-0 p-6 transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <i className="fas fa-store text-white"></i>
          </div>
          <h1 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{t.appName}</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem to="/" icon="fa-cash-register" label={t.ordering} />
          <NavItem to="/inventory" icon="fa-boxes-stacked" label={t.inventory} />
          <NavItem to="/records" icon="fa-receipt" label={t.records} />
          <NavItem to="/analytics" icon="fa-chart-line" label={t.analytics} />
          <NavItem to="/settings" icon="fa-cog" label={t.settings} />
        </nav>

        <div className={`pt-6 border-t space-y-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          {/* Sidebar Dark Mode Toggle */}
          <button 
            onClick={onToggleDarkMode}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-blue-400' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
          >
            <div className="flex items-center gap-3">
              <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-sm`}></i>
              <span className="text-[10px] font-bold uppercase tracking-widest">{isDarkMode ? 'Dark' : 'Light'}</span>
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-blue-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`}></div>
            </div>
          </button>

          {/* Sidebar Language Toggle */}
          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'}`}
          >
            <div className="flex items-center gap-3">
              <i className="fas fa-globe text-sm"></i>
              <span className="text-[10px] font-bold uppercase tracking-widest">{lang === Language.EN ? 'English' : '繁體中文'}</span>
            </div>
            <span className="text-[10px] font-black text-blue-600">{lang === Language.EN ? 'ZH' : 'EN'}</span>
          </button>

          <button 
            onClick={onLogout}
            className={`w-full py-3 rounded-xl font-black transition-colors text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border ${isDarkMode ? 'bg-red-950/20 border-red-900/30 text-red-500 hover:bg-red-950/40' : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100'}`}
          >
            <i className="fas fa-arrow-right-from-bracket"></i>
            Sign Out
          </button>
          
          <div className="flex items-center justify-between px-3 pt-1">
             <span className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`}>
               {isSyncing ? 'Syncing...' : (isOnline ? 'Cloud Active' : 'Offline')}
             </span>
             <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-blue-500 sync-pulse' : (isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse')}`}></div>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className={`md:hidden text-white p-4 flex justify-between items-center shrink-0 z-50 shadow-md transition-colors duration-300 ${isDarkMode ? 'bg-slate-900' : (isSyncing ? 'bg-blue-500' : (isOnline ? 'bg-blue-600' : 'bg-slate-800'))}`}>
        <div className="flex items-center gap-3">
           <h1 className="text-xl font-bold tracking-tight">{t.appName}</h1>
           {isSyncing ? (
             <i className="fas fa-sync fa-spin text-[10px]"></i>
           ) : !isOnline && (
             <span className="text-[10px] bg-amber-500 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Offline</span>
           )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onToggleDarkMode}
            className={`w-12 h-10 rounded-xl flex flex-col items-center justify-center transition-all border ${isDarkMode ? 'bg-slate-800 text-blue-400 border-slate-700' : 'bg-white/20 text-white border-transparent'}`}
          >
            <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-[10px]`}></i>
            <span className="text-[7px] font-black uppercase tracking-tighter mt-0.5">{isDarkMode ? 'DARK' : 'LIGHT'}</span>
          </button>
          
          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className="bg-white/20 hover:bg-white/30 px-3 h-10 rounded-xl text-xs font-bold transition-colors"
          >
            {lang === Language.EN ? '繁中' : 'EN'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto relative p-4 md:p-8 lg:p-12 transition-colors duration-300 ${isDarkMode ? 'bg-slate-950' : 'bg-white md:bg-slate-50'}`}>
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 border-t flex justify-around items-center py-2 px-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] transition-colors duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
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