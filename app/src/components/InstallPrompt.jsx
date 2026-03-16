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
    localStorage.setItem('installPromptDismissed', 'true');
    setIsVisible(false);
    if (onDismiss) onDismiss();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-[380px] w-full p-5 shadow-xl">
        <h2 className="text-lg font-medium text-center mb-1.5">Install Cassette</h2>
        <p className="text-[13px] text-gray-500 text-center mb-5">Four easy steps</p>
        
        <div className="flex flex-col gap-3">
          {/* Step 1: Three dots */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-xs z-10">1</div>
            <div className="bg-gray-50 rounded-lg p-3 pl-7">
              <p className="text-[13px] font-medium mb-1.5">Tap the three dots</p>
              <div className="flex items-center gap-1.5">
                <div className="px-2.5 py-1.5 bg-black/[0.06] rounded-full inline-flex items-center justify-center">
                  <div className="flex gap-0.5">
                    <div className="w-[3px] h-[3px] bg-gray-900 rounded-full"></div>
                    <div className="w-[3px] h-[3px] bg-gray-900 rounded-full"></div>
                    <div className="w-[3px] h-[3px] bg-gray-900 rounded-full"></div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">← Bottom right corner</p>
              </div>
            </div>
          </div>
          
          {/* Step 2: Compact share sheet */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-xs z-10">2</div>
            <div className="bg-gray-50 rounded-lg p-3 pl-7">
              <p className="text-[13px] font-medium mb-2">Swipe up and find "Add to Home Screen"</p>
              <div className="mt-2 p-2.5 px-2 bg-white rounded-t-xl border border-gray-200">
                {/* Compact contact row */}
                <div className="flex gap-2.5 mb-1.5 pb-1.5 border-b border-gray-200">
                  <div className="w-9 h-9 rounded-full bg-gray-100 text-base flex items-center justify-center">👤</div>
                  <div className="w-9 h-9 rounded-full bg-gray-100"></div>
                </div>
                
                {/* Compact action buttons */}
                <div className="flex gap-3.5 justify-center mb-1.5 py-1 border-b border-gray-200">
                  <div className="w-[38px] h-[38px] rounded-full bg-gray-100 text-base flex items-center justify-center">📋</div>
                  <div className="w-[38px] h-[38px] rounded-full bg-gray-100 text-base flex items-center justify-center">🔖</div>
                </div>
                
                {/* Compact list */}
                <div className="flex flex-col gap-0">
                  <div className="flex items-center gap-2 py-1.5 px-1 text-xs text-gray-500">
                    <div className="w-5 h-5 flex items-center justify-center text-sm">⭐</div>
                    <span>Add to Favorites</span>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 px-1 bg-blue-50 rounded-md -mx-0.5">
                    <div className="w-5 h-5 border-[1.5px] border-blue-500 rounded flex items-center justify-center">
                      <span className="text-sm text-blue-500 font-medium">+</span>
                    </div>
                    <span className="text-xs font-medium text-blue-600">Add to Home Screen</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Step 3: Tap it */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-xs z-10">3</div>
            <div className="bg-gray-50 rounded-lg p-3 pl-7">
              <p className="text-[13px] font-medium">Tap "Add to Home Screen"</p>
            </div>
          </div>
          
          {/* Step 4: Toggle and Add */}
          <div className="relative">
            <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium text-xs z-10">4</div>
            <div className="bg-gray-50 rounded-lg p-3 pl-7">
              <p className="text-[13px] font-medium mb-2">Make sure "Open as app" is checked</p>
              <div className="bg-white rounded-md p-2 border border-gray-200 mb-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Open as app</span>
                  <div className="w-10 h-6 bg-green-500 rounded-full relative">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm"></div>
                  </div>
                </div>
              </div>
              <p className="text-xs">Then tap <strong>"Add"</strong> in the top right</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={handleDismiss}
          className="w-full mt-4 py-2.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:scale-[0.98] transition-transform"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
