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
      className={({ isActive }) => `flex flex-col md:flex-row items-center gap-1 md:gap-4 p-2 md:px-6 md:py-3.5 transition-all rounded-2xl ${isActive ? 'text-black bg-zinc-100 md:bg-black md:text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600 md:hover:bg-zinc-50'}`}
    >
      <i className={`fas ${icon} text-lg md:text-xl`}></i>
      <span className="text-[9px] md:text-sm uppercase md:capitalize font-semibold tracking-tight">{label}</span>
    </NavLink>
  );

  return (
    <div className={`flex flex-col md:flex-row h-screen overflow-hidden transition-colors duration-500 ${isDarkMode ? 'dark-mode bg-black' : 'bg-[#fafafa]'}`}>
      {/* Sidebar (Desktop & Tablet) */}
      <aside className={`hidden md:flex flex-col w-72 shrink-0 p-8 transition-all duration-500 ${isDarkMode ? 'bg-zinc-900/50 border-r border-zinc-800/50' : 'bg-white/80 border-r border-zinc-200/50'} backdrop-blur-xl`}>
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="w-11 h-11 bg-black rounded-2xl flex items-center justify-center shadow-2xl shadow-black/10">
            <i className="fas fa-cash-register text-white text-lg"></i>
          </div>
          <h1 className={`text-2xl font-extrabold tracking-tighter ${isDarkMode ? 'text-white' : 'text-black'}`}>{t.appName}</h1>
        </div>

        <nav className="flex-1 space-y-1.5">
          <NavItem to="/" icon="fa-cash-register" label={t.ordering} />
          <NavItem to="/inventory" icon="fa-boxes-stacked" label={t.inventory} />
          <NavItem to="/records" icon="fa-receipt" label={t.records} />
          <NavItem to="/analytics" icon="fa-chart-line" label={t.analytics} />
          <NavItem to="/settings" icon="fa-cog" label={t.settings} />
        </nav>

        <div className={`pt-8 border-t space-y-4 ${isDarkMode ? 'border-zinc-800' : 'border-zinc-100'}`}>
          {/* Sidebar Dark Mode Toggle */}
          <button 
            onClick={onToggleDarkMode}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100'}`}
          >
            <div className="flex items-center gap-3">
              <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-sm`}></i>
              <span className="text-[10px] font-bold uppercase tracking-widest">{isDarkMode ? 'Dark' : 'Light'}</span>
            </div>
            <div className={`w-9 h-5 rounded-full relative transition-colors ${isDarkMode ? 'bg-white' : 'bg-zinc-300'}`}>
              <div className={`absolute top-1 w-3 h-3 rounded-full transition-all ${isDarkMode ? 'right-1 bg-black' : 'left-1 bg-white'}`}></div>
            </div>
          </button>

          {/* Sidebar Language Toggle */}
          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100'}`}
          >
            <div className="flex items-center gap-3">
              <i className="fas fa-globe text-sm"></i>
              <span className="text-[10px] font-bold uppercase tracking-widest">{lang === Language.EN ? 'English' : '繁體中文'}</span>
            </div>
            <span className="text-[10px] font-black text-black">{lang === Language.EN ? 'ZH' : 'EN'}</span>
          </button>

          <button 
            onClick={onLogout}
            className={`w-full py-4 rounded-2xl font-bold transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border ${isDarkMode ? 'bg-zinc-800/30 border-zinc-700/30 text-zinc-400 hover:bg-zinc-800/50' : 'bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100'}`}
          >
            <i className="fas fa-arrow-right-from-bracket"></i>
            Sign Out
          </button>
          
          <div className="flex items-center justify-between px-3 pt-2">
             <span className={`text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-zinc-600' : 'text-zinc-300'}`}>
               {isSyncing ? 'Syncing...' : (isOnline ? 'Cloud Active' : 'Offline')}
             </span>
             <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-black animate-pulse' : (isOnline ? 'bg-emerald-500' : 'bg-emerald-500 animate-pulse')}`}></div>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className={`md:hidden p-5 flex justify-between items-center shrink-0 z-50 transition-all duration-500 ${isDarkMode ? 'bg-black/80 border-b border-zinc-800/50' : 'bg-white/80 border-b border-zinc-200/50'} backdrop-blur-xl`}>
        <div className="flex items-center gap-3">
           <h1 className={`text-xl font-extrabold tracking-tighter ${isDarkMode ? 'text-white' : 'text-black'}`}>{t.appName}</h1>
           {isSyncing ? (
             <i className="fas fa-sync fa-spin text-[10px] text-zinc-400"></i>
           ) : !isOnline && (
             <span className="text-[10px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border border-amber-500/20">Offline</span>
           )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onToggleDarkMode}
            className={`w-12 h-10 rounded-2xl flex flex-col items-center justify-center transition-all border ${isDarkMode ? 'bg-zinc-800/50 text-white border-zinc-700/50' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}
          >
            <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-[10px]`}></i>
            <span className="text-[7px] font-bold uppercase tracking-tighter mt-0.5">{isDarkMode ? 'DARK' : 'LIGHT'}</span>
          </button>
          
          <button 
            onClick={() => setLang(lang === Language.EN ? Language.ZH : Language.EN)}
            className={`px-4 h-10 rounded-2xl text-xs font-bold transition-all border ${isDarkMode ? 'bg-zinc-800/50 text-white border-zinc-700/50' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`}
          >
            {lang === Language.EN ? '繁中' : 'EN'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto relative p-6 md:p-10 lg:p-14 transition-all duration-500 ${isDarkMode ? 'bg-black' : 'bg-[#fafafa]'}`}>
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className={`md:hidden fixed bottom-6 left-6 right-6 h-20 rounded-[32px] flex justify-around items-center px-4 z-50 transition-all duration-500 ${isDarkMode ? 'bg-zinc-900/80 border border-zinc-800/50' : 'bg-white/80 border border-zinc-200/50'} backdrop-blur-xl shadow-2xl shadow-black/5`}>
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