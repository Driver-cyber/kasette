import { useState, useEffect } from 'react';

export default function InstallPrompt({ onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Check if user has dismissed before
    const hasDismissed = localStorage.getItem('installPromptDismissed');
    
    // Only show if not installed AND not previously dismissed
    if (!isStandalone && !hasDismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('installPromptDismissed', '1');
    setIsVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-walnut rounded-2xl max-w-[380px] w-full p-5 shadow-xl border border-walnut-light">
        <h2 className="text-lg font-medium text-center mb-1.5 text-wheat">Install Cassette</h2>
        <p className="text-[13px] text-rust text-center mb-5">Four easy steps</p>
        
        <div className="flex flex-col gap-3">
          {/* Step 1: Three dots OR Share button */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-amber/20 text-amber flex items-center justify-center font-medium text-xs z-10">1</div>
            <div className="bg-walnut-mid rounded-lg p-3 pl-7 border border-walnut-light">
              <p className="text-[13px] font-medium mb-2 text-wheat">Tap the Share button at the bottom of Safari</p>
              <div className="flex items-center gap-2.5">
                {/* Three dots option */}
                <div className="flex flex-col items-center gap-1">
                  <div className="px-2.5 py-1.5 bg-deep rounded-full inline-flex items-center justify-center">
                    <div className="flex gap-0.5">
                      <div className="w-[3px] h-[3px] bg-wheat rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-wheat rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-wheat rounded-full"></div>
                    </div>
                  </div>
                  <p className="text-[10px] text-rust">Newer iPhones</p>
                </div>
                <p className="text-[11px] text-rust">or</p>
                {/* Share icon option */}
                <div className="flex flex-col items-center gap-1">
                  <div className="px-2 py-1.5 bg-deep rounded-full inline-flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5DEB3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="text-[10px] text-rust">Older iPhones</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Step 2: Compact share sheet */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-amber/20 text-amber flex items-center justify-center font-medium text-xs z-10">2</div>
            <div className="bg-walnut-mid rounded-lg p-3 pl-7 border border-walnut-light">
              <p className="text-[13px] font-medium mb-2 text-wheat">Swipe up and find "Add to Home Screen"</p>
              <div className="mt-2 p-2.5 px-2 bg-deep rounded-t-xl border border-walnut-light">
                {/* Compact contact row */}
                <div className="flex gap-2.5 mb-1.5 pb-1.5 border-b border-walnut-light">
                  <div className="w-9 h-9 rounded-full bg-walnut-mid text-base flex items-center justify-center">👤</div>
                  <div className="w-9 h-9 rounded-full bg-walnut-mid"></div>
                </div>
                
                {/* Compact action buttons */}
                <div className="flex gap-3.5 justify-center mb-1.5 py-1 border-b border-walnut-light">
                  <div className="w-[38px] h-[38px] rounded-full bg-walnut-mid text-base flex items-center justify-center">📋</div>
                  <div className="w-[38px] h-[38px] rounded-full bg-walnut-mid text-base flex items-center justify-center">🔖</div>
                </div>
                
                {/* Compact list */}
                <div className="flex flex-col gap-0">
                  <div className="flex items-center gap-2 py-1.5 px-1 text-xs text-rust">
                    <div className="w-5 h-5 flex items-center justify-center text-sm">⭐</div>
                    <span>Add to Favorites</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 px-1 bg-amber/10 rounded-md -mx-0.5">
                    <div className="w-5 h-5 border-[1.5px] border-amber rounded flex items-center justify-center">
                      <span className="text-sm text-amber font-medium">+</span>
                    </div>
                    <span className="text-xs font-medium text-amber">Add to Home Screen</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Step 3: Tap it */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-amber/20 text-amber flex items-center justify-center font-medium text-xs z-10">3</div>
            <div className="bg-walnut-mid rounded-lg p-3 pl-7 border border-walnut-light">
              <p className="text-[13px] font-medium text-wheat">Tap "Add to Home Screen"</p>
            </div>
          </div>
          
          {/* Step 4: Toggle and Add */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-amber/20 text-amber flex items-center justify-center font-medium text-xs z-10">4</div>
            <div className="bg-walnut-mid rounded-lg p-3 pl-7 border border-walnut-light">
              <p className="text-[13px] font-medium mb-2 text-wheat">Make sure "Open as app" is checked</p>
              <div className="bg-deep rounded-md p-2 border border-walnut-light mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-wheat">Open as app</span>
                  <div className="w-10 h-6 bg-green-500 rounded-full relative">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"></div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-rust">Then tap <strong className="text-wheat">"Add"</strong> in the top right</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={handleDismiss}
          className="w-full mt-4 py-2.5 text-sm font-medium bg-amber text-walnut rounded-xl hover:bg-amber/90 active:scale-[0.98] transition-transform"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
