import React from 'react';

const DirectionSelector = () => {
  return (
    <div className="flex flex-col items-end z-20 absolute bottom-0 right-0 max-w-xs">
      <div className="text-[10px] tracking-widest text-muted uppercase mb-4 w-full text-right">
        MV / Directions
      </div>
      
      <div className="flex items-center gap-6 text-[10px] tracking-widest uppercase mb-4 border-b border-border/50 pb-2 w-full justify-end">
        <button className="text-foreground border-b border-foreground pb-2 -mb-[9px]">01 People</button>
        <button className="text-muted hover:text-foreground transition-colors pb-2">02 Systems</button>
        <button className="text-muted hover:text-foreground transition-colors pb-2">03 Research</button>
      </div>
      
      <p className="text-xs text-foreground/80 font-light text-right mb-6">
        A shared direction. Room for everyone to contribute.
      </p>
      
      <div className="flex items-center gap-6 text-[10px] text-muted tracking-wide">
        <button className="hover:text-foreground transition-colors flex items-center gap-1">
          Open the form <span>+</span>
        </button>
        <span>Drag to rotate.</span>
      </div>
    </div>
  );
};

export default DirectionSelector;
