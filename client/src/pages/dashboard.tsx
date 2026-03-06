import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Copy,
  Link,
  Shield,
  Key,
  Settings,
  Sparkles,
  ImageIcon,
  Loader2,
  Zap,
  Globe,
  Cpu,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  FileText,
  Hash,
  Phone,
  MessageSquare,
  Unplug,
  RefreshCw,
  Timer,
  ClipboardCopy,
  RotateCw,
  LogOut,
} from "lucide-react";
import { SiFacebook, SiWhatsapp } from "react-icons/si";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
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

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" data-testid="badge-configured">
        <CheckCircle2 className="mr-1" />
        Configured
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400" data-testid="badge-not-configured">
      <XCircle className="mr-1" />
      Not Configured
    </Badge>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { logout } = useAuth();

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

  const { data: status, isLoading: statusLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
  });

  const { data: config, isLoading: configLoading } = useQuery<ConfigResponse>({
    queryKey: ["/api/config"],
  });

  const { data: pages, isLoading: pagesLoading } = useQuery<PageInfo[]>({
    queryKey: ["/api/pages"],
  });

  const { data: waStatus } = useQuery<WhatsAppStatusResponse>({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "connecting" || data?.status === "waiting_for_pairing") {
        return 3000;
      }
      return 15000;
    },
  });

  const PAIRING_CODE_TTL = 10 * 60 * 1000;

  const waConnectMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string }) => {
      const res = await apiRequest("POST", "/api/whatsapp/connect", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "WhatsApp Connecting", description: data.message });
      if (data.pairingCode) {
        setSavedPairingCode(data.pairingCode);
        setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  const waDisconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/disconnect");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Disconnected", description: data.message });
      setWaPhoneNumber("");
      setSavedPairingCode(null);
      setPairingCodeExpiry(null);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Disconnect Failed", description: error.message, variant: "destructive" });
    },
  });

  const waVerifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/verify");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.verified) {
        toast({ title: "Connection Successful!", description: `WhatsApp is active as ${data.connectedName || "your number"}.` });
      } else {
        toast({ title: "Not Connected Yet", description: data.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (waStatus?.pairingCode && !savedPairingCode) {
      setSavedPairingCode(waStatus.pairingCode);
      if (!pairingCodeExpiry) {
        setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL);
      }
    }
    if (waStatus?.status === "connected" || waStatus?.status === "disconnected") {
      setSavedPairingCode(null);
      setPairingCodeExpiry(null);
    }
  }, [waStatus?.pairingCode, waStatus?.status]);

  useEffect(() => {
    if (!pairingCodeExpiry) {
      setPairingTimeLeft("");
      return;
    }
    const tick = () => {
      const remaining = pairingCodeExpiry - Date.now();
      if (remaining <= 0) {
        setSavedPairingCode(null);
        setPairingCodeExpiry(null);
        setPairingTimeLeft("");
        return;
      }
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
        setSavedPairingCode(data.pairingCode);
        setPairingCodeExpiry(Date.now() + PAIRING_CODE_TTL);
        toast({ title: "New Pairing Code", description: "A new pairing code has been generated." });
      } else {
        toast({ title: "Reconnecting", description: data.message || "Check for QR code." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Recreate Failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchModels = useCallback(async (key?: string) => {
    const apiKeyToUse = key || aiApiKey.trim();
    if (!apiKeyToUse) return;
    setModelsLoading(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/models", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: apiKeyToUse }),
      });
      if (res.ok) {
        const data = await res.json();
        setModelOptions(data);
      }
    } catch {
    } finally {
      setModelsLoading(false);
    }
  }, [aiApiKey]);

  const copyPairingCode = useCallback(() => {
    if (savedPairingCode) {
      navigator.clipboard.writeText(savedPairingCode).then(() => {
        toast({ title: "Copied!", description: "Pairing code copied to clipboard." });
      }).catch(() => {
        toast({ title: "Copy Failed", description: "Could not copy to clipboard.", variant: "destructive" });
      });
    }
  }, [savedPairingCode, toast]);

  const aiMutation = useMutation({
    mutationFn: async (data: { apiKey: string; model: string }) => {
      const res = await apiRequest("POST", "/api/config/ai", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "AI Model Activated", description: `Model "${data.openRouterModel}" is now active.` });
      setAiApiKey("");
      setAiModel("");
      setModelSearchQuery("");
      setModelOptions([]);
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => {
      toast({ title: "Activation Failed", description: error.message, variant: "destructive" });
    },
  });

  const imageMutation = useMutation({
    mutationFn: async (data: { apiKey: string; apiUrl: string; model: string }) => {
      const res = await apiRequest("POST", "/api/config/image", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Image Generation Activated", description: `Configuration saved${data.imageModel ? ` for model "${data.imageModel}"` : ""}.` });
      setImageApiKey("");
      setImageApiUrl("");
      setImageModel("");
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => {
      toast({ title: "Activation Failed", description: error.message, variant: "destructive" });
    },
  });

  const verifyTokenMutation = useMutation({
    mutationFn: async (data: { token: string }) => {
      const res = await apiRequest("POST", "/api/config/verify-token", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Verify Token Updated", description: `Token ending in ${data.verifyToken} is now active.` });
      setVerifyToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    },
  });

  const addPageMutation = useMutation({
    mutationFn: async (data: { token: string; name: string }) => {
      const res = await apiRequest("POST", "/api/pages", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Page Connected", description: data.message });
      setNewPageToken("");
      setNewPageName("");
      setShowAddPage(false);
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Add Page", description: error.message, variant: "destructive" });
    },
  });

  const removePageMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/pages/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Page Removed", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Removal Failed", description: error.message, variant: "destructive" });
    },
  });

  const webhookUrl = window.location.origin + "/webhook";
  const pagesCount = pages?.length ?? 0;
  const maxPages = 15;

  const allConfigured = status
    ? status.verifyToken && status.pageAccessToken && status.openRouterApiKey
    : false;
  const someConfigured = status
    ? status.verifyToken || status.pageAccessToken || status.openRouterApiKey
    : false;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      toast({ title: "Copied", description: "Webhook URL copied to clipboard." });
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-background dark:from-gray-950 dark:to-background">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-10 relative overflow-hidden" data-testid="header-section">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-1/4 w-48 h-48 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-blue-300 rounded-full blur-3xl" />
          </div>
          <div className="max-w-5xl mx-auto relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-white/90 tracking-wide uppercase" data-testid="text-user-name">
                  Admin Panel
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:text-white hover:bg-white/15 rounded-lg border border-white/10"
                onClick={() => logout()}
                data-testid="button-logout"
              >
                <LogOut className="mr-1.5 h-4 w-4" />
                Logout
              </Button>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-3 border border-white/10">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight" data-testid="text-title">
                  Messenger AI Bot
                </h1>
                <p className="mt-1 text-white/70 text-sm flex items-center gap-3 flex-wrap" data-testid="text-subtitle">
                  {status?.openRouterModel
                    ? `Model: ${status.openRouterModel}`
                    : "OpenRouter AI Powered"}
                  {!statusLoading && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      allConfigured ? "bg-green-400/20 text-green-200 border border-green-400/30" : someConfigured ? "bg-yellow-400/20 text-yellow-200 border border-yellow-400/30" : "bg-red-400/20 text-red-200 border border-red-400/30"
                    }`} data-testid="status-indicator">
                      <span className={`h-1.5 w-1.5 rounded-full ${allConfigured ? "bg-green-400" : someConfigured ? "bg-yellow-400" : "bg-red-400"}`} />
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
                    <SiFacebook className="h-3.5 w-3.5" />
                    {status.pagesCount} {status.pagesCount === 1 ? "Page" : "Pages"}
                  </span>
                )}
                {status.whatsappConnected && (
                  <span className="inline-flex items-center gap-2 bg-green-400/15 text-green-200 text-xs font-medium px-3.5 py-1.5 rounded-full border border-green-400/20">
                    <SiWhatsapp className="h-3.5 w-3.5" />
                    WhatsApp Active
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" data-testid="text-config-heading">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Configuration Status
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statusLoading ? (
              <>
                <Card className="shadow-md"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
                <Card className="shadow-md"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
                <Card className="shadow-md"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
                <Card className="shadow-md"><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
              </>
            ) : (
              <>
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-l-indigo-500" data-testid="card-verify-token">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Verify Token</CardTitle>
                    <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/30 p-1.5">
                      <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <StatusBadge configured={status?.verifyToken ?? false} />
                  </CardContent>
                </Card>
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-l-blue-500" data-testid="card-page-access-token">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Facebook Pages</CardTitle>
                    <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-1.5">
                      <SiFacebook className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {status?.pageAccessToken ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" data-testid="badge-pages-count">
                        <CheckCircle2 className="mr-1" />
                        {status.pagesCount} {status.pagesCount === 1 ? "Page" : "Pages"}
                      </Badge>
                    ) : (
                      <StatusBadge configured={false} />
                    )}
                  </CardContent>
                </Card>
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-l-purple-500" data-testid="card-openrouter-key">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">OpenRouter API</CardTitle>
                    <div className="rounded-lg bg-purple-100 dark:bg-purple-900/30 p-1.5">
                      <Settings className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <StatusBadge configured={status?.openRouterApiKey ?? false} />
                  </CardContent>
                </Card>
                <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 border-l-4 border-l-green-500" data-testid="card-whatsapp-status">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
                    <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-1.5">
                      <SiWhatsapp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {status?.whatsappConnected ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" data-testid="badge-wa-status-connected">
                        <CheckCircle2 className="mr-1" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-400" data-testid="badge-wa-status-disconnected">
                        <Unplug className="mr-1" />
                        Not Linked
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Card className="shadow-md border-0 bg-gradient-to-r from-slate-50 to-blue-50/50 dark:from-slate-900 dark:to-blue-950/30" data-testid="card-webhook-url">
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-1.5">
                  <Link className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-base">Webhook URL</CardTitle>
              </div>
              <CardDescription>
                Use this URL as your Facebook Webhook callback URL
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 min-w-0 truncate rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-2.5 text-sm font-mono shadow-sm" data-testid="text-webhook-url">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="icon" onClick={copyWebhookUrl} className="shadow-sm h-10 w-10" data-testid="button-copy-webhook">
                  <Copy />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="border-2 border-blue-200 dark:border-blue-900 overflow-hidden shadow-lg shadow-blue-500/5" data-testid="card-facebook-credentials">
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white/20 p-2">
                  <SiFacebook className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white" data-testid="text-fb-credentials-title">Facebook Credentials</h3>
                  <p className="text-blue-100 text-xs">Manage your Pages and Webhook Verify Token</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {!configLoading && (config?.verifyToken && pagesCount > 0) ? (
                    <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30" data-testid="badge-fb-secured">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      Secured
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-400/20 text-yellow-100 border-yellow-400/30 hover:bg-yellow-400/30" data-testid="badge-fb-incomplete">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Incomplete
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <h4 className="text-sm font-semibold">Connected Pages</h4>
                    <Badge variant="secondary" className="text-xs" data-testid="badge-pages-total">
                      {pagesCount} / {maxPages}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddPage(!showAddPage)}
                    disabled={pagesCount >= maxPages}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    data-testid="button-add-page"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add Page
                  </Button>
                </div>

                <AnimatePresence>
                  {showAddPage && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 mb-4 space-y-3" data-testid="add-page-form">
                        <div className="space-y-2">
                          <Label htmlFor="new-page-name" className="text-xs">Page Name (optional)</Label>
                          <Input
                            id="new-page-name"
                            type="text"
                            placeholder="My Business Page"
                            value={newPageName}
                            onChange={(e) => setNewPageName(e.target.value)}
                            data-testid="input-new-page-name"
                          />
                          <p className="text-xs text-muted-foreground">Leave empty to auto-detect from Facebook</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-page-token" className="text-xs">Page Access Token</Label>
                          <div className="relative">
                            <Input
                              id="new-page-token"
                              type={showNewPageToken ? "text" : "password"}
                              placeholder="EAAxxxxxxx..."
                              value={newPageToken}
                              onChange={(e) => setNewPageToken(e.target.value)}
                              className="pr-10"
                              data-testid="input-new-page-token"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPageToken(!showNewPageToken)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              data-testid="button-toggle-new-page-token-visibility"
                            >
                              {showNewPageToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">From your Facebook App Dashboard &gt; Messenger &gt; Access Tokens</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              if (!newPageToken.trim()) {
                                toast({ title: "Missing Token", description: "Please enter a Page Access Token.", variant: "destructive" });
                                return;
                              }
                              addPageMutation.mutate({ token: newPageToken.trim(), name: newPageName.trim() });
                            }}
                            disabled={addPageMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            data-testid="button-confirm-add-page"
                          >
                            {addPageMutation.isPending ? (
                              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Connecting...</>
                            ) : (
                              <><Plus className="mr-2 h-3.5 w-3.5" />Connect Page</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setShowAddPage(false); setNewPageToken(""); setNewPageName(""); }}
                            data-testid="button-cancel-add-page"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {pagesLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : pagesCount === 0 ? (
                  <div className="rounded-lg border border-dashed border-muted-foreground/25 p-6 text-center" data-testid="no-pages-message">
                    <SiFacebook className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No pages connected yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "Add Page" to connect your first Facebook Page</p>
                  </div>
                ) : (
                  <div className="space-y-2" data-testid="pages-list">
                    {pages!.map((page, index) => (
                      <motion.div
                        key={page.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 rounded-lg border bg-card p-3 group hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                        data-testid={`page-item-${page.id}`}
                      >
                        <div className="rounded-full bg-blue-100 dark:bg-blue-900/50 p-1.5 shrink-0">
                          <SiFacebook className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate" data-testid={`page-name-${page.id}`}>{page.name}</p>
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0" data-testid={`page-badge-${page.id}`}>
                              <Zap className="mr-0.5 h-2 w-2" />
                              Live
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1 font-mono">
                              <Key className="h-2.5 w-2.5" />
                              {page.accessToken}
                            </span>
                            {page.facebookPageId && (
                              <span className="flex items-center gap-1">
                                <Hash className="h-2.5 w-2.5" />
                                {page.facebookPageId}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removePageMutation.mutate(page.id)}
                          disabled={removePageMutation.isPending}
                          data-testid={`button-remove-page-${page.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {pagesCount >= maxPages && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1" data-testid="text-max-pages-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Maximum of {maxPages} pages reached. Remove a page to add a new one.
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h4 className="text-sm font-semibold">Verify Token</h4>
                  {!configLoading && config?.verifyToken && (
                    <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 text-xs" data-testid="badge-verify-token-active">
                      <Zap className="mr-1 h-2.5 w-2.5" />
                      Live
                    </Badge>
                  )}
                </div>
                {!configLoading && config?.verifyToken && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3" data-testid="verify-token-current">
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span className="font-mono text-blue-800 dark:text-blue-300">{config.verifyToken}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="verify-token" className="text-xs text-muted-foreground">Enter a new Verify Token</Label>
                  <div className="relative">
                    <Input
                      id="verify-token"
                      type={showVerifyToken ? "text" : "password"}
                      placeholder="my_secret_verify_token"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                      className="pr-10"
                      data-testid="input-verify-token"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerifyToken(!showVerifyToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-verify-token-visibility"
                    >
                      {showVerifyToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">A custom string you define for webhook verification with Facebook</p>
                </div>
                <Button
                  onClick={() => {
                    if (!verifyToken.trim()) {
                      toast({ title: "Missing Token", description: "Please enter a Verify Token.", variant: "destructive" });
                      return;
                    }
                    verifyTokenMutation.mutate({ token: verifyToken.trim() });
                  }}
                  disabled={verifyTokenMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-update-verify-token"
                >
                  {verifyTokenMutation.isPending ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Updating...</>
                  ) : (
                    <><ShieldCheck className="mr-2 h-3.5 w-3.5" />Update Token</>
                  )}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 border-t px-6 py-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Tokens are stored securely and never exposed in full. Changes take effect immediately.
              </p>
            </CardFooter>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card className="border-2 border-green-200 dark:border-green-900 overflow-hidden shadow-lg shadow-green-500/5" data-testid="card-whatsapp">
            <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-white/20 p-2">
                  <SiWhatsapp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white" data-testid="text-wa-title">WhatsApp Connection</h3>
                  <p className="text-green-100 text-xs">Link your WhatsApp account to enable AI bot responses</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {waStatus?.status === "connected" ? (
                    <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30" data-testid="badge-wa-connected">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Connected
                    </Badge>
                  ) : waStatus?.status === "waiting_for_pairing" || waStatus?.status === "connecting" ? (
                    <Badge className="bg-yellow-400/20 text-yellow-100 border-yellow-400/30 hover:bg-yellow-400/30" data-testid="badge-wa-connecting">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Linking...
                    </Badge>
                  ) : (
                    <Badge className="bg-white/10 text-white/70 border-white/20 hover:bg-white/20" data-testid="badge-wa-disconnected">
                      <Unplug className="mr-1 h-3 w-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <CardContent className="p-6 space-y-5">
              {waStatus?.status === "connected" ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-4" data-testid="wa-connected-info">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-green-100 dark:bg-green-900/50 p-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-300" data-testid="text-wa-connected-label">Connection Successful!</p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          WhatsApp is active{waStatus.connectedName ? ` as ${waStatus.connectedName}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0" data-testid="badge-wa-active">
                        <Zap className="mr-0.5 h-2.5 w-2.5" />
                        Active
                      </Badge>
                    </div>
                    {waStatus.connectedAt && (
                      <p className="text-xs text-green-500 dark:text-green-500 mt-2 ml-12">
                        Connected since {new Date(waStatus.connectedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    <span>Incoming WhatsApp messages will receive AI-powered responses automatically.</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30"
                    onClick={() => waDisconnectMutation.mutate()}
                    disabled={waDisconnectMutation.isPending}
                    data-testid="button-wa-disconnect"
                  >
                    {waDisconnectMutation.isPending ? (
                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Disconnecting...</>
                    ) : (
                      <><Unplug className="mr-2 h-3.5 w-3.5" />Disconnect WhatsApp</>
                    )}
                  </Button>
                </div>
              ) : waStatus?.status === "waiting_for_pairing" || waStatus?.status === "connecting" ? (
                <div className="space-y-5">
                  {savedPairingCode ? (
                    <div className="space-y-3" data-testid="wa-pairing-code-section">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <h4 className="text-sm font-semibold">Pairing Code</h4>
                        </div>
                        {pairingTimeLeft && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <Timer className="h-3.5 w-3.5" />
                            <span data-testid="text-wa-pairing-timer">Expires in {pairingTimeLeft}</span>
                          </div>
                        )}
                      </div>
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-5 text-center">
                        <p className="text-3xl font-mono font-bold tracking-[0.3em] text-green-800 dark:text-green-200 select-all" data-testid="text-wa-pairing-code">
                          {savedPairingCode}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                          Enter this code quickly (within 2 minutes)
                        </p>
                        <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">
                          WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device &rarr; Enter code
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
                            onClick={copyPairingCode}
                            data-testid="button-wa-copy-code"
                          >
                            <ClipboardCopy className="mr-2 h-3.5 w-3.5" />Copy Code
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40"
                            onClick={() => waRecreateMutation.mutate()}
                            disabled={waRecreateMutation.isPending}
                            data-testid="button-wa-recreate-code"
                          >
                            {waRecreateMutation.isPending ? (
                              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Generating...</>
                            ) : (
                              <><RotateCw className="mr-2 h-3.5 w-3.5" />New Code</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="h-8 w-8 animate-spin text-green-600 dark:text-green-400" />
                      <p className="text-sm text-muted-foreground">Generating pairing code...</p>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => waVerifyMutation.mutate()}
                      disabled={waVerifyMutation.isPending}
                      data-testid="button-wa-verify"
                    >
                      {waVerifyMutation.isPending ? (
                        <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Verifying...</>
                      ) : (
                        <><RefreshCw className="mr-2 h-3.5 w-3.5" />Verify Connection</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => waDisconnectMutation.mutate()}
                      disabled={waDisconnectMutation.isPending}
                      data-testid="button-wa-cancel-linking"
                    >
                      Cancel
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      After entering the code on your phone, click Verify to confirm.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {waStatus?.errorMessage && (
                    <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-3 flex items-center gap-2" data-testid="wa-error-message">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">{waStatus.errorMessage}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="wa-phone" className="text-sm font-medium">Phone Number</Label>
                    <div className="flex gap-2">
                      <Input
                        id="wa-phone"
                        type="tel"
                        placeholder="e.g. 212612345678 or +212612345678"
                        value={waPhoneNumber}
                        onChange={(e) => setWaPhoneNumber(e.target.value)}
                        className="flex-1"
                        data-testid="input-wa-phone"
                      />
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                        onClick={() => {
                          if (!waPhoneNumber.trim()) {
                            toast({ title: "Missing Phone Number", description: "Please enter your WhatsApp phone number.", variant: "destructive" });
                            return;
                          }
                          waConnectMutation.mutate({ phoneNumber: waPhoneNumber.trim() });
                        }}
                        disabled={waConnectMutation.isPending}
                        data-testid="button-wa-connect"
                      >
                        {waConnectMutation.isPending ? (
                          <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Connecting...</>
                        ) : (
                          <><Phone className="mr-2 h-3.5 w-3.5" />Link WhatsApp</>
                        )}
                      </Button>
                    </div>
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 mt-1.5">
                      <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                        Important: Enter the EXACT phone number registered with your WhatsApp account, including country code. The number must match precisely or the pairing code will be rejected.
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Examples: 212612345678 (Morocco), 12025551234 (US). You can include the + sign or not.
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">How it works:</p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Enter your WhatsApp phone number with country code and click &quot;Link WhatsApp&quot;</li>
                      <li>You&apos;ll receive an 8-character pairing code</li>
                      <li>On your phone, open WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</li>
                      <li>Choose &quot;Link with phone number instead&quot; and enter the code</li>
                      <li>Come back here and click &quot;Verify&quot; to confirm the connection</li>
                    </ol>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/30 border-t px-6 py-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                Your WhatsApp session is stored locally and encrypted. Messages are processed through the AI model configured above.
              </p>
            </CardFooter>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="shadow-md" data-testid="card-ai-config">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">AI Text Model</CardTitle>
                </div>
                {!configLoading && config?.openRouterApiKey && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" data-testid="badge-ai-active">
                    <Zap className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                )}
              </div>
              <CardDescription>Configure the OpenRouter API key and model for text responses in Messenger</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!configLoading && config?.openRouterApiKey && (
                <div className="rounded-md bg-muted/50 p-4 space-y-2" data-testid="ai-current-config">
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
                  <Label htmlFor="ai-api-key">OpenRouter API Key</Label>
                  <Input id="ai-api-key" type="password" placeholder="sk-or-v1-..." value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} data-testid="input-ai-api-key" />
                  <p className="text-xs text-muted-foreground">Get your API key from openrouter.ai/settings/keys</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-model">Model Name (optional)</Label>
                  <div className="relative" ref={modelDropdownRef}>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="ai-model"
                          type="text"
                          placeholder="stepfun/step-3.5-flash:free"
                          value={aiModel || modelSearchQuery}
                          onChange={(e) => {
                            setModelSearchQuery(e.target.value);
                            setAiModel("");
                            if (modelOptions.length > 0) {
                              setShowModelDropdown(true);
                            }
                          }}
                          onFocus={() => {
                            if (modelOptions.length > 0) {
                              setShowModelDropdown(true);
                            } else if (aiApiKey.trim()) {
                              fetchModels();
                            }
                          }}
                          data-testid="input-ai-model"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fetchModels()}
                        disabled={modelsLoading || !aiApiKey.trim()}
                        data-testid="button-fetch-models"
                      >
                        {modelsLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Fetch Models"
                        )}
                      </Button>
                    </div>
                    {showModelDropdown && modelOptions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-lg" data-testid="model-dropdown">
                        {modelOptions
                          .filter((m) => {
                            const query = (aiModel || modelSearchQuery).toLowerCase();
                            if (!query) return true;
                            return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
                          })
                          .slice(0, 100)
                          .map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                              onClick={() => {
                                setAiModel(m.id);
                                setModelSearchQuery("");
                                setShowModelDropdown(false);
                              }}
                              data-testid={`model-option-${m.id}`}
                            >
                              <span className="font-medium">{m.name}</span>
                              <span className="block text-xs text-muted-foreground truncate">{m.id}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Enter an API key and click "Fetch Models" to browse available models, or type a model ID directly</p>
                </div>
                <Button onClick={() => {
                  if (!aiApiKey.trim()) { toast({ title: "Missing API Key", description: "Please enter an OpenRouter API key.", variant: "destructive" }); return; }
                  const selectedModel = aiModel.trim() || modelSearchQuery.trim();
                  aiMutation.mutate({ apiKey: aiApiKey.trim(), model: selectedModel });
                }} disabled={aiMutation.isPending} className="w-full sm:w-auto" data-testid="button-activate-ai">
                  {aiMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>) : (<><Zap className="mr-2 h-4 w-4" />Activate</>)}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="shadow-md" data-testid="card-image-config">
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Image Generation</CardTitle>
                </div>
                {!configLoading && config?.imageApiKey && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" data-testid="badge-image-active">
                    <Zap className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                )}
              </div>
              <CardDescription>Configure any image generation API - works with any provider (OpenAI DALL-E, Stability AI, Replicate, etc.)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!configLoading && config?.imageApiKey && (
                <div className="rounded-md bg-muted/50 p-4 space-y-2" data-testid="image-current-config">
                  <p className="text-sm font-medium">Current Configuration</p>
                  <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Key className="h-3.5 w-3.5" />{config.imageApiKey}</span>
                    {config.imageApiUrl && (<><Separator orientation="vertical" className="h-4" /><span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{config.imageApiUrl}</span></>)}
                    {config.imageModel && (<><Separator orientation="vertical" className="h-4" /><span className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" />{config.imageModel}</span></>)}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="image-api-key">API Key</Label>
                  <Input id="image-api-key" type="password" placeholder="Enter your API key" value={imageApiKey} onChange={(e) => setImageApiKey(e.target.value)} data-testid="input-image-api-key" />
                  <p className="text-xs text-muted-foreground">The API key from your image generation provider</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image-api-url">API Endpoint URL (optional)</Label>
                  <Input id="image-api-url" type="url" placeholder="https://api.example.com/v1/images/generations" value={imageApiUrl} onChange={(e) => setImageApiUrl(e.target.value)} data-testid="input-image-api-url" />
                  <p className="text-xs text-muted-foreground">The full API endpoint URL for image generation requests</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image-model">Model Name (optional)</Label>
                  <Input id="image-model" type="text" placeholder="e.g., dall-e-3, stable-diffusion-xl" value={imageModel} onChange={(e) => setImageModel(e.target.value)} data-testid="input-image-model" />
                  <p className="text-xs text-muted-foreground">The specific model to use for image generation</p>
                </div>
                <Button onClick={() => {
                  if (!imageApiKey.trim()) { toast({ title: "Missing API Key", description: "Please enter an API key for the image generation service.", variant: "destructive" }); return; }
                  imageMutation.mutate({ apiKey: imageApiKey.trim(), apiUrl: imageApiUrl.trim(), model: imageModel.trim() });
                }} disabled={imageMutation.isPending} className="w-full sm:w-auto" data-testid="button-activate-image">
                  {imageMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying...</>) : (<><Zap className="mr-2 h-4 w-4" />Activate</>)}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="shadow-md" data-testid="card-setup-guide">
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Setup Guide</CardTitle>
              </div>
              <CardDescription>Follow these steps to connect your Facebook Messenger bot</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                <AccordionItem value="step-1" data-testid="accordion-step-1">
                  <AccordionTrigger>Step 1: Create a Facebook App</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">Go to developers.facebook.com and create a new app. Select "Business" as the app type. Give your app a name and complete the setup process.</p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-2" data-testid="accordion-step-2">
                  <AccordionTrigger>Step 2: Set up Messenger Product</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">In your Facebook App dashboard, find "Messenger" in the products list and click "Set Up". Connect your Facebook Pages and generate Page Access Tokens for each one. Then add them in the Facebook Credentials panel above.</p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-3" data-testid="accordion-step-3">
                  <AccordionTrigger>Step 3: Configure Webhook</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">In the Messenger settings, go to the Webhooks section. Click "Add Callback URL" and paste the webhook URL shown above. Enter the same Verify Token you set in the Facebook Credentials panel.</p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-4" data-testid="accordion-step-4">
                  <AccordionTrigger>Step 4: Subscribe to Messages</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">After configuring the webhook, subscribe to the "messages" and "messaging_postbacks" events for each page. This allows your bot to receive incoming messages from users.</p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="step-5" data-testid="accordion-step-5">
                  <AccordionTrigger>Step 5: Test the Bot</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">Send a message to any of your connected Facebook Pages via Messenger. The bot should receive the message and respond using the AI model configured above.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
