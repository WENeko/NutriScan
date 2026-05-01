import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Leaf, Mail, Lock, ArrowRight } from "lucide-react";

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Connexion réussie !" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Inscription réussie !",
          description: "Vérifiez votre email pour confirmer votre compte.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl nutri-gradient flex items-center justify-center shadow-float">
            <Leaf className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold nutri-gradient-text">
            NutriScan
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Analysez vos repas par IA, atteignez vos objectifs
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 rounded-xl"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12 rounded-xl"
                required
                minLength={6}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl nutri-gradient text-primary-foreground font-semibold text-base shadow-float hover:opacity-90 transition-opacity"
          >
            {loading ? "Chargement..." : isLogin ? "Se connecter" : "S'inscrire"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-primary hover:underline font-medium"
          >
            {isLogin ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
