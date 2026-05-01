import React, { useState, useEffect, useRef, useMemo } from 'react';[]
import { 
  Camera, Image as ImageIcon, Send, X, Check, AlertCircle, ChefHat, 
  Flame, Utensils, Info, History, Sparkles, ChevronDown, ChevronUp, 
  Plus, Trash2, Clock, Calendar, Zap, Coffee, ArrowRight, Loader2, 
  Target, Scale, PieChart, Activity, TrendingUp, HelpCircle, 
  Settings, Save, RefreshCw, Smartphone
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, query, onSnapshot, 
  serverTimestamp, deleteDoc, doc 
} from 'firebase/firestore';

/**
 * CONFIGURATION ET INITIALISATION FIREBASE
 * Respect strict des règles de sécurité et de structure de données.
 */
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * COMPOSANT PRINCIPAL : NUTRISCAN WEB PRO
 * Une application complète de suivi nutritionnel par IA.
 */
export default function App() {
  // --- ÉTATS D'AUTHENTIFICATION ---
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- ÉTATS DE L'INTERFACE (UI) ---
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'camera'
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAnalysisResult, setShowAnalysisResult] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // --- ÉTATS DES DONNÉES DU REPAS ---
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [portionSize, setPortionSize] = useState(1);
  const [mealType, setMealType] = useState('lunch');
  const [historyMeals, setHistoryMeals] = useState([]);

  // --- RÉFÉRENCES DOM ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  /**
   * INITIALISATION DE L'AUTHENTIFICATION (RULE 3)
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        setAuthLoading(true);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        showFeedback("Erreur de connexion : " + err.message, "error");
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  /**
   * SYNCHRONISATION FIRESTORE EN TEMPS RÉEL (RULE 1 & 2)
   */
  useEffect(() => {
    if (!user) return;

    // Chemin obligatoire : /artifacts/{appId}/users/{userId}/{collectionName}
    const mealsCollection = collection(db, 'artifacts', appId, 'users', user.uid, 'meals');
    
    const unsubscribe = onSnapshot(mealsCollection, (snapshot) => {
      const meals = [];
      snapshot.forEach((doc) => {
        meals.push({ id: doc.id, ...doc.data() });
      });
      
      // Tri par date en mémoire (évite les index complexes Firestore)
      meals.sort((a, b) => {
        const dateA = a.timestamp?.seconds || 0;
        const dateB = b.timestamp?.seconds || 0;
        return dateB - dateA;
      });
      
      setHistoryMeals(meals);
    }, (error) => {
      console.error("Erreur Firestore:", error);
      showFeedback("Impossible de charger l'historique", "error");
    });

    return () => unsubscribe();
  }, [user]);

  /**
   * CALCULS DES STATISTIQUES (MÉMOÏSÉS)
   */
  const stats = useMemo(() => {
    const totalCalories = historyMeals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
    const avgCalories = historyMeals.length > 0 ? (totalCalories / historyMeals.length).toFixed(0) : 0;
    const totalProtein = historyMeals.reduce((acc, m) => acc + (Number(m.protein) || 0), 0);
    return { totalCalories, avgCalories, totalProtein, count: historyMeals.length };
  }, [historyMeals]);

  /**
   * SYSTÈME DE FEEDBACK (SANS ALERT)
   */
  const showFeedback = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  /**
   * LOGIQUE CAMERA (NAVIGATEUR)
   */
  const handleStartCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      showFeedback("Accès caméra refusé ou non disponible.", "error");
      setShowCamera(false);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      const video = videoRef.current;
      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      setSelectedImage(dataUrl);
      handleStopCamera();
    }
  };

  const handleStopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  /**
   * ANALYSE PAR L'IA GEMINI
   */
  const analyzeMealWithGemini = async (text, base64Image) => {
    const apiKey = ""; // Fourni par l'environnement
    const model = "gemini-2.5-flash-preview-09-2025";
    
    const prompt = `En tant qu'expert nutritionnel, analyse ce repas : "${text}". 
    Si une image est fournie, base-toi principalement sur le visuel pour estimer les portions.
    Renvoie EXCLUSIVEMENT un objet JSON avec cette structure précise :
    {
      "name": "Nom du plat",
      "calories": 123,
      "protein": 12,
      "carbs": 45,
      "fat": 10,
      "description": "Brève description des ingrédients détectés"
    }`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          ...(base64Image ? [{ inlineData: { mimeType: "image/jpeg", data: base64Image.split(',')[1] } }] : [])
        ]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };

    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('API Error');
        
        const data = await response.json();
        const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(resultText);
      } catch (err) {
        retries++;
        if (retries === maxRetries) throw err;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  };

  const handleRunAnalysis = async () => {
    if (!inputText && !selectedImage) {
      showFeedback("Veuillez entrer du texte ou une photo.", "error");
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeMealWithGemini(inputText, selectedImage);
      setAnalysisResult(result);
      setShowAnalysisResult(true);
      showFeedback("Analyse réussie !");
    } catch (err) {
      showFeedback("L'analyse a échoué. Réessayez.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * ENREGISTREMENT DANS FIRESTORE
   */
  const saveMealWithDualWrite = async () => {
    if (!user || !analysisResult) return;
    
    setIsSaving(true);
    try {
      const collectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'meals');
      await addDoc(collectionRef, {
        ...analysisResult,
        calories: Math.round(analysisResult.calories * portionSize),
        protein: Math.round(analysisResult.protein * portionSize),
        carbs: Math.round(analysisResult.carbs * portionSize),
        fat: Math.round(analysisResult.fat * portionSize),
        portionSize,
        mealType,
        timestamp: localToUtcIso()
      });
      
      showFeedback("Repas enregistré avec succès !");
      resetForm();
    } catch (err) {
      showFeedback("Erreur lors de l'enregistrement.", "error");
    } finally {
      setIsSaving(false);
      setShowAnalysisResult(false);
    }
  };

  const handleDeleteMeal = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'meals', id));
      showFeedback("Entrée supprimée.");
    } catch (err) {
      showFeedback("Erreur de suppression.", "error");
    }
  };

  const resetForm = () => {
    setInputText('');
    setSelectedImage(null);
    setAnalysisResult(null);
    setPortionSize(1);
  };

  // --- RENDU UI ---

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin mx-auto text-orange-500" size={48} />
          <p className="font-bold text-slate-400 animate-pulse">Initialisation de NutriScan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-orange-100 pb-24">
      {/* NOTIFICATIONS VOLANTES */}
      {notification && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-10 duration-300 ${
          notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-green-400" />}
          <span className="font-bold text-sm">{notification.message}</span>
        </div>
      )}

      {/* HEADER PREMIUM */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-40 px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-orange-500 to-amber-400 p-2 rounded-2xl shadow-lg shadow-orange-200">
              <ChefHat size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">
                NUTRI<span className="text-orange-500">SCAN</span>
                <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">v2.0</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                <Smartphone size={10} /> Web Optimized
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className={`p-2.5 rounded-xl transition-all ${isHistoryOpen ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              <History size={20} />
            </button>
            <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-xl">
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase">Aujourd'hui</p>
                <p className="text-sm font-black text-slate-700">{stats.totalCalories} kcal</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-orange-500 shadow-sm">
                <Flame size={18} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLONNE GAUCHE : SAISIE (8 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all hover:shadow-2xl hover:shadow-slate-200/60">
            <div className="flex p-2 bg-slate-50/50">
              <button 
                onClick={() => setActiveTab('text')}
                className={`flex-1 py-3 rounded-2xl text-xs font-black tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'text' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
              >
                <Utensils size={16} /> TEXTE
              </button>
              <button 
                onClick={() => setActiveTab('camera')}
                className={`flex-1 py-3 rounded-2xl text-xs font-black tracking-widest flex items-center justify-center gap-2 transition-all ${activeTab === 'camera' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
              >
                <Camera size={16} /> APPAREIL PHOTO
              </button>
            </div>

            <div className="p-8">
              {activeTab === 'text' ? (
                <textarea
                  className="w-full h-40 text-xl font-medium bg-transparent border-none focus:ring-0 resize-none placeholder:text-slate-200"
                  placeholder="Décrivez votre repas... (ex: Un bowl de riz, saumon grillé et avocat)"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              ) : (
                <div className="space-y-4">
                  {selectedImage ? (
                    <div className="relative rounded-3xl overflow-hidden group aspect-video bg-slate-100">
                      <img src={selectedImage} alt="Repas" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button onClick={() => setSelectedImage(null)} className="p-4 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40 transition-all">
                          <X size={24} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onClick={handleStartCamera}
                      className="aspect-video border-4 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-slate-300 hover:text-orange-400 hover:border-orange-100 hover:bg-orange-50/30 cursor-pointer transition-all group"
                    >
                      <div className="p-6 bg-slate-50 rounded-full group-hover:scale-110 transition-transform">
                        <Camera size={48} />
                      </div>
                      <p className="font-black text-sm tracking-widest">CLIQUEZ POUR CAPTURER</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => fileInputRef.current.click()} className="flex-1 py-3 bg-slate-100 rounded-xl text-slate-500 text-[10px] font-black tracking-tighter hover:bg-slate-200 transition-all">
                      OUVRIR LA GALERIE
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setSelectedImage(reader.result);
                      reader.readAsDataURL(file);
                    }} />
                  </div>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t pt-8">
                <div className="flex -space-x-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="user" />
                    </div>
                  ))}
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center text-[10px] font-bold text-white">
                    +1k
                  </div>
                </div>

                <button
                  disabled={isAnalyzing || (!inputText && !selectedImage)}
                  onClick={handleRunAnalysis}
                  className="group relative bg-slate-900 disabled:bg-slate-200 text-white px-10 py-4 rounded-2xl font-black tracking-widest flex items-center gap-3 overflow-hidden transition-all active:scale-95 shadow-xl shadow-slate-200"
                >
                  {isAnalyzing ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                      ANALYSER AVEC L'IA
                    </>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
                </button>
              </div>
            </div>
          </section>

          {/* DASHBOARD STATS */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{stats.totalCalories}</span>
                <span className="text-[10px] font-bold text-slate-400">kcal</span>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Moyenne</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{stats.avgCalories}</span>
                <span className="text-[10px] font-bold text-slate-400">kcal</span>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Protéines</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{stats.totalProtein}</span>
                <span className="text-[10px] font-bold text-slate-400">g</span>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Repas</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800">{stats.count}</span>
                <span className="text-[10px] font-bold text-slate-400">enregistrés</span>
              </div>
            </div>
          </section>
        </div>

        {/* COLONNE DROITE : HISTORIQUE ET ASTUCES (4 cols) */}
        <aside className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-slate-300">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <TrendingUp size={20} className="text-orange-400" />
                </div>
                <h3 className="text-lg font-black tracking-tight">Objectif du jour</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calories</span>
                  <span className="text-xl font-black">{stats.totalCalories} / 2200 <span className="text-[10px] text-slate-500">kcal</span></span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-1000"
                    style={{ width: `${Math.min((stats.totalCalories / 2200) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl" />
          </div>

          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center gap-2">
                <History size={16} className="text-orange-500" /> Historique
              </h3>
              <button className="text-[10px] font-black text-orange-500 uppercase">Voir tout</button>
            </div>
            
            <div className="space-y-4">
              {historyMeals.slice(0, 5).map((meal) => (
                <div key={meal.id} className="group flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition-all">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                    <Utensils size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 truncate">{meal.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {meal.calories} kcal • {meal.mealType}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleDeleteMeal(meal.id)}
                    className="p-2 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {historyMeals.length === 0 && (
                <div className="py-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200">
                    <PieChart size={32} />
                  </div>
                  <p className="text-sm font-bold text-slate-300">Aucun repas aujourd'hui</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* MODAL CAMERA FULLSCREEN */}
      {showCamera && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
          <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-20">
            <button onClick={handleStopCamera} className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full text-white flex items-center justify-center">
              <X size={24} />
            </button>
            <div className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-[10px] font-black tracking-widest">
              MODE CAPTURE ALIMENTAIRE
            </div>
            <div className="w-12" />
          </div>

          <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          <div className="absolute bottom-0 inset-x-0 p-12 flex flex-col items-center gap-8 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white/60 text-xs font-bold text-center max-w-xs">
              Placez le repas au centre du cadre pour une analyse optimale des portions.
            </p>
            <button 
              onClick={handleCapture}
              className="w-24 h-24 bg-white rounded-full border-8 border-white/20 flex items-center justify-center active:scale-90 transition-transform shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full border-2 border-black/5" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE RÉSULTAT D'ANALYSE (OVERLAY) */}
      {showAnalysisResult && analysisResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10">
              <div className="flex justify-between items-start mb-8">
                <div className="bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2">
                  <Activity size={14} /> RAPPORT NUTRITIONNEL
                </div>
                <button onClick={() => setShowAnalysisResult(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="text-center mb-10">
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter mb-2">{analysisResult.name}</h2>
                <p className="text-slate-400 text-sm font-medium italic">"{analysisResult.description}"</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-orange-50/50 p-6 rounded-[2rem] border border-orange-100 flex flex-col items-center text-center">
                  <Flame size={20} className="text-orange-500 mb-2" />
                  <p className="text-3xl font-black text-orange-600">{Math.round(analysisResult.calories * portionSize)}</p>
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Calories</p>
                </div>
                <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 flex flex-col items-center text-center">
                  <Target size={20} className="text-blue-500 mb-2" />
                  <p className="text-3xl font-black text-blue-600">{Math.round(analysisResult.protein * portionSize)}g</p>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Protéines</p>
                </div>
                <div className="bg-yellow-50/50 p-6 rounded-[2rem] border border-yellow-100 flex flex-col items-center text-center">
                  <Utensils size={20} className="text-yellow-500 mb-2" />
                  <p className="text-3xl font-black text-yellow-600">{Math.round(analysisResult.carbs * portionSize)}g</p>
                  <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest">Glucides</p>
                </div>
                <div className="bg-purple-50/50 p-6 rounded-[2rem] border border-purple-100 flex flex-col items-center text-center">
                  <Scale size={20} className="text-purple-500 mb-2" />
                  <p className="text-3xl font-black text-purple-600">{Math.round(analysisResult.fat * portionSize)}g</p>
                  <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Lipides</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <PieChart size={18} className="text-slate-400" />
                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Portions</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <button 
                      onClick={() => setPortionSize(p => Math.max(0.5, p - 0.5))}
                      className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-black text-lg hover:border-orange-500 transition-colors shadow-sm"
                    >-</button>
                    <span className="text-xl font-black text-slate-800 w-8 text-center">{portionSize}</span>
                    <button 
                      onClick={() => setPortionSize(p => p + 0.5)}
                      className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-black text-lg hover:border-orange-500 transition-colors shadow-sm"
                    >+</button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {['Petit-dej', 'Déjeuner', 'Dîner', 'Snack'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setMealType(type.toLowerCase())}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${mealType === type.toLowerCase() ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-10 flex gap-4">
                <button 
                  onClick={() => setShowAnalysisResult(false)}
                  className="flex-1 py-5 font-black text-slate-400 text-xs tracking-widest hover:text-slate-600 transition-colors uppercase"
                >
                  Annuler
                </button>
                <button 
                  disabled={isSaving}
                  onClick={saveMealWithDualWrite}
                  className="flex-[2] py-5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 text-white rounded-2xl font-black text-xs tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-orange-100 transition-all active:scale-95"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  VALIDER LE REPAS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
