import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Lock, Loader2, Eye, EyeOff, Shield } from "lucide-react";
import { SiFacebook, SiWhatsapp } from "react-icons/si";

export default function Landing() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the admin password");
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await login(password);
    if (!result.success) {
      setError(result.error || "Invalid password");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 lg:p-12 flex flex-col justify-between text-white relative overflow-hidden" data-testid="landing-left">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-blue-300 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-indigo-300 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <Bot className="h-7 w-7" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Messenger AI Bot</span>
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold leading-tight mb-6" data-testid="text-landing-headline">
            Smart AI Responses
            <br />
            <span className="text-blue-200">Across All Platforms</span>
          </h1>
          <p className="text-blue-100 text-lg mb-10 max-w-md leading-relaxed">
            Automate your customer conversations with intelligent AI responses across Facebook Messenger and WhatsApp.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="rounded-lg bg-white/20 p-2">
                <SiFacebook className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Facebook Pages</p>
                <p className="text-xs text-blue-200">Up to 15 pages</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="rounded-lg bg-white/20 p-2">
                <SiWhatsapp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">WhatsApp</p>
                <p className="text-xs text-blue-200">Pairing code link</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="rounded-lg bg-white/20 p-2">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">AI Models</p>
                <p className="text-xs text-blue-200">OpenRouter powered</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="rounded-lg bg-white/20 p-2">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Secure</p>
                <p className="text-xs text-blue-200">Password protected</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-blue-200/60 text-xs mt-8 relative z-10">&copy; {new Date().getFullYear()} Messenger AI Bot. All rights reserved.</p>
      </div>

      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-12 bg-background" data-testid="landing-right">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 p-3 mb-2">
              <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold" data-testid="text-welcome">Admin Access</h2>
            <p className="text-muted-foreground text-sm">Enter your password to access the dashboard</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="pr-10 h-12 text-base"
                  autoFocus
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && (
                <p className="text-sm text-red-500 flex items-center gap-1.5" data-testid="text-login-error">
                  <Shield className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white h-12 text-base font-semibold shadow-lg shadow-blue-500/25"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in...</>
              ) : (
                <><Lock className="mr-2 h-5 w-5" />Sign In</>
              )}
            </Button>
          </form>
          <p className="text-xs text-center text-muted-foreground">
            This dashboard is private and password-protected.
          </p>
        </div>
      </div>
    </div>
  );
}
