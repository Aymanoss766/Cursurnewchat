import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Bot, CheckCircle2, XCircle, Copy, Link, Shield, Key, Settings,
  Sparkles, ImageIcon, Loader2, Zap, Globe, Cpu, Lock, ShieldCheck,
  AlertTriangle, Eye, EyeOff, Plus, Trash2, FileText, Hash, Phone,
  MessageSquare, Unplug, RefreshCw, Timer, ClipboardCopy, RotateCw,
  LogOut, Activity, ChevronDown, ChevronUp,
} from "lucide-react";
import { SiFacebook, SiWhatsapp } from "react-icons/si";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";

type StatusResponse = {
  verifyToken: boolean;
  pageAccessToken: boolean;
  pagesCount: number;
  openRouterApiKey: boolean;
  openRouterModel: string | null;
  imageConfigured: boolean;
  whatsappConnected: boolean;
  whatsappStatus: string;
  role?: string;
  userName?: string;
};

type WhatsAppStatusResponse = {
  status: string;
  phoneNumber: string | null;
  pairingCode: string | null;
  errorMessage: string | null;
  connectedAt: string | null;
  connectedName: string | null;
};

type ConfigResponse = {
  openRouterApiKey: string | null;
  openRouterModel: string | null;
  imageApiKey: string | null;
  imageApiUrl: string | null;
  imageModel: string | null;
  verifyToken: string | null;
  pagesCount: number;
};

type PageInfo = {
  id: string;
  name: string;
  facebookPageId: string;
  accessToken: string;
  addedAt: string;
};

function StatusCard({ title, icon: Icon, configured, label, color }: {
  title: string; icon: any; configured: boolean; label?: string; color: string;
}) {
  const colorMap: Record<string, { bg: string; iconBg: string; border: string }> = {
    indigo: { bg: "from-indigo-500/10 to-indigo-500/5", iconBg: "bg-indigo-100 dark:bg-indigo-900/40", border: "border-indigo-200 dark:border-indigo-800" },
    blue: { bg: "from-blue-500/10 to-blue-500/5", iconBg: "bg-blue-100 dark:bg-blue-900/40", border: "border-blue-200 dark:border-blue-800" },
    purple: { bg: "from-purple-500/10 to-purple-500/5", iconBg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-200 dark:border-purple-800" },
    green: { bg: "from-green-500/10 to-green-500/5", iconBg: "bg-green-100 dark:bg-green-900/40", border: "border-green-200 dark:border-green-800" },
  };
  const c = colorMap[color] || colorMap.indigo;

  return (
    <Card className={`overflow-hidden border ${c.border} bg-gradient-to-br ${c.bg} hover:shadow-lg transition-all duration-300`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`rounded-xl ${c.iconBg} p-2.5`}>
            <Icon className="h-5 w-5 text-current" />
          </div>
          {configured ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 text-[11px] font-medium">
              <CheckCircle2 className="mr-1 h-3 w-3" />{label || "Active"}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400 text-[11px] font-medium">
              <XCircle className="mr-1 h-3 w-3" />Required
            </Badge>
          )}
        </div>
        <h3 className="text-sm font-semibold">{title}</h3>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { logout, role } = useAuth();

  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageApiUrl, setImageApiUrl] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [newPageToken, setNewPageToken] = useState("");
  const [newPageName, setNewPageName] = useState("");
  const [showNewPageToken, setShowNewPageToken] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [modelOptions, setModelOptions] = useState<{id: string, name: string}[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [waPhoneNumber, setWaPhoneNumber] = useState("");
  const [savedPairingCode, setSavedPairingCode] = useState<string | null>(null);
  const [pairingCodeExpiry, setPairingCodeExpiry] = useState<number | null>(null);
  const [pairingTimeLeft, setPairingTimeLeft] = useState<string>("");

  const { data: status, isLoading: statusLoading } = useQuery<StatusResponse>({ queryKey: ["/api/status"] });
  const { data: config, isLoading: configLoading } = useQuery<ConfigResponse>({ queryKey: ["/api/config"] });
  const { data: pages, isLoading: pagesLoading } = useQuery<PageInfo[]>({ queryKey: ["/api/pages"] });
  const { data: waStatus } = useQuery<WhatsAppStatusResponse>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "connecting" || data?.status === "waiting_for_pairing") return 3000;
      return 15000;
    },
  });

  const PAIRING_CODE_TTL = 10 * 60 * 1000;

  const waConnectMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string }) => { const res = await apiRequest("POST", "/api/whatsapp/connect", data); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "WhatsApp Connecting", description: data.message });
      if (data.pairingCode) { setSavedPairingCode(data.pairingCode); setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL); }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => { toast({ title: "Connection Failed", description: error.message, variant: "destructive" }); },
  });

  const waDisconnectMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/whatsapp/disconnect"); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Disconnected", description: data.message });
      setWaPhoneNumber(""); setSavedPairingCode(null); setPairingCodeExpiry(null);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => { toast({ title: "Disconnect Failed", description: error.message, variant: "destructive" }); },
  });

  const waVerifyMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/whatsapp/verify"); return res.json(); },
    onSuccess: (data) => {
      if (data.verified) toast({ title: "Connected!", description: `WhatsApp active as ${data.connectedName || "your number"}.` });
      else toast({ title: "Not Connected Yet", description: data.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => { toast({ title: "Verification Failed", description: error.message, variant: "destructive" }); },
  });

  useEffect(() => {
    if (waStatus?.pairingCode && !savedPairingCode) {
      setSavedPairingCode(waStatus.pairingCode);
      if (!pairingCodeExpiry) setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL);
    }
    if (waStatus?.status === "connected" || waStatus?.status === "disconnected") {
      setSavedPairingCode(null); setPairingCodeExpiry(null);
    }
  }, [waStatus?.pairingCode, waStatus?.status]);

  useEffect(() => {
    if (!pairingCodeExpiry) { setPairingTimeLeft(""); return; }
    const tick = () => {
      const remaining = pairingCodeExpiry - Date.now();
      if (remaining <= 0) { setSavedPairingCode(null); setPairingCodeExpiry(null); setPairingTimeLeft(""); return; }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setPairingTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pairingCodeExpiry]);

  const waRecreateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/whatsapp/disconnect");
      const phone = waStatus?.phoneNumber || waPhoneNumber.replace(/[^0-9]/g, "");
      if (!phone) throw new Error("No phone number available");
      const res = await apiRequest("POST", "/api/whatsapp/connect", { phoneNumber: phone });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.pairingCode) {
        setSavedPairingCode(data.pairingCode); setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL);
        toast({ title: "New Pairing Code", description: "A new code has been generated." });
      } else { toast({ title: "Reconnecting", description: data.message || "Reconnecting..." }); }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) setShowModelDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchModels = useCallback(async (key?: string) => {
    const apiKeyToUse = key || aiApiKey.trim();
    if (!apiKeyToUse) return;
    setModelsLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/models", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKeyToUse }) });
      if (res.ok) { const data = await res.json(); setModelOptions(data); }
    } catch {} finally { setModelsLoading(false); }
  }, [aiApiKey]);

  const copyPairingCode = useCallback(() => {
    if (savedPairingCode) {
      navigator.clipboard.writeText(savedPairingCode).then(() => {
        toast({ title: "Copied!", description: "Pairing code copied." });
      }).catch(() => { toast({ title: "Copy Failed", variant: "destructive" }); });
    }
  }, [savedPairingCode, toast]);

  const aiMutation = useMutation({
    mutationFn: async (data: { apiKey: string; model: string }) => { const res = await apiRequest("POST", "/api/config/ai", data); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "AI Model Activated", description: `Model "${data.openRouterModel}" active.` });
      setAiApiKey(""); setAiModel(""); setModelSearchQuery(""); setModelOptions([]);
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  const imageMutation = useMutation({
    mutationFn: async (data: { apiKey: string; apiUrl: string; model: string }) => { const res = await apiRequest("POST", "/api/config/image", data); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Image Config Saved", description: `Saved${data.imageModel ? ` for "${data.imageModel}"` : ""}.` });
      setImageApiKey(""); setImageApiUrl(""); setImageModel("");
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  const verifyTokenMutation = useMutation({
    mutationFn: async (data: { token: string }) => { const res = await apiRequest("POST", "/api/config/verify-token", data); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Verify Token Updated", description: `Token ending in ${data.verifyToken} active.` });
      setVerifyToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  const addPageMutation = useMutation({
    mutationFn: async (data: { token: string; name: string }) => { const res = await apiRequest("POST", "/api/pages", data); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Page Connected", description: data.message });
      setNewPageToken(""); setNewPageName(""); setShowAddPage(false);
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  const removePageMutation = useMutation({
    mutationFn: async (id: string) => { const res = await apiRequest("DELETE", `/api/pages/${id}`); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Page Removed", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
    },
    onError: (error: Error) => { toast({ title: "Failed", description: error.message, variant: "destructive" }); },
  });

  const webhookUrl = window.location.origin + "/webhook";
  const pagesCount = pages?.length ?? 0;
  const maxPages = 15;
  const allConfigured = status ? status.verifyToken && status.pageAccessToken && status.openRouterApiKey : false;
  const someConfigured = status ? status.verifyToken || status.pageAccessToken || status.openRouterApiKey : false;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      toast({ title: "Copied", description: "Webhook URL copied." });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-background to-slate-50/50 dark:from-gray-950 dark:via-background dark:to-gray-950/50">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600" />
          <div className="absolute inset-0">
            <div className="absolute top-0 left-[20%] w-[300px] h-[300px] bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-[10%] w-[400px] h-[400px] bg-purple-400/10 rounded-full blur-3xl" />
          </div>
          <div className="relative px-6 py-8 lg:py-10">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-lg">
                    {role === "admin" ? <Shield className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white/90 tracking-wide uppercase block leading-tight">
                      {role === "admin" ? "Admin Panel" : "Dashboard"}
                    </span>
                    {status?.userName && (
                      <span className="text-[11px] text-white/50">{status.userName}</span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => logout()}
                  className="text-white/70 hover:text-white hover:bg-white/15 rounded-xl border border-white/10">
                  <LogOut className="mr-1.5 h-4 w-4" />Logout
                </Button>
              </div>

              <div className="flex items-center gap-5 flex-wrap">
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                  className="rounded-2xl bg-white/10 backdrop-blur-md p-4 border border-white/15 shadow-xl"
                >
                  <Bot className="h-9 w-9 text-white" />
                </motion.div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">Messenger AI Bot</h1>
                  <p className="mt-1 text-white/60 text-sm flex items-center gap-3 flex-wrap">
                    {status?.openRouterModel ? <span className="flex items-center gap-1.5"><Cpu className="h-3 w-3" />{status.openRouterModel}</span> : "AI Powered Chatbot"}
                    {!statusLoading && (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold backdrop-blur-sm ${
                        allConfigured ? "bg-green-400/20 text-green-200 border border-green-400/30" :
                        someConfigured ? "bg-amber-400/20 text-amber-200 border border-amber-400/30" :
                        "bg-red-400/20 text-red-200 border border-red-400/30"
                      }`}>
                        <Activity className="h-3 w-3" />
                        {allConfigured ? "All Systems Ready" : someConfigured ? "Partial Setup" : "Setup Required"}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {status && (status.pagesCount > 0 || status.whatsappConnected) && (
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  {status.pagesCount > 0 && (
                    <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/90 text-xs font-medium px-3.5 py-1.5 rounded-full border border-white/10">
                      <SiFacebook className="h-3.5 w-3.5" />{status.pagesCount} {status.pagesCount === 1 ? "Page" : "Pages"}
                    </span>
                  )}
                  {status.whatsappConnected && (
                    <span className="inline-flex items-center gap-2 bg-green-400/15 text-green-200 text-xs font-medium px-3.5 py-1.5 rounded-full border border-green-400/20">
                      <SiWhatsapp className="h-3.5 w-3.5" />WhatsApp Active
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Status Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Configuration Status</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statusLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardContent className="pt-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
              ))
            ) : (
              <>
                <StatusCard title="Verify Token" icon={Shield} configured={status?.verifyToken ?? false} color="indigo" />
                <StatusCard title="Facebook Pages" icon={SiFacebook} configured={status?.pageAccessToken ?? false}
                  label={status?.pagesCount ? `${status.pagesCount} Pages` : undefined} color="blue" />
                <StatusCard title="OpenRouter API" icon={Settings} configured={status?.openRouterApiKey ?? false} color="purple" />
                <StatusCard title="WhatsApp" icon={SiWhatsapp} configured={status?.whatsappConnected ?? false}
                  label={status?.whatsappConnected ? "Connected" : undefined} color="green" />
              </>
            )}
          </div>
        </motion.div>

        {/* Webhook URL */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
          <Card className="border-0 bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-900/50 dark:to-blue-950/20 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-xl bg-blue-100 dark:bg-blue-900/40 p-2"><Link className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
                <div>
                  <h3 className="text-sm font-bold">Webhook URL</h3>
                  <p className="text-[11px] text-muted-foreground">Use this as your Facebook Webhook callback URL</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl bg-white dark:bg-gray-900 border px-4 py-3 text-sm font-mono shadow-sm">{webhookUrl}</code>
                <Button variant="outline" size="icon" onClick={copyWebhookUrl} className="shadow-sm h-11 w-11 rounded-xl shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Facebook Credentials */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <Card className="border-0 overflow-hidden shadow-lg">
            <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/20 backdrop-blur-sm p-2.5 border border-white/20">
                  <SiFacebook className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white">Facebook Credentials</h3>
                  <p className="text-blue-100/80 text-xs">Manage Pages & Webhook Token</p>
                </div>
                {!configLoading && (config?.verifyToken && pagesCount > 0) ? (
                  <Badge className="bg-white/20 text-white border-white/30"><ShieldCheck className="mr-1 h-3 w-3" />Secured</Badge>
                ) : (
                  <Badge className="bg-yellow-400/20 text-yellow-100 border-yellow-400/30"><AlertTriangle className="mr-1 h-3 w-3" />Incomplete</Badge>
                )}
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              {/* Pages Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="text-sm font-bold">Connected Pages</h4>
                    <Badge variant="secondary" className="text-[10px]">{pagesCount} / {maxPages}</Badge>
                  </div>
                  <Button size="sm" onClick={() => setShowAddPage(!showAddPage)} disabled={pagesCount >= maxPages}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                    <Plus className="mr-1 h-3.5 w-3.5" />Add Page
                  </Button>
                </div>

                <AnimatePresence>
                  {showAddPage && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5 mb-4 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Page Name (optional)</Label>
                          <Input type="text" placeholder="My Business Page" value={newPageName} onChange={(e) => setNewPageName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Page Access Token</Label>
                          <div className="relative">
                            <Input type={showNewPageToken ? "text" : "password"} placeholder="EAAxxxxxxx..." value={newPageToken}
                              onChange={(e) => setNewPageToken(e.target.value)} className="pr-10" />
                            <button type="button" onClick={() => setShowNewPageToken(!showNewPageToken)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                              {showNewPageToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => {
                            if (!newPageToken.trim()) { toast({ title: "Missing Token", variant: "destructive" }); return; }
                            addPageMutation.mutate({ token: newPageToken.trim(), name: newPageName.trim() });
                          }} disabled={addPageMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {addPageMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Connecting...</> : <><Plus className="mr-2 h-3.5 w-3.5" />Connect</>}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setShowAddPage(false); setNewPageToken(""); setNewPageName(""); }}>Cancel</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {pagesLoading ? (
                  <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
                ) : pagesCount === 0 ? (
                  <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-8 text-center">
                    <SiFacebook className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No pages connected yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Click "Add Page" to connect your first Facebook Page</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pages!.map((page, index) => (
                      <motion.div key={page.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 rounded-xl border bg-card p-3.5 group hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all"
                      >
                        <div className="rounded-xl bg-blue-100 dark:bg-blue-900/50 p-2 shrink-0">
                          <SiFacebook className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{page.name}</p>
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0">
                              <Zap className="mr-0.5 h-2 w-2" />Live
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1 font-mono"><Key className="h-2.5 w-2.5" />{page.accessToken}</span>
                            {page.facebookPageId && <span className="flex items-center gap-1"><Hash className="h-2.5 w-2.5" />{page.facebookPageId}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => removePageMutation.mutate(page.id)} disabled={removePageMutation.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Verify Token */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-bold">Verify Token</h4>
                  {!configLoading && config?.verifyToken && (
                    <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 text-[10px]">
                      <Zap className="mr-1 h-2.5 w-2.5" />Live
                    </Badge>
                  )}
                </div>
                {!configLoading && config?.verifyToken && (
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="font-mono text-blue-800 dark:text-blue-300">{config.verifyToken}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Enter a new Verify Token</Label>
                  <div className="relative">
                    <Input type={showVerifyToken ? "text" : "password"} placeholder="my_secret_verify_token"
                      value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="pr-10" />
                    <button type="button" onClick={() => setShowVerifyToken(!showVerifyToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showVerifyToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={() => {
                  if (!verifyToken.trim()) { toast({ title: "Missing Token", variant: "destructive" }); return; }
                  verifyTokenMutation.mutate({ token: verifyToken.trim() });
                }} disabled={verifyTokenMutation.isPending} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                  {verifyTokenMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Updating...</> : <><ShieldCheck className="mr-2 h-3.5 w-3.5" />Update Token</>}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/20 border-t px-6 py-3">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />Tokens are stored securely. Changes take effect immediately.
              </p>
            </CardFooter>
          </Card>
        </motion.div>

        {/* WhatsApp Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }}>
          <Card className="border-0 overflow-hidden shadow-lg">
            <div className="bg-gradient-to-r from-green-600 via-green-500 to-emerald-500 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/20 backdrop-blur-sm p-2.5 border border-white/20">
                  <SiWhatsapp className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white">WhatsApp Connection</h3>
                  <p className="text-green-100/80 text-xs">Link your WhatsApp for AI responses</p>
                </div>
                {waStatus?.status === "connected" ? (
                  <Badge className="bg-white/20 text-white border-white/30"><CheckCircle2 className="mr-1 h-3 w-3" />Connected</Badge>
                ) : waStatus?.status === "waiting_for_pairing" || waStatus?.status === "connecting" ? (
                  <Badge className="bg-yellow-400/20 text-yellow-100 border-yellow-400/30"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Linking...</Badge>
                ) : (
                  <Badge className="bg-white/10 text-white/70 border-white/20"><Unplug className="mr-1 h-3 w-3" />Offline</Badge>
                )}
              </div>
            </div>
            <CardContent className="p-6 space-y-5">
              {waStatus?.status === "connected" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-5">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-green-100 dark:bg-green-900/50 p-2.5">
                        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-800 dark:text-green-300">Connection Successful!</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Active{waStatus.connectedName ? ` as ${waStatus.connectedName}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0">
                        <Zap className="mr-0.5 h-2.5 w-2.5" />Active
                      </Badge>
                    </div>
                    {waStatus.connectedAt && (
                      <p className="text-xs text-green-500 mt-3 ml-[52px]">Since {new Date(waStatus.connectedAt).toLocaleString()}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => waDisconnectMutation.mutate()} disabled={waDisconnectMutation.isPending}
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 rounded-xl">
                    {waDisconnectMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Disconnecting...</> : <><Unplug className="mr-2 h-3.5 w-3.5" />Disconnect</>}
                  </Button>
                </div>
              ) : waStatus?.status === "waiting_for_pairing" || waStatus?.status === "connecting" ? (
                <div className="space-y-5">
                  {savedPairingCode ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-green-600" /><h4 className="text-sm font-bold">Pairing Code</h4></div>
                        {pairingTimeLeft && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600"><Timer className="h-3.5 w-3.5" />Expires in {pairingTimeLeft}</div>
                        )}
                      </div>
                      <div className="rounded-2xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-6 text-center">
                        <p className="text-4xl font-mono font-bold tracking-[0.4em] text-green-800 dark:text-green-200 select-all">{savedPairingCode}</p>
                        <p className="text-xs text-green-600/80 mt-3">WhatsApp → Settings → Linked Devices → Link a Device → Enter code</p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <Button size="sm" variant="outline" onClick={copyPairingCode}
                            className="border-green-300 dark:border-green-800 text-green-700 hover:bg-green-100 rounded-xl">
                            <ClipboardCopy className="mr-2 h-3.5 w-3.5" />Copy
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => waRecreateMutation.mutate()} disabled={waRecreateMutation.isPending}
                            className="border-green-300 dark:border-green-800 text-green-700 hover:bg-green-100 rounded-xl">
                            {waRecreateMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />...</> : <><RotateCw className="mr-2 h-3.5 w-3.5" />New Code</>}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <Loader2 className="h-10 w-10 animate-spin text-green-600" />
                      <p className="text-sm text-muted-foreground">Generating pairing code...</p>
                    </div>
                  )}
                  <Separator />
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-xl" onClick={() => waVerifyMutation.mutate()} disabled={waVerifyMutation.isPending}>
                      {waVerifyMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Verifying...</> : <><RefreshCw className="mr-2 h-3.5 w-3.5" />Verify Connection</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => waDisconnectMutation.mutate()} disabled={waDisconnectMutation.isPending}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {waStatus?.errorMessage && (
                    <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">{waStatus.errorMessage}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Phone Number</Label>
                    <div className="flex gap-2">
                      <Input type="tel" placeholder="e.g. 212612345678" value={waPhoneNumber} onChange={(e) => setWaPhoneNumber(e.target.value)} className="flex-1" />
                      <Button className="bg-green-600 hover:bg-green-700 text-white shrink-0 rounded-xl" onClick={() => {
                        if (!waPhoneNumber.trim()) { toast({ title: "Missing Phone Number", variant: "destructive" }); return; }
                        waConnectMutation.mutate({ phoneNumber: waPhoneNumber.trim() });
                      }} disabled={waConnectMutation.isPending}>
                        {waConnectMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />...</> : <><Phone className="mr-2 h-3.5 w-3.5" />Link</>}
                      </Button>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 mt-2">
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                        Enter the EXACT phone number registered with WhatsApp, including country code.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/20 border-t px-6 py-3">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />WhatsApp session is stored securely. Messages processed via configured AI model.
              </p>
            </CardFooter>
          </Card>
        </motion.div>

        {/* AI Text Model */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="shadow-md border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-purple-100 dark:bg-purple-900/40 p-2"><Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                  <CardTitle className="text-base font-bold">AI Text Model</CardTitle>
                </div>
                {!configLoading && config?.openRouterApiKey && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"><Zap className="mr-1 h-3 w-3" />Active</Badge>
                )}
              </div>
              <CardDescription>Configure OpenRouter API key and model for text responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!configLoading && config?.openRouterApiKey && (
                <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                  <p className="text-sm font-medium">Current Configuration</p>
                  <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Key className="h-3.5 w-3.5" />{config.openRouterApiKey}</span>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{config.openRouterModel || "stepfun/step-3.5-flash:free"}</span>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>OpenRouter API Key</Label>
                  <Input type="password" placeholder="sk-or-v1-..." value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Get your key from openrouter.ai/settings/keys</p>
                </div>
                <div className="space-y-2">
                  <Label>Model Name</Label>
                  <div className="relative" ref={modelDropdownRef}>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input type="text" placeholder="stepfun/step-3.5-flash:free"
                          value={aiModel || modelSearchQuery}
                          onChange={(e) => { setModelSearchQuery(e.target.value); setAiModel(""); if (modelOptions.length > 0) setShowModelDropdown(true); }}
                          onFocus={() => { if (modelOptions.length > 0) setShowModelDropdown(true); else if (aiApiKey.trim()) fetchModels(); }}
                        />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => fetchModels()} disabled={modelsLoading || !aiApiKey.trim()}>
                        {modelsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch"}
                      </Button>
                    </div>
                    {showModelDropdown && modelOptions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border bg-popover shadow-xl">
                        {modelOptions.filter((m) => {
                          const query = (aiModel || modelSearchQuery).toLowerCase();
                          if (!query) return true;
                          return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
                        }).slice(0, 100).map((m) => (
                          <button key={m.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => { setAiModel(m.id); setModelSearchQuery(""); setShowModelDropdown(false); }}>
                            <span className="font-medium">{m.name}</span>
                            <span className="block text-[11px] text-muted-foreground truncate">{m.id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button onClick={() => {
                  if (!aiApiKey.trim()) { toast({ title: "Missing API Key", variant: "destructive" }); return; }
                  aiMutation.mutate({ apiKey: aiApiKey.trim(), model: (aiModel.trim() || modelSearchQuery.trim()) });
                }} disabled={aiMutation.isPending} className="w-full sm:w-auto rounded-xl">
                  {aiMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : <><Zap className="mr-2 h-4 w-4" />Activate</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Image Generation */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }}>
          <Card className="shadow-md border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-pink-100 dark:bg-pink-900/40 p-2"><ImageIcon className="h-5 w-5 text-pink-600 dark:text-pink-400" /></div>
                  <CardTitle className="text-base font-bold">Image Generation</CardTitle>
                </div>
                {!configLoading && config?.imageApiKey && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"><Zap className="mr-1 h-3 w-3" />Active</Badge>
                )}
              </div>
              <CardDescription>Configure any image generation API provider</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!configLoading && config?.imageApiKey && (
                <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                  <p className="text-sm font-medium">Current Configuration</p>
                  <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Key className="h-3.5 w-3.5" />{config.imageApiKey}</span>
                    {config.imageApiUrl && <><Separator orientation="vertical" className="h-4" /><span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{config.imageApiUrl}</span></>}
                    {config.imageModel && <><Separator orientation="vertical" className="h-4" /><span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{config.imageModel}</span></>}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2"><Label>API Key</Label><Input type="password" placeholder="Enter API key" value={imageApiKey} onChange={(e) => setImageApiKey(e.target.value)} /></div>
                <div className="space-y-2"><Label>API Endpoint URL (optional)</Label><Input type="url" placeholder="https://api.example.com/v1/images/generations" value={imageApiUrl} onChange={(e) => setImageApiUrl(e.target.value)} /></div>
                <div className="space-y-2"><Label>Model Name (optional)</Label><Input type="text" placeholder="e.g., dall-e-3" value={imageModel} onChange={(e) => setImageModel(e.target.value)} /></div>
                <Button onClick={() => {
                  if (!imageApiKey.trim()) { toast({ title: "Missing API Key", variant: "destructive" }); return; }
                  imageMutation.mutate({ apiKey: imageApiKey.trim(), apiUrl: imageApiUrl.trim(), model: imageModel.trim() });
                }} disabled={imageMutation.isPending} className="w-full sm:w-auto rounded-xl">
                  {imageMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />...</> : <><Zap className="mr-2 h-4 w-4" />Activate</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Setup Guide */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="shadow-md border-0">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/40 p-2"><Settings className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                <CardTitle className="text-base font-bold">Setup Guide</CardTitle>
              </div>
              <CardDescription>Follow these steps to connect your Facebook Messenger bot</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="step-1">
                  <AccordionTrigger className="text-sm">Step 1: Create a Facebook App</AccordionTrigger>
                  <AccordionContent><p className="text-muted-foreground text-sm">Go to developers.facebook.com and create a new app. Select "Business" as the app type.</p></AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-2">
                  <AccordionTrigger className="text-sm">Step 2: Set up Messenger Product</AccordionTrigger>
                  <AccordionContent><p className="text-muted-foreground text-sm">In your Facebook App dashboard, find "Messenger" and set it up. Connect Pages and generate Access Tokens.</p></AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-3">
                  <AccordionTrigger className="text-sm">Step 3: Configure Webhook</AccordionTrigger>
                  <AccordionContent><p className="text-muted-foreground text-sm">In Messenger settings, go to Webhooks. Click "Add Callback URL" and paste the webhook URL shown above.</p></AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-4">
                  <AccordionTrigger className="text-sm">Step 4: Subscribe to Messages</AccordionTrigger>
                  <AccordionContent><p className="text-muted-foreground text-sm">Subscribe to "messages" and "messaging_postbacks" events for each page.</p></AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-5">
                  <AccordionTrigger className="text-sm">Step 5: Test the Bot</AccordionTrigger>
                  <AccordionContent><p className="text-muted-foreground text-sm">Send a message to your connected Facebook Page. The bot should respond using the AI model.</p></AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
