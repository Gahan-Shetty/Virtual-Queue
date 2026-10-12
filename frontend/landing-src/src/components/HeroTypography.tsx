import React from 'react';

const HeroTypography = () => {
  return (
    <div className="relative z-10 flex flex-col">
      <h1 className="text-4xl md:text-5xl lg:text-[4rem] font-medium leading-[1.1] tracking-tight uppercase max-w-xl">
        Reserve <br />
        Your Spot.
      </h1>
      
      {/* The massive Together typography */}
      <div className="mt-2 -ml-2 md:-ml-4 relative">
        <span className="font-serif italic text-accent opacity-90 text-[8rem] sm:text-[10rem] md:text-hero leading-[0.75] block tracking-tighter mix-blend-multiply dark:mix-blend-screen drop-shadow-lg transition-all duration-300">
          Virtually.
        </span>
      </div>
    </div>
  );
};

export default HeroTypography;
