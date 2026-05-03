/**
 * Service de logging applicatif avec affichage UI et export
 * Pour debugging en mode APK sans accès console
 */

import { toast } from "@/hooks/use-toast";

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  module: string;
  message: string;
  details?: any;
}

const MAX_LOGS = 500;
const STORAGE_KEY = 'nutriscan_app_logs';

class AppLogger {
  private logs: LogEntry[] = [];
  private showErrorsInUI: boolean = true;

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[AppLogger] Erreur chargement logs:', e);
    }
  }

  private saveLogs() {
    try {
      // Garder uniquement les derniers logs
      if (this.logs.length > MAX_LOGS) {
        this.logs = this.logs.slice(-MAX_LOGS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('[AppLogger] Erreur sauvegarde logs:', e);
    }
  }

  private addLog(level: LogEntry['level'], module: string, message: string, details?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      details: details ? this.serializeDetails(details) : undefined
    };

    this.logs.push(entry);
    this.saveLogs();

    // Afficher les erreurs importantes dans l'UI
    if (level === 'error' && this.showErrorsInUI) {
      this.showErrorToast(module, message);
    }

    // Garder aussi en console pour le dev local
    const consoleMethod = level === 'error' ? console.error : 
                         level === 'warn' ? console.warn : 
                         level === 'debug' ? console.debug : console.log;
    consoleMethod(`[${module}] ${message}`, details || '');
  }

  private serializeDetails(details: any): any {
    try {
      // Éviter les circular references
      return JSON.parse(JSON.stringify(details, (key, value) => {
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        return value;
      }));
    } catch {
      return String(details);
    }
  }

  private showErrorToast(module: string, message: string) {
    // Ne pas spammer l'UI - limiter les toasts
    const recentErrors = this.logs
      .filter(l => l.level === 'error' && Date.now() - new Date(l.timestamp).getTime() < 5000)
      .length;
    
    if (recentErrors <= 3) {
      toast({
        title: `Erreur ${module}`,
        description: message.length > 100 ? message.substring(0, 100) + '...' : message,
        variant: "destructive",
        duration: 5000
      });
    }
  }

  info(module: string, message: string, details?: any) {
    this.addLog('info', module, message, details);
  }

  warn(module: string, message: string, details?: any) {
    this.addLog('warn', module, message, details);
  }

  error(module: string, message: string, details?: any) {
    this.addLog('error', module, message, details);
  }

  debug(module: string, message: string, details?: any) {
    this.addLog('debug', module, message, details);
  }

  // Export des logs pour debugging
  exportLogs(): string {
    const header = `=== NutriScan Logs Export ===\n`;
    const deviceInfo = `Appareil: ${navigator.userAgent}\n`;
    const timeInfo = `Export: ${new Date().toISOString()}\n\n`;
    
    const logsText = this.logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const details = log.details ? `\n  Details: ${JSON.stringify(log.details, null, 2)}` : '';
      return `[${time}] [${log.level.toUpperCase()}] [${log.module}] ${log.message}${details}`;
    }).join('\n\n');

    return header + deviceInfo + timeInfo + logsText;
  }

  downloadLogs() {
    const content = this.exportLogs();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutriscan-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Logs exportés",
      description: "Le fichier de logs a été téléchargé",
      duration: 3000
    });
  }

  getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter(l => l.level === level);
    }
    return [...this.logs];
  }

  getLastErrors(count: number = 10): LogEntry[] {
    return this.logs
      .filter(l => l.level === 'error')
      .slice(-count);
  }

  clear() {
    this.logs = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Singleton
export const appLogger = new AppLogger();

// Fonctions helper pour usage rapide
export const logInfo = (module: string, message: string, details?: any) => 
  appLogger.info(module, message, details);

export const logWarn = (module: string, message: string, details?: any) => 
  appLogger.warn(module, message, details);

export const logError = (module: string, message: string, details?: any) => 
  appLogger.error(module, message, details);

export const logDebug = (module: string, message: string, details?: any) => 
  appLogger.debug(module, message, details);
