import React from 'react';

const ProfileBlock = () => {
  return (
    <div className="flex flex-col max-w-sm mt-8 z-20 relative">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop" 
            alt="Matteo Vincenti Profile" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Virtual Queue</span>
          <span className="text-xs text-muted">Smart Healthcare Waiting</span>
        </div>
      </div>
      
      <p className="text-sm text-foreground/80 leading-relaxed mb-6 font-light">
        We manage patient flow effortlessly. Reserve your slot online, physically check in on arrival, and skip the crowded waiting rooms.
      </p>
      
      <a href="#" className="group flex flex-col w-max text-xs tracking-widest uppercase font-medium">
        <div className="flex items-center gap-2 mb-2">
          <span>See How I Work</span>
          <span className="transform translate-y-0.5 group-hover:translate-x-1 transition-transform">↘</span>
        </div>
        <div className="h-[1px] w-full bg-border group-hover:bg-accent transition-colors"></div>
      </a>
    </div>
  );
};

export default ProfileBlock;
