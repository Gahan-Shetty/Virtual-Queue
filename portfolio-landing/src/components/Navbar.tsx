import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const Navbar = () => {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);
  return (
    <header className="flex justify-between items-center px-6 md:px-12 py-6 relative z-50">
      <div className="flex items-center gap-3">
        <div className="flex flex-col text-accent">
          <span className="text-xl tracking-widest font-bold leading-none uppercase">Virtual</span>
          <span className="text-[10px] tracking-widest text-foreground font-medium leading-none mt-1 uppercase">Queue</span>
        </div>
      </div>

      <nav className="hidden md:flex items-center gap-8 text-[10px] tracking-widest uppercase text-muted">
        <a href="/patient/index.html" className="hover:text-foreground transition-colors">Patient Portal</a>
        <a href="/staff/index.html" className="hover:text-foreground transition-colors">Staff Console</a>
        <a href="/admin/index.html" className="hover:text-foreground transition-colors">Admin Panel</a>
        <a href="/patient/index.html" className="text-foreground hover:text-accent transition-colors flex items-center gap-1">
          Book Token <span className="text-[14px]">↗</span>
        </a>
        <button onClick={toggleTheme} className="ml-4 hover:text-foreground transition-colors text-muted">
          {isDark ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
        </button>
      </nav>
      
      {/* Divider */}
      <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-border/50"></div>
    </header>
  );
};

export default Navbar;
