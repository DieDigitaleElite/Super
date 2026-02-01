
import React, { useState, useCallback, useEffect } from 'react';
import { Product, TryOnState } from './types';
import { MOCK_PRODUCTS, AVAILABLE_SIZES } from './constants';
import { performVirtualTryOn, fileToBase64, urlToBase64, estimateSizeFromImage } from './services/geminiService';
import ProductCard from './components/ProductCard';
import StepIndicator from './components/StepIndicator';

const App: React.FC = () => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [state, setState] = useState<TryOnState>({
    userImage: null,
    selectedProduct: null,
    resultImage: null,
    recommendedSize: null,
    isLoading: false,
    error: null,
  });

  const [step, setStep] = useState(1);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      const connected = await window.aistudio.hasSelectedApiKey();
      setHasKey(connected);
    };
    checkKey();
  }, []);

  const handleConnect = async () => {
    // @ts-ignore
    await window.aistudio.openSelectKey();
    setHasKey(true); // Race condition abfangen
  };

  const handleProductSelect = useCallback((product: Product) => {
    setState(prev => ({ ...prev, selectedProduct: product }));
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setState(prev => ({ ...prev, userImage: base64, error: null }));
      } catch (err) {
        setState(prev => ({ ...prev, error: "Fehler beim Lesen der Bilddatei." }));
      }
    }
  }, []);

  const handleTryOn = async () => {
    if (!state.userImage || !state.selectedProduct) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setStep(3);

    try {
      const productBase64 = await urlToBase64(state.selectedProduct.imageUrl);
      
      // Sequentiell für maximale Stabilität
      const aiRecommendedSize = await estimateSizeFromImage(state.userImage, state.selectedProduct.name);
      await new Promise(r => setTimeout(r, 1000));
      const result = await performVirtualTryOn(state.userImage, productBase64, state.selectedProduct.name);
      
      setState(prev => ({ 
        ...prev, 
        resultImage: result, 
        recommendedSize: aiRecommendedSize,
        isLoading: false 
      }));
    } catch (err: any) {
      console.error("Process Error:", err);
      let msg = err.message || "Ein technischer Fehler ist aufgetreten.";
      if (msg.includes("not found")) {
        setHasKey(false);
        msg = "Bitte verbinde deinen API-Key erneut (Paid Project erforderlich).";
      }
      setState(prev => ({ ...prev, isLoading: false, error: msg }));
    }
  };

  const reset = () => {
    setState({ userImage: null, selectedProduct: null, resultImage: null, recommendedSize: null, isLoading: false, error: null });
    setStep(1);
  };

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-[32px] p-10 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🔐</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-4 uppercase tracking-tight">Anprobe aktivieren</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Um die hochauflösende KI-Anprobe zu nutzen, ist eine Verbindung zu deinem Google Cloud Projekt erforderlich. 
            <br/><span className="text-xs mt-2 block font-medium text-gray-400 italic">Hinweis: Erfordert ein Projekt mit hinterlegter Abrechnung (Billing).</span>
          </p>
          <button 
            onClick={handleConnect}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
          >
            JETZT VERBINDEN
          </button>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            className="block mt-6 text-xs text-indigo-500 font-bold hover:underline"
          >
            Infos zur Abrechnung & Limits
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-slate-50 font-sans">
      <header className="bg-white border-b border-gray-200 py-4 mb-8 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="font-bold text-xl tracking-tight uppercase">Better Future <span className="font-light text-gray-500">Collection</span></span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>Pro Engine Active</span>
            </div>
            <button onClick={reset} className="text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Reset</button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl">
        <StepIndicator currentStep={step} />

        {step === 1 && (
          <div className="animate-fadeIn">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">WÄHLE DEINEN LOOK</h1>
              <p className="text-gray-500 text-lg">Wähle ein Set aus unserer neuen Kollektion.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-12 max-w-4xl mx-auto">
              {MOCK_PRODUCTS.map(product => (
                <ProductCard key={product.id} product={product} isSelected={state.selectedProduct?.id === product.id} onSelect={handleProductSelect} />
              ))}
            </div>
            <div className="flex justify-center">
              <button
                disabled={!state.selectedProduct}
                onClick={() => setStep(2)}
                className={`px-12 py-5 rounded-full font-black text-xl transition-all shadow-2xl ${
                  state.selectedProduct ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                FOTO HOCHLADEN
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fadeIn max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black text-gray-900 mb-3">DEIN FOTO</h1>
              <p className="text-gray-500">Für beste Ergebnisse: Nutze ein Ganzkörperfoto mit gutem Licht.</p>
            </div>
            <div className="bg-white p-10 rounded-[40px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center min-h-[450px] shadow-inner">
              {state.userImage ? (
                <div className="relative w-full max-w-xs animate-scaleIn">
                  <img src={state.userImage} alt="Vorschau" className="rounded-3xl shadow-2xl w-full h-[400px] object-cover border-4 border-white" />
                  <button onClick={() => setState(prev => ({ ...prev, userImage: null }))} className="absolute -top-4 -right-4 bg-red-500 text-white p-3 rounded-full shadow-xl hover:bg-red-600 transition-transform hover:scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer group py-12">
                  <div className="w-24 h-24 bg-indigo-50 rounded-[32px] flex items-center justify-center mb-6 transition-all group-hover:scale-110 group-hover:bg-indigo-100 group-hover:rotate-3 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <p className="text-xl font-black text-gray-800 tracking-tight">BILD AUSWÄHLEN</p>
                  <p className="text-gray-400 mt-2 text-sm uppercase tracking-widest font-bold">Max. 5MB • JPEG / PNG</p>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-12 justify-center">
              <button onClick={() => setStep(1)} className="px-10 py-4 rounded-full font-black text-gray-400 border-2 border-gray-100 hover:bg-gray-50 transition-all uppercase tracking-widest text-sm">Zurück</button>
              <button disabled={!state.userImage} onClick={handleTryOn} className={`px-12 py-4 rounded-full font-black text-lg transition-all shadow-2xl ${state.userImage ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>PRO LOOK GENERIEREN ✨</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fadeIn max-w-5xl mx-auto">
            {state.isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="relative mb-12">
                   <div className="w-24 h-24 border-8 border-indigo-50 border-t-indigo-600 rounded-full animate-spin"></div>
                   <div className="absolute inset-0 flex items-center justify-center text-2xl">✨</div>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tight uppercase italic">Better Future Engine läuft...</h2>
                <div className="flex flex-col gap-2 max-w-sm">
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/2 animate-[loading_3s_ease-in-out_infinite]"></div>
                  </div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em]">Optimierung & Rendering</p>
                </div>
              </div>
            ) : state.error ? (
              <div className="bg-white border-2 border-red-100 rounded-[40px] p-12 text-center shadow-2xl">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-8">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h2 className="text-3xl font-black text-gray-900 mb-6 tracking-tight">UPS, ETWAS LIEF SCHIEF</h2>
                <p className="text-red-700 font-bold mb-10 max-w-md mx-auto leading-relaxed italic">"{state.error}"</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button onClick={handleTryOn} className="px-12 py-4 bg-indigo-600 text-white rounded-full font-black shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest">Retry</button>
                  <button onClick={reset} className="px-12 py-4 bg-gray-100 text-gray-600 rounded-full font-black hover:bg-gray-200 transition-all uppercase tracking-widest">Startseite</button>
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-12 items-start animate-scaleIn">
                <div className="space-y-8">
                  <div className="relative group rounded-[40px] overflow-hidden bg-white p-2 shadow-2xl">
                    <img src={state.resultImage!} alt="Ergebnis" className="w-full rounded-[34px] shadow-sm transition-transform duration-700 hover:scale-[1.02]" />
                    <div className="absolute top-8 left-8">
                       <span className="bg-black/80 backdrop-blur-xl text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl border border-white/20">PRO RENDERING</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-gray-100 flex flex-col min-h-full">
                  <div className="mb-10 pb-8 border-b border-gray-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-indigo-600 font-black uppercase tracking-[0.2em] text-[10px]">PREMIUM LOOK</span>
                        <h2 className="text-4xl font-black mt-2 leading-none tracking-tighter">{state.selectedProduct?.name}</h2>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-black text-gray-900 leading-none">€89.00</span>
                        <p className="text-[10px] font-bold text-emerald-500 uppercase mt-1">Sofort lieferbar</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-indigo-50 rounded-3xl p-8 mb-10 flex items-center justify-between border border-indigo-100">
                    <div className="flex items-center space-x-5">
                       <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-indigo-600 shadow-lg border-2 border-indigo-500">
                         {state.recommendedSize}
                       </div>
                       <div>
                         <p className="font-black text-indigo-900 text-xl tracking-tight">UNSERE EMPFEHLUNG</p>
                         <p className="text-indigo-600/70 font-bold text-sm uppercase tracking-widest">AI SIZE ENGINE</p>
                       </div>
                    </div>
                    <div className="text-indigo-600 animate-bounce">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  </div>

                  <div className="mb-10">
                    <p className="text-gray-500 leading-relaxed font-medium mb-8">
                      {state.selectedProduct?.description}
                    </p>
                    <div className="grid grid-cols-6 gap-2">
                       {AVAILABLE_SIZES.map(size => (
                         <button key={size} onClick={() => setState(prev => ({ ...prev, recommendedSize: size }))} className={`py-4 rounded-2xl font-black transition-all text-xs tracking-widest ${state.recommendedSize === size ? 'bg-indigo-600 text-white shadow-xl scale-105' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                           {size}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div className="mt-auto space-y-4">
                    <button onClick={() => window.open('https://superbeautiful.de', '_blank')} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-xl hover:bg-black transition-all shadow-2xl active:scale-[0.98] uppercase tracking-widest flex items-center justify-center space-x-3">
                      <span>ZUM WARENKORB</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                    <button onClick={reset} className="w-full text-gray-400 py-2 font-black hover:text-indigo-600 transition-colors uppercase tracking-[0.3em] text-[10px]">Anderes Set probieren</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-24 border-t border-gray-100 pt-12 pb-20 text-center">
        <div className="flex items-center justify-center space-x-2 mb-4">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <p className="text-gray-400 text-[10px] uppercase tracking-[0.4em] font-black">Better Future AI Engine v2.5 Pro</p>
        </div>
        <p className="text-gray-300 text-[8px] uppercase tracking-widest">© 2024 Superbeautiful GmbH • Alle Rechte vorbehalten</p>
      </footer>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-scaleIn {
          animation: scaleIn 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.8s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default App;
