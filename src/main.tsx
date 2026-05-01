import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// DEBUG: Capturer les erreurs fatales pour l'écran blanc
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[FATAL ERROR]', e.error?.message || e.message, e.error?.stack);
    // Afficher visuellement l'erreur sur l'écran blanc
    const root = document.getElementById('root');
    if (root && root.children.length === 0) {
      root.innerHTML = `<div style="padding:20px;color:red;font-family:monospace;">
        <h2>Erreur de démarrage</h2>
        <pre>${e.error?.message || e.message}</pre>
        <pre>${e.error?.stack || 'No stack trace'}</pre>
      </div>`;
    }
  });
  
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[UNHANDLED PROMISE]', e.reason);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
