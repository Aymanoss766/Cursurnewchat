import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bot, Lock, Loader2, Eye, EyeOff, Shield, Mail, User, ArrowRight,
  ArrowLeft, CheckCircle2, Sparkles, Zap, Globe, MessageSquare
} from "lucide-react";
import { SiFacebook, SiWhatsapp } from "react-icons/si";

type AuthMode = "choose" | "admin" | "user-login" | "user-register" | "verify-email";

export default function Landing() {
  const { login, loginUser, register, verifyEmail, resendCode } = useAuth();
  const [mode, setMode] = useState<AuthMode>("choose");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) { setError("Please enter the admin password"); return; }
    setIsLoading(true); setError(null);
    const result = await login(password);
    if (!result.success) setError(result.error || "Invalid password");
    setIsLoading(false);
  };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !userPassword.trim()) { setError("Please fill in all fields"); return; }
    setIsLoading(true); setError(null);
    const result = await loginUser(email, userPassword);
    if (!result.success) {
      if (result.requiresVerification) {
        setPendingEmail(email);
        setMode("verify-email");
      } else {
        setError(result.error || "Login failed");
      }
    }
    setIsLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !userPassword.trim()) { setError("Please fill in all fields"); return; }
    setIsLoading(true); setError(null);
    const result = await register(email, userPassword, userName);
    if (result.success && result.requiresVerification) {
      setPendingEmail(email);
      setDevCode(result.devCode ?? null);
      setMode("verify-email");
    } else if (!result.success) {
      setError(result.error || "Registration failed");
    }
    setIsLoading(false);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) { setError("Please enter the verification code"); return; }
    setIsLoading(true); setError(null);
    const result = await verifyEmail(pendingEmail, verifyCode);
    if (!result.success) setError(result.error || "Verification failed");
    setIsLoading(false);
  };

  const handleResend = async () => {
    setIsLoading(true); setError(null);
    const result = await resendCode(pendingEmail);
    if (!result.success) setError(result.error || "Failed to resend code");
    else {
      setError(null);
      if (result.devCode) setDevCode(result.devCode);
    }
    setIsLoading(false);
  };

  const resetForm = () => {
    setPassword(""); setEmail(""); setUserPassword(""); setUserName("");
    setVerifyCode(""); setError(null); setShowPassword(false); setDevCode(null);
  };

  const switchMode = (newMode: AuthMode) => {
    resetForm();
    setMode(newMode);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - Branding */}
      <div className="lg:w-[55%] bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700 p-8 lg:p-16 flex flex-col justify-between text-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] bg-purple-400/10 rounded-full blur-3xl" />
          <div className="absolute top-[40%] left-[60%] w-[25%] h-[25%] bg-blue-300/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
        </div>

        <div className="relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-12">
              <div className="rounded-2xl bg-white/15 backdrop-blur-md p-3.5 border border-white/20 shadow-lg">
                <Bot className="h-7 w-7" />
              </div>
              <span className="text-2xl font-bold tracking-tight">Messenger AI Bot</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-[1.1] mb-6 tracking-tight">
              Intelligent
              <br />
              <span className="bg-gradient-to-r from-blue-200 via-purple-200 to-pink-200 bg-clip-text text-transparent">
                AI Chatbot
              </span>
              <br />
              Platform
            </h1>
            <p className="text-blue-100/80 text-lg mb-12 max-w-lg leading-relaxed">
              Automate your customer conversations with AI-powered responses across Facebook Messenger and WhatsApp — all from one dashboard.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="grid grid-cols-2 gap-3"
          >
            {[
              { icon: SiFacebook, label: "Facebook Pages", desc: "Up to 15 pages" },
              { icon: SiWhatsapp, label: "WhatsApp", desc: "QR-free pairing" },
              { icon: Sparkles, label: "AI Models", desc: "OpenRouter powered" },
              { icon: Globe, label: "Multi-user", desc: "Team access" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 bg-white/[0.07] backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:bg-white/[0.12] transition-all duration-300"
              >
                <div className="rounded-xl bg-white/15 p-2.5 shrink-0">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-[11px] text-blue-200/70">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          className="relative z-10 flex items-center gap-6 mt-12"
        >
          <div className="flex items-center gap-2 text-blue-200/50 text-xs">
            <Zap className="h-3 w-3" />
            <span>Fast & Reliable</span>
          </div>
          <div className="flex items-center gap-2 text-blue-200/50 text-xs">
            <Shield className="h-3 w-3" />
            <span>Secure</span>
          </div>
          <div className="flex items-center gap-2 text-blue-200/50 text-xs">
            <MessageSquare className="h-3 w-3" />
            <span>24/7 Active</span>
          </div>
        </motion.div>
      </div>

      {/* Right panel - Auth */}
      <div className="lg:w-[45%] flex items-center justify-center p-8 lg:p-12 bg-gradient-to-b from-background to-muted/30 min-h-[60vh] lg:min-h-screen">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {mode === "choose" && (
              <motion.div key="choose" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="text-center mb-10">
                  <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                    className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 p-4 mb-4 shadow-lg shadow-indigo-500/10"
                  >
                    <Bot className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                  </motion.div>
                  <h2 className="text-3xl font-bold tracking-tight">Welcome</h2>
                  <p className="text-muted-foreground text-sm mt-2">Choose how you'd like to continue</p>
                </div>
                <div className="space-y-3">
                  <Button onClick={() => switchMode("admin")} variant="outline" size="lg"
                    className="w-full h-16 justify-between text-left px-6 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-indigo-100 dark:bg-indigo-900/40 p-2 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/40 transition-colors">
                        <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Admin Access</p>
                        <p className="text-xs text-muted-foreground">Login with admin password</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-indigo-500 transition-colors" />
                  </Button>

                  <Button onClick={() => switchMode("user-login")} variant="outline" size="lg"
                    className="w-full h-16 justify-between text-left px-6 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-blue-100 dark:bg-blue-900/40 p-2 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                        <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">User Login</p>
                        <p className="text-xs text-muted-foreground">Sign in with email</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                  </Button>

                  <Button onClick={() => switchMode("user-register")} size="lg"
                    className="w-full h-16 justify-between text-left px-6 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/25"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white/20 p-2">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Create Account</p>
                        <p className="text-xs text-white/70">Sign up with email verification</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {mode === "admin" && (
              <motion.div key="admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <button onClick={() => switchMode("choose")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 p-4 mb-3">
                    <Lock className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Admin Access</h2>
                  <p className="text-muted-foreground text-sm mt-1">Enter your admin password</p>
                </div>
                <form onSubmit={handleAdminLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="admin-pw" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Input id="admin-pw" type={showPassword ? "text" : "password"} placeholder="Enter admin password"
                        value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        className="pr-10 h-12 text-base" autoFocus />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{error}</p>}
                  </div>
                  <Button type="submit" size="lg" disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-lg shadow-indigo-500/25">
                    {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in...</> : <><Lock className="mr-2 h-5 w-5" />Sign In</>}
                  </Button>
                </form>
              </motion.div>
            )}

            {mode === "user-login" && (
              <motion.div key="user-login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <button onClick={() => switchMode("choose")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/40 p-4 mb-3">
                    <User className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold">User Login</h2>
                  <p className="text-muted-foreground text-sm mt-1">Sign in with your email and password</p>
                </div>
                <form onSubmit={handleUserLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="login-email" type="email" placeholder="you@example.com"
                        value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        className="pl-10 h-12" autoFocus />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-pw" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="login-pw" type={showPassword ? "text" : "password"} placeholder="Enter password"
                        value={userPassword} onChange={(e) => { setUserPassword(e.target.value); setError(null); }}
                        className="pl-10 pr-10 h-12" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{error}</p>}
                  </div>
                  <Button type="submit" size="lg" disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25">
                    {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Signing in...</> : <><ArrowRight className="mr-2 h-5 w-5" />Sign In</>}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button type="button" onClick={() => switchMode("user-register")} className="text-blue-600 hover:text-blue-700 font-medium">Create one</button>
                  </p>
                </form>
              </motion.div>
            )}

            {mode === "user-register" && (
              <motion.div key="user-register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <button onClick={() => switchMode("choose")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 p-4 mb-3">
                    <Sparkles className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Create Account</h2>
                  <p className="text-muted-foreground text-sm mt-1">Sign up to manage your AI chatbot</p>
                </div>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name" className="text-sm font-medium">Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="reg-name" type="text" placeholder="Your name"
                        value={userName} onChange={(e) => setUserName(e.target.value)}
                        className="pl-10 h-12" autoFocus />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="reg-email" type="email" placeholder="you@example.com"
                        value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        className="pl-10 h-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-pw" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="reg-pw" type={showPassword ? "text" : "password"} placeholder="Min. 6 characters"
                        value={userPassword} onChange={(e) => { setUserPassword(e.target.value); setError(null); }}
                        className="pl-10 pr-10 h-12" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {error && <p className="text-sm text-red-500 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />{error}</p>}
                  </div>
                  <Button type="submit" size="lg" disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold shadow-lg shadow-indigo-500/25">
                    {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Creating account...</> : <><Sparkles className="mr-2 h-5 w-5" />Create Account</>}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button type="button" onClick={() => switchMode("user-login")} className="text-blue-600 hover:text-blue-700 font-medium">Sign in</button>
                  </p>
                </form>
              </motion.div>
            )}

            {mode === "verify-email" && (
              <motion.div key="verify-email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="text-center mb-8">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                    className="inline-flex items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/40 p-4 mb-3"
                  >
                    <Mail className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </motion.div>
                  <h2 className="text-2xl font-bold">Verify Your Email</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {devCode ? (
                      <>Email not configured. Your verification code:</>
                    ) : (
                      <>We sent a 6-digit code to <span className="font-medium text-foreground">{pendingEmail}</span></>
                    )}
                  </p>
                  {devCode && (
                    <p className="mt-3 text-2xl font-mono font-bold text-green-600 dark:text-green-400 tracking-widest">
                      {devCode}
                    </p>
                  )}
                </div>
                <form onSubmit={handleVerify} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="verify-code" className="text-sm font-medium">Verification Code</Label>
                    <Input id="verify-code" type="text" placeholder="123456" maxLength={6}
                      value={verifyCode} onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                      className="h-14 text-center text-2xl font-mono tracking-[0.5em]" autoFocus />
                    {error && <p className="text-sm text-red-500 flex items-center justify-center gap-1.5"><Shield className="h-3.5 w-3.5" />{error}</p>}
                  </div>
                  <Button type="submit" size="lg" disabled={isLoading || verifyCode.length !== 6}
                    className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-green-500/25">
                    {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Verifying...</> : <><CheckCircle2 className="mr-2 h-5 w-5" />Verify Email</>}
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={handleResend} disabled={isLoading}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      Didn't receive the code? <span className="text-blue-600 font-medium">Resend</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[11px] text-center text-muted-foreground/50 mt-10">
            &copy; {new Date().getFullYear()} Messenger AI Bot. All data is encrypted and stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
