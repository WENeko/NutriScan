import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  StyleSheet,
  ActionSheetIOS,
  Modal,
  StatusBar,
  SafeAreaView,
  Pressable,
  Vibration,
  Easing
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { 
  Camera, 
  Image as ImageIcon, 
  Send, 
  X, 
  Check, 
  AlertCircle, 
  ChefHat, 
  Flame, 
  Utensils, 
  Info,
  History,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Maximize2,
  Clock,
  Calendar,
  Zap,
  Coffee,
  Moon,
  Sun,
  Search,
  Filter,
  ArrowRight,
  RotateCcw
} from 'lucide-react-native';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, doc, setDoc, query, where, onSnapshot, getDocs } from 'firebase/firestore';

// --- CONFIGURATION FIREBASE ---
// On récupère la config depuis les variables d'environnement fournies
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- CONSTANTES DE DESIGN ---
const { width, height } = Dimensions.get('window');
const COLORS = {
  primary: '#f97316',
  secondary: '#3b82f6',
  success: '#16a34a',
  danger: '#ef4444',
  warning: '#eab308',
  info: '#a855f7',
  bg: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  card: '#f9fafb'
};

/**
 * Helper: Conversion Date locale vers ISO UTC
 */
const localToUtcIso = (date = new Date()) => {
  return date.toISOString();
};

const MealInput = ({ onMealAdded, userProfile, theme = 'light' }) => {
  // --- ÉTATS DE NAVIGATION ET UI ---
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAnalysisResult, setShowAnalysisResult] = useState(false);
  const [activeTab, setActiveTab] = useState('text');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  // --- ÉTATS DES DONNÉES ---
  const [analysisResult, setAnalysisResult] = useState(null);
  const [user, setUser] = useState(null);
  const [historyMeals, setHistoryMeals] = useState([]);
  const [portionSize, setPortionSize] = useState(1);
  const [mealType, setMealType] = useState('lunch'); // lunch, dinner, breakfast, snack

  // --- RÉFÉRENCES D'ANIMATION (DÉTAILLÉES) ---
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  // --- LOGIQUE D'AUTHENTIFICATION (RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- ÉCOUTE DES REPAS EN TEMPS RÉEL (FIRESTORE) ---
  useEffect(() => {
    if (!user) return;

    // Chemin obligatoire : /artifacts/{appId}/users/{userId}/{collectionName}
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'meals'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meals = [];
      snapshot.forEach((doc) => {
        meals.push({ id: doc.id, ...doc.data() });
      });
      // Tri manuel en mémoire (Rule 2)
      meals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setHistoryMeals(meals);
    }, (error) => {
      console.error("Firestore listen error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- LOGIQUE CLAVIER ---
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // --- ANALYSE AVEC GEMINI ---
  const analyzeMealWithGemini = async (text, base64Image = null) => {
    const apiKey = ""; // Géré par l'environnement
    const model = "gemini-2.5-flash-preview-09-2025";
    
    const systemPrompt = `Tu es un nutritionniste expert. 
    Analyse le repas fourni (texte ou image). 
    Calcule les calories et les macronutriments (protéines, glucides, lipides) pour une portion standard.
    Réponds EXCLUSIVEMENT avec un objet JSON structuré :
    {
      "name": "Nom du plat",
      "calories": 450,
      "protein": 25,
      "carbs": 50,
      "fat": 15,
      "confidence": 0.95
    }`;
    
    const userPrompt = `Analyse ce repas : "${text}"`;

    const runFetch = async () => {
      const contents = [{
        parts: [{ text: userPrompt }]
      }];

      if (base64Image) {
        contents[0].parts.push({
          inlineData: { mimeType: "image/jpeg", data: base64Image }
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { 
              responseMimeType: "application/json",
              temperature: 0.1
            }
          })
        }
      );

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const data = await response.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    };

    // Backoff exponentiel (Rule: 5 retries)
    let attempt = 0;
    while (attempt < 5) {
      try {
        return await runFetch();
      } catch (err) {
        attempt++;
        if (attempt === 5) throw err;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  };

  // --- SAUVEGARDE DUAL WRITE (FIRESTORE + UI) ---
  const saveMeal = async (mealData) => {
    if (!user) {
      Alert.alert("Erreur", "Vous devez être connecté pour enregistrer.");
      return;
    }

    const payload = {
      ...mealData,
      timestamp: localToUtcIso(),
      portionSize,
      mealType,
      userId: user.uid
    };

    try {
      // Chemin : /artifacts/{appId}/users/{userId}/meals
      const collectionRef = collection(db, 'artifacts', appId, 'users', user.uid, 'meals');
      await addDoc(collectionRef, payload);
      
      if (onMealAdded) onMealAdded(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeResultModal();
    } catch (err) {
      console.error("Save failed:", err);
      Alert.alert("Erreur", "Impossible de sauvegarder le repas.");
    }
  };

  // --- GESTIONNAIRES D'ÉVÉNEMENTS ---
  const handleStartAnalysis = async () => {
    if (!inputText && !selectedImage) {
      Vibration.vibrate(50);
      return;
    }

    setIsAnalyzing(true);
    // Animation de rotation pour le bouton
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true
      })
    ).start();

    try {
      const b64 = selectedImage?.base64 || null;
      const result = await analyzeMealWithGemini(inputText, b64);
      setAnalysisResult(result);
      
      // Ouvrir le modal avec animation
      setShowAnalysisResult(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 7, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true })
      ]).start();
    } catch (err) {
      Alert.alert("Analyse échouée", "Le service d'IA est temporairement indisponible.");
    } finally {
      setIsAnalyzing(false);
      rotateAnim.setValue(0);
    }
  };

  const closeResultModal = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: height, duration: 300, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 300, useNativeDriver: true })
    ]).start(() => {
      setShowAnalysisResult(false);
      setAnalysisResult(null);
      setInputText('');
      setSelectedImage(null);
    });
  };

  const pickImage = async (useCamera = false) => {
    const options = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
      base64: true
    };

    let result;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  // --- RENDU DES SOUS-COMPOSANTS (POUR AUGMENTER LA CLARTÉ ET LE VOLUME) ---

  const renderHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>
          NUTRI<Text style={{ color: COLORS.primary }}>SCAN</Text>
        </Text>
        <Text style={styles.headerSubtitle}>Intelligence Nutritionnelle</Text>
      </View>
      <TouchableOpacity 
        onPress={() => setIsHistoryOpen(!isHistoryOpen)}
        style={styles.historyBtn}
      >
        <History size={24} color={COLORS.text} />
        {historyMeals.length > 0 && <View style={styles.badge} />}
      </TouchableOpacity>
    </View>
  );

  const renderInputSection = () => (
    <View style={styles.inputContainer}>
      <View style={styles.tabBar}>
        <TouchableOpacity 
          onPress={() => setActiveTab('text')}
          style={[styles.tab, activeTab === 'text' && styles.activeTab]}
        >
          <Utensils size={18} color={activeTab === 'text' ? COLORS.primary : COLORS.muted} />
          <Text style={[styles.tabText, activeTab === 'text' && styles.activeTabText]}>Description</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setActiveTab('camera')}
          style={[styles.tab, activeTab === 'camera' && styles.activeTab]}
        >
          <Camera size={18} color={activeTab === 'camera' ? COLORS.primary : COLORS.muted} />
          <Text style={[styles.tabText, activeTab === 'camera' && styles.activeTabText]}>Photo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainInputArea}>
        <TextInput
          style={styles.textInput}
          placeholder="J'ai mangé un poulet grillé avec du riz et des brocolis..."
          placeholderTextColor="#9ca3af"
          multiline
          value={inputText}
          onChangeText={setInputText}
          blurOnSubmit={false}
        />
        
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImgBtn} onPress={() => setSelectedImage(null)}>
              <X size={16} color="white" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <View style={styles.mediaBtns}>
          <TouchableOpacity style={styles.mediaBtn} onPress={() => pickImage(true)}>
            <Camera size={22} color={COLORS.muted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={() => pickImage(false)}>
            <ImageIcon size={22} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.analyzeBtn, (!inputText && !selectedImage) && styles.disabledBtn]}
          onPress={handleStartAnalysis}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.analyzeBtnText}>ANALYSER</Text>
              <Sparkles size={18} color="white" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHistory = () => {
    if (!isHistoryOpen) return null;
    return (
      <View style={styles.historyContainer}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Derniers Repas</Text>
          <TouchableOpacity onPress={() => setIsHistoryOpen(false)}>
            <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>Fermer</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 300 }}>
          {historyMeals.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Coffee size={40} color={COLORS.border} />
              <Text style={styles.emptyText}>Aucun historique pour le moment.</Text>
            </View>
          ) : (
            historyMeals.map((meal, index) => (
              <View key={meal.id || index} style={styles.historyItem}>
                <View style={styles.historyItemIcon}>
                  <ChefHat size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyItemName}>{meal.name}</Text>
                  <Text style={styles.historyItemMeta}>
                    {new Date(meal.timestamp).toLocaleTimeString([], { hour: '2h', minute: '2h' })} • {meal.calories} kcal
                  </Text>
                </View>
                <ChevronRight size={16} color={COLORS.muted} />
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  const renderResultModal = () => (
    <Modal transparent visible={showAnalysisResult} animationType="none">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalCloser} onPress={closeResultModal} />
        <Animated.View 
          style={[
            styles.modalContent,
            { 
              opacity: fadeAnim, 
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
            }
          ]}
        >
          <View style={styles.modalHandle} />
          
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.resultIconBox}>
                <ChefHat size={32} color={COLORS.primary} />
              </View>
              <Text style={styles.resultTitle}>{analysisResult?.name}</Text>
              <View style={styles.confidenceBadge}>
                <Check size={12} color={COLORS.success} />
                <Text style={styles.confidenceText}>IA VÉRIFIÉE</Text>
              </View>
            </View>

            <View style={styles.macroGrid}>
              <View style={[styles.macroCard, { backgroundColor: '#fff7ed' }]}>
                <Flame size={20} color={COLORS.primary} />
                <Text style={styles.macroValue}>{analysisResult?.calories}</Text>
                <Text style={styles.macroLabel}>CALORIES</Text>
              </View>
              <View style={[styles.macroCard, { backgroundColor: '#eff6ff' }]}>
                <Zap size={20} color={COLORS.secondary} />
                <Text style={styles.macroValue}>{analysisResult?.protein}g</Text>
                <Text style={styles.macroLabel}>PROTÉINES</Text>
              </View>
              <View style={[styles.macroCard, { backgroundColor: '#fefce8' }]}>
                <Utensils size={20} color={COLORS.warning} />
                <Text style={styles.macroValue}>{analysisResult?.carbs}g</Text>
                <Text style={styles.macroLabel}>GLUCIDES</Text>
              </View>
              <View style={[styles.macroCard, { backgroundColor: '#faf5ff' }]}>
                <Info size={20} color={COLORS.info} />
                <Text style={styles.macroValue}>{analysisResult?.fat}g</Text>
                <Text style={styles.macroLabel}>LIPIDES</Text>
              </View>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.sectionTitle}>Ajustements</Text>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Nombre de portions</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity onPress={() => setPortionSize(Math.max(0.5, portionSize - 0.5))} style={styles.stepBtn}>
                    <Text style={styles.stepBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{portionSize}</Text>
                  <TouchableOpacity onPress={() => setPortionSize(portionSize + 0.5)} style={styles.stepBtn}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeResultModal}>
                <Text style={styles.cancelBtnText}>IGNORER</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => saveMeal(analysisResult)}>
                <Text style={styles.confirmBtnText}>ENREGISTRER</Text>
                <ArrowRight size={20} color="white" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {renderHeader()}
          {renderInputSection()}
          {renderHistory()}
          
          <View style={styles.tipsSection}>
            <View style={styles.tipsCard}>
              <Sparkles size={24} color={COLORS.primary} />
              <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={styles.tipsTitle}>Astuce du jour</Text>
                <Text style={styles.tipsText}>Prenez une photo de votre assiette pour une analyse plus précise des portions.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {renderResultModal()}
    </SafeAreaView>
  );
};

// --- STYLES ÉTENDUS (DÉPLOIEMENT COMPLET DES LIGNES) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
  },
  historyBtn: {
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 16,
    position: 'relative',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'white',
  },
  inputContainer: {
    backgroundColor: 'white',
    borderRadius: 32,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: 'white',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    marginLeft: 8,
  },
  activeTabText: {
    color: COLORS.text,
  },
  mainInputArea: {
    padding: 16,
  },
  textInput: {
    fontSize: 18,
    color: COLORS.text,
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 26,
  },
  imagePreviewContainer: {
    marginTop: 15,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 200,
  },
  removeImgBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: 15,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f9fafb',
  },
  mediaBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaBtn: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 15,
  },
  analyzeBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 20,
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  disabledBtn: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
  },
  analyzeBtnText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  },
  historyContainer: {
    marginTop: 20,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyItemIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  historyItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  historyItemMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  emptyHistory: {
    alignItems: 'center',
    padding: 30,
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'end',
  },
  modalCloser: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 25,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#e5e7eb',
    borderRadius: 5,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 25,
  },
  resultIconBox: {
    backgroundColor: '#fff7ed',
    padding: 20,
    borderRadius: 30,
    marginBottom: 15,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
    marginLeft: 5,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  macroCard: {
    width: '48%',
    padding: 16,
    borderRadius: 24,
    alignItems: 'flex-start',
  },
  macroValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginVertical: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  settingsSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 15,
    color: COLORS.text,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 15,
    borderRadius: 20,
  },
  settingLabel: {
    fontWeight: '600',
    color: COLORS.muted,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  stepBtn: {
    backgroundColor: 'white',
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  stepValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 15,
    paddingBottom: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    fontWeight: '800',
    color: COLORS.muted,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtnText: {
    fontWeight: '800',
    color: 'white',
  },
  tipsSection: {
    marginTop: 40,
  },
  tipsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff7ed',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ffedd5',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9a3412',
    marginBottom: 4,
  },
  tipsText: {
    fontSize: 14,
    color: '#c2410c',
    lineHeight: 20,
  }
});

// Helper Icon non présent dans lucide initial
const ChevronRight = ({ size, color }) => (
  <ChevronDown size={size} color={color} style={{ transform: [{ rotate: '-90deg' }] }} />
);

export default MealInput;
