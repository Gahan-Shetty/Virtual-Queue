import Navbar from './components/Navbar';
import MetadataHeader from './components/MetadataHeader';
import HeroTypography from './components/HeroTypography';
import WireframeInfinity from './components/WireframeInfinity';

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col p-4 md:p-6 overflow-hidden relative">
      <div className="noise-overlay"></div>
      
      {/* Outer Border Frame */}
      <div className="flex-1 border border-border rounded-2xl md:rounded-3xl flex flex-col relative z-10 overflow-hidden relative">
        <Navbar />
        
        <main className="flex-1 flex flex-col relative pt-4 md:pt-8 px-6 md:px-12 pb-8">
          <MetadataHeader />
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 mt-12 md:mt-24 relative">
            
            {/* Left Column */}
            <div className="md:col-span-7 flex flex-col justify-between z-10 relative">
              <div>
                <div className="flex items-center gap-4 text-accent text-xs tracking-widest mb-12">
                  <div className="w-8 h-[1px] bg-accent/50"></div>
                  <span>LIVE STATUS</span>
                  <span className="ml-16">V-1.0</span>
                </div>
                
                <HeroTypography />
              </div>
              
              <div className="mt-24 md:mt-auto">
                <a href="/patient/index.html" className="group flex flex-col w-max text-xs tracking-widest uppercase font-medium mt-12 text-accent">
                  <div className="flex items-center gap-2 mb-2">
                    <span>Book Your Spot Now</span>
                    <span className="transform translate-y-0.5 group-hover:translate-x-1 transition-transform">↘</span>
                  </div>
                  <div className="h-[1px] w-full bg-border group-hover:bg-accent transition-colors"></div>
                </a>
              </div>
            </div>
            
            {/* Right Column (Graphic & Controls) */}
            <div className="md:col-span-5 relative h-full min-h-[400px] flex flex-col justify-end">
              {/* The absolute positioning handles the infinity graphic overlap */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] md:w-[120%] md:-translate-x-[40%] pointer-events-none z-0">
                <WireframeInfinity />
              </div>
              
              <div className="relative z-10 w-full flex justify-end">
                {/* Cleaned up direction selector */}
              </div>
            </div>
            
          </div>
          
        </main>
      </div>
    </div>
  );
}

export default App;
