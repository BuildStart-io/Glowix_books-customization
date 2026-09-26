import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { uploadMedia } from "@/lib/mediaStorage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Send,
  Users,
  ShieldAlert,
  ShieldCheck,
  Pause,
  Play,
  RotateCcw,
  Image as ImageIcon,
  Film,
  Paperclip,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  AlertCircle,
  History,
  Radio,
  Loader2,
  Trash2,
  UploadCloud,
  Check,
} from "lucide-react";

type SegmentType = "all" | "orders" | "pending" | "preorders" | "queries";

interface AudienceCounts {
  all: number;
  orders: number;
  pending: number;
  preorders: number;
  queries: number;
}

interface Campaign {
  id: string;
  name: string;
  segment: SegmentType;
  message_template: string;
  media_url?: string;
  media_type?: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: "draft" | "sending" | "paused" | "completed" | "cancelled";
  delay_seconds_min: number;
  delay_seconds_max: number;
  created_at: string;
}

interface QueueLog {
  id: number;
  phone_number: string;
  recipient_name: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  error_message: string | null;
}

async function extractInvokeError(error: any): Promise<string> {
  if (!error) return "Unknown error";
  try {
    if (error.context?.json) {
      const body = await error.context.json();
      return body?.error || body?.message || error.message;
    }
  } catch (_) {}
  return error.message;
}

export default function BroadcastManager() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Audience & Segment State
  const [segment, setSegment] = useState<SegmentType>("all");
  const [counts, setCounts] = useState<AudienceCounts>({ all: 0, orders: 0, pending: 0, preorders: 0, queries: 0 });
  const [audienceSample, setAudienceSample] = useState<Array<{ phone: string; name: string }>>([]);
  const [loadingAudience, setLoadingAudience] = useState(false);

  // Form State
  const [campaignName, setCampaignName] = useState("");
  const [message, setMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<string>("image");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [minDelay, setMinDelay] = useState(8);
  const [maxDelay, setMaxDelay] = useState(15);

  // Active Campaign / Broadcasting Controller State
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [logs, setLogs] = useState<QueueLog[]>([]);
  const [campaignHistory, setCampaignHistory] = useState<Campaign[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isBroadcastingRef = useRef(false);
  isBroadcastingRef.current = isBroadcasting;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Fetch audience counts and sample contacts
  const fetchAudience = async (targetSegment: SegmentType = segment) => {
    if (!user) return;
    setLoadingAudience(true);
    try {
      const { data, error } = await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "get_audience_counts", segment: targetSegment, user_id: user.id },
      });

      if (error) throw error;
      if (data?.success) {
        setCounts(data.counts);
        setAudienceSample(data.sample || []);
      }
    } catch (err: any) {
      console.error("Error fetching audience counts:", err);
    } finally {
      setLoadingAudience(false);
    }
  };

  // 2. Fetch past campaigns
  const fetchCampaigns = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "list_campaigns", user_id: user.id },
      });
      if (error) throw error;
      if (data?.success && data.campaigns) {
        setCampaignHistory(data.campaigns);
        // If there is any ongoing or paused campaign, show it
        const current = data.campaigns.find(
          (c: Campaign) => c.status === "sending" || c.status === "paused" || c.status === "draft"
        );
        if (current && !activeCampaign) {
          setActiveCampaign(current);
          fetchCampaignDetails(current.id);
        }
      }
    } catch (err: any) {
      console.error("Error loading campaigns:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchCampaignDetails = async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "get_campaign_status", campaign_id: campaignId, user_id: user?.id },
      });
      if (error) throw error;
      if (data?.success) {
        setActiveCampaign(data.campaign);
        setLogs(data.recent_logs || []);
      }
    } catch (err) {
      console.error("Error fetching campaign details:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAudience(segment);
      fetchCampaigns();
    }
  }, [user]);

  const handleSegmentChange = (newSeg: SegmentType) => {
    setSegment(newSeg);
    fetchAudience(newSeg);
  };

  // Helper: insert {name} into message template
  const insertPlaceholder = (tag: string) => {
    if (!textareaRef.current) {
      setMessage((prev) => prev + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newText = message.substring(0, start) + tag + message.substring(end);
    setMessage(newText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + tag.length;
        textareaRef.current.focus();
      }
    }, 50);
  };

  // Media file upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Detect media type
    if (file.type.startsWith("image/")) setMediaType("image");
    else if (file.type.startsWith("video/")) setMediaType("video");
    else if (file.type.startsWith("audio/")) setMediaType("audio");
    else setMediaType("document");

    setIsUploadingMedia(true);
    try {
      const url = await uploadMedia(file, "welcome");
      setMediaUrl(url);
      toast({
        title: "Media Uploaded",
        description: `${file.name} ready for broadcast.`,
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to upload file.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingMedia(false);
    }
  };

  // Start campaign & kick off processing loop
  const handleStartBroadcast = async () => {
    if (!user) return;
    if (!message.trim() && !mediaUrl.trim()) {
      toast({
        title: "Message Required",
        description: "Please enter a message text or attach media.",
        variant: "destructive",
      });
      return;
    }

    const currentCount = counts[segment];
    if (currentCount === 0) {
      toast({
        title: "Audience is Empty",
        description: "There are no contacts in the selected segment.",
        variant: "destructive",
      });
      return;
    }

    setLoadingAudience(true);
    try {
      const name = campaignName.trim() || `Broadcast - ${new Date().toLocaleDateString("en-GB")}`;
      const { data, error } = await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: {
          action: "create_campaign",
          name,
          segment,
          message_template: message,
          media_url: mediaUrl || undefined,
          media_type: mediaType,
          delay_seconds_min: minDelay,
          delay_seconds_max: maxDelay,
          user_id: user.id,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to create campaign");

      const created = data.campaign;
      setActiveCampaign(created);
      setIsBroadcasting(true);
      toast({
        title: "Campaign Initiated",
        description: `Queued ${data.total_recipients} recipients with anti-ban delay (${minDelay}-${maxDelay}s).`,
      });

      // Start dispatch loop
      startDispatchLoop(created.id);
    } catch (err: any) {
      console.error("Start broadcast error:", err);
      const errMsg = await extractInvokeError(err);
      toast({
        title: "Failed to Start",
        description: errMsg || "Could not launch broadcast.",
        variant: "destructive",
      });
    } finally {
      setLoadingAudience(false);
      fetchCampaigns();
    }
  };

  // Dispatch batch loop (invokes edge function in small batches to respect timeouts and anti-ban)
  const startDispatchLoop = async (campaignId: string) => {
    isBroadcastingRef.current = true;
    setIsBroadcasting(true);

    while (isBroadcastingRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("broadcast-manager-Glowix_books", {
          body: {
            action: "process_batch",
            campaign_id: campaignId,
            batch_limit: 3,
            user_id: user?.id,
          },
        });

        if (error) {
          console.error("Batch processing error:", error);
          // Wait briefly before retrying
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        if (data?.paused) {
          isBroadcastingRef.current = false;
          setIsBroadcasting(false);
          await fetchCampaignDetails(campaignId);
          break;
        }

        // Refresh campaign stats & logs
        await fetchCampaignDetails(campaignId);

        if (data?.status === "completed" || data?.remaining === 0) {
          isBroadcastingRef.current = false;
          setIsBroadcasting(false);
          toast({
            title: "🎉 Broadcast Completed!",
            description: `All messages sent. Success: ${data.sent_count}, Failed: ${data.failed_count}`,
          });
          fetchCampaigns();
          break;
        }
      } catch (err: any) {
        console.error("Dispatch loop exception:", err);
        await new Promise((r) => setTimeout(r, 6000));
      }
    }
  };

  // Pause campaign
  const handlePause = async () => {
    if (!activeCampaign) return;
    isBroadcastingRef.current = false;
    setIsBroadcasting(false);
    try {
      await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "pause_campaign", campaign_id: activeCampaign.id, user_id: user?.id },
      });
      toast({
        title: "Campaign Paused",
        description: "Sending paused. Remaining messages stay safe in the queue.",
      });
      fetchCampaignDetails(activeCampaign.id);
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Pause Failed", description: err.message, variant: "destructive" });
    }
  };

  // Resume campaign
  const handleResume = async () => {
    if (!activeCampaign) return;
    isBroadcastingRef.current = true;
    setIsBroadcasting(true);
    try {
      await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "resume_campaign", campaign_id: activeCampaign.id, user_id: user?.id },
      });
      toast({
        title: "Campaign Resumed",
        description: "Processing next batch in safe intervals...",
      });
      startDispatchLoop(activeCampaign.id);
    } catch (err: any) {
      isBroadcastingRef.current = false;
      setIsBroadcasting(false);
      toast({ title: "Resume Failed", description: err.message, variant: "destructive" });
    }
  };

  // Cancel campaign
  const handleCancel = async () => {
    if (!activeCampaign) return;
    if (!confirm("Are you sure you want to stop this campaign? Unsent messages will be cancelled.")) return;
    isBroadcastingRef.current = false;
    setIsBroadcasting(false);
    try {
      await supabase.functions.invoke("broadcast-manager-Glowix_books", {
        body: { action: "cancel_campaign", campaign_id: activeCampaign.id, user_id: user?.id },
      });
      toast({ title: "Campaign Cancelled", description: "Unsent queue items will not be sent." });
      setActiveCampaign(null);
      fetchCampaigns();
    } catch (err: any) {
      toast({ title: "Cancel Failed", description: err.message, variant: "destructive" });
    }
  };

  // Calculate ETA
  const calculateETA = () => {
    if (!activeCampaign) return "--";
    const remaining = Math.max(0, activeCampaign.total_recipients - (activeCampaign.sent_count + activeCampaign.failed_count));
    if (remaining === 0) return "0 min";
    const avgSecPerMsg = (minDelay + maxDelay) / 2;
    const totalSeconds = remaining * avgSecPerMsg;
    const mins = Math.ceil(totalSeconds / 60);
    return `~${mins} min${mins > 1 ? "s" : ""}`;
  };

  const progressPercent = activeCampaign
    ? Math.round(((activeCampaign.sent_count + activeCampaign.failed_count) / Math.max(1, activeCampaign.total_recipients)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner: Anti-Ban Protection Guarantee */}
      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                WhatsApp Anti-Ban Safe Broadcast
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-xs">
                  Protected
                </Badge>
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Automatic randomized jitter delays (8–15s), human-like dispatch intervals, and queue checkpoints protect your WhatsApp account from Meta spam bans.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/60 backdrop-blur px-3 py-1.5 rounded-md border">
            <Radio className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
            <span>Smart Queue Jitter</span>
          </div>
        </div>
      </div>

      {/* ACTIVE CAMPAIGN CONTROLLER & REAL-TIME PROGRESS */}
      {activeCampaign && (
        <Card className="border-primary/30 shadow-md bg-gradient-to-b from-card to-card/90">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Active Campaign: {activeCampaign.name}
                  </CardTitle>
                  <Badge
                    variant={
                      activeCampaign.status === "sending"
                        ? "default"
                        : activeCampaign.status === "paused"
                        ? "secondary"
                        : activeCampaign.status === "completed"
                        ? "outline"
                        : "destructive"
                    }
                    className="capitalize"
                  >
                    {isBroadcasting ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Sending...
                      </span>
                    ) : (
                      activeCampaign.status
                    )}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-1">
                  Target: {activeCampaign.segment.toUpperCase()} contacts • Delay: {activeCampaign.delay_seconds_min}-{activeCampaign.delay_seconds_max}s • Started:{" "}
                  {new Date(activeCampaign.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </CardDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {isBroadcasting ? (
                  <Button variant="outline" size="sm" onClick={handlePause} className="gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20">
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                ) : activeCampaign.status !== "completed" ? (
                  <Button variant="default" size="sm" onClick={handleResume} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                    <Play className="h-4 w-4" /> Resume Sending
                  </Button>
                ) : null}

                {activeCampaign.status !== "completed" && (
                  <Button variant="ghost" size="sm" onClick={handleCancel} className="text-destructive hover:bg-destructive/10">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progress Bar & ETA */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">Progress: {progressPercent}%</span>
                <span className="flex items-center gap-1 text-primary">
                  <Clock className="h-3 w-3" /> Remaining Time: {calculateETA()}
                </span>
              </div>
              <Progress value={progressPercent} className="h-2.5" />
            </div>

            {/* Metric KPI Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground block">Total Audience</span>
                <span className="text-xl font-bold">{activeCampaign.total_recipients}</span>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 block font-medium">✅ Sent Successfully</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeCampaign.sent_count}</span>
              </div>
              <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-3">
                <span className="text-xs text-blue-600 dark:text-blue-400 block font-medium">⏳ Pending In Queue</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {Math.max(0, activeCampaign.total_recipients - (activeCampaign.sent_count + activeCampaign.failed_count))}
                </span>
              </div>
              <div className="rounded-lg border bg-rose-500/5 border-rose-500/20 p-3">
                <span className="text-xs text-rose-600 dark:text-rose-400 block font-medium">❌ Failed</span>
                <span className="text-xl font-bold text-rose-600 dark:text-rose-400">{activeCampaign.failed_count}</span>
              </div>
            </div>

            {/* Live Message Log Stream */}
            {logs.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>Recent Dispatch Log</span>
                  <span>Latest {logs.length} items</span>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-lg border bg-background/50 p-2 text-xs">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-1.5 rounded hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {log.status === "sent" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : log.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium text-foreground">{log.recipient_name || "Customer"}</span>
                        <span className="text-muted-foreground font-mono">
                          +{log.phone_number.slice(0, 4)}••••{log.phone_number.slice(-3)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.error_message && (
                          <span className="text-[11px] text-destructive truncate max-w-[150px]" title={log.error_message}>
                            {log.error_message}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {log.sent_at ? new Date(log.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Queued"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* NEW BROADCAST COMPOSER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Target Audience & Message Composer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Audience Segmentation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  1. Select Target Audience
                </span>
                <Button variant="ghost" size="sm" onClick={() => fetchAudience(segment)} disabled={loadingAudience} className="h-7 text-xs">
                  {loadingAudience ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                  Refresh Counts
                </Button>
              </CardTitle>
              <CardDescription className="text-xs">
                Contacts are automatically deduplicated. Anyone in the list will only be sent the broadcast once.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {[
                  { id: "all", label: "All Contacts", desc: "All chats across store", count: counts.all },
                  { id: "orders", label: "Confirmed Orders", desc: "Completed order chats", count: counts.orders },
                  { id: "pending", label: "Pending Orders", desc: "Awaiting confirmation chats", count: counts.pending },
                  { id: "preorders", label: "Pre-Orders", desc: "Advance booking chats", count: counts.preorders },
                  { id: "queries", label: "Inquiries/Leads", desc: "Inquired without order", count: counts.queries },
                ].map((item) => {
                  const isSelected = segment === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSegmentChange(item.id as SegmentType)}
                      className={`text-left p-3 rounded-xl border transition-all relative ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">{item.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <span className="text-2xl font-black text-foreground block my-1">
                        {loadingAudience ? "..." : item.count}
                      </span>
                      <span className="text-[11px] text-muted-foreground block line-clamp-1">{item.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Sample Preview Chips */}
              {audienceSample.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="text-muted-foreground font-medium">Sample Contacts:</span>
                  {audienceSample.map((c, idx) => (
                    <Badge key={idx} variant="outline" className="font-normal text-[11px] bg-muted/40">
                      {c.name || "Customer"} (+{c.phone.slice(0, 4)}••••{c.phone.slice(-3)})
                    </Badge>
                  ))}
                  {counts[segment] > 5 && (
                    <span className="text-muted-foreground text-[11px]">+{counts[segment] - 5} more</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Message & Media Composition */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                2. Compose Promotional Broadcast
              </CardTitle>
              <CardDescription className="text-xs">
                Write your announcement, discount, or product update. Personalize with recipient's name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campaign Title */}
              <div className="space-y-1.5">
                <Label htmlFor="camp-title" className="text-xs">Campaign Name (Internal Reference)</Label>
                <Input
                  id="camp-title"
                  placeholder="e.g. End of Season Sale - Glowix 20% Off"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Message Box with Placeholders */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="msg-text" className="text-xs">Message Text</Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Click to insert:</span>
                    <button
                      type="button"
                      onClick={() => insertPlaceholder("{name}")}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      + {"{name}"}
                    </button>
                  </div>
                </div>

                <Textarea
                  id="msg-text"
                  ref={textareaRef}
                  rows={5}
                  placeholder="Hello {name}! 🌟 We have an exclusive special offer for you today..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="text-sm font-sans resize-y leading-relaxed"
                />

                <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                  <span>Characters: {message.length}</span>
                  <span>Words: {message.trim() ? message.trim().split(/\s+/).length : 0}</span>
                </div>
              </div>

              {/* Media Attachment Upload / URL */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-primary" /> Attach Media (Image, Video, Catalog Document)
                  </span>
                  {mediaUrl && (
                    <button
                      type="button"
                      onClick={() => setMediaUrl("")}
                      className="text-destructive hover:underline text-[11px] flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Remove Media
                    </button>
                  )}
                </Label>

                {mediaUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    {mediaType === "image" ? (
                      <img src={mediaUrl} alt="Broadcast preview" className="h-14 w-14 object-cover rounded-md border" />
                    ) : mediaType === "video" ? (
                      <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center border">
                        <Film className="h-6 w-6 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center border">
                        <Paperclip className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium block truncate text-foreground">{mediaUrl}</span>
                      <span className="text-[11px] text-muted-foreground capitalize">{mediaType} ready to send</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Direct Upload */}
                    <label className="flex flex-col items-center justify-center p-4 border border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                      <UploadCloud className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs font-medium text-foreground">
                        {isUploadingMedia ? "Uploading..." : "Upload from Device"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">JPG, PNG, MP4, PDF</span>
                      <input
                        type="file"
                        accept="image/*,video/*,application/pdf"
                        onChange={handleFileUpload}
                        disabled={isUploadingMedia}
                        className="hidden"
                      />
                    </label>

                    {/* Or paste URL */}
                    <div className="flex flex-col justify-center space-y-1.5 p-3 border rounded-lg bg-muted/10">
                      <Label htmlFor="media-direct-url" className="text-[11px] text-muted-foreground">Or Direct Media URL</Label>
                      <Input
                        id="media-direct-url"
                        placeholder="https://.../offer.jpg"
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Anti-Ban Protection Settings */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-emerald-500" />
                    Anti-Ban Delay Configuration
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Safe default: 8–15s jitter</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="min-delay" className="text-[11px] text-muted-foreground">Min Delay (sec)</Label>
                    <Input
                      id="min-delay"
                      type="number"
                      min={5}
                      max={30}
                      value={minDelay}
                      onChange={(e) => setMinDelay(Number(e.target.value) || 8)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="max-delay" className="text-[11px] text-muted-foreground">Max Delay (sec)</Label>
                    <Input
                      id="max-delay"
                      type="number"
                      min={8}
                      max={60}
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(Number(e.target.value) || 15)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Estimated Speed</Label>
                    <div className="h-8 rounded border bg-muted/30 px-3 flex items-center text-xs text-muted-foreground">
                      ~{Math.round(60 / ((minDelay + maxDelay) / 2))} msgs / min
                    </div>
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <div className="pt-2">
                <Button
                  onClick={handleStartBroadcast}
                  disabled={loadingAudience || isBroadcasting || counts[segment] === 0 || (!message && !mediaUrl)}
                  className="w-full gap-2 text-sm font-semibold h-11 shadow-sm"
                >
                  <Send className="h-4 w-4" />
                  Launch Broadcast to {counts[segment]} {segment.toUpperCase()} Contacts
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Live WhatsApp Mockup Preview */}
        <div className="space-y-6">
          <Card className="border bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                Live Customer WhatsApp Preview
              </CardTitle>
              <CardDescription className="text-xs">
                How this promotional message appears on the customer's phone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* WhatsApp Mockup Shell */}
              <div className="rounded-2xl border bg-slate-900 text-white shadow-xl overflow-hidden max-w-sm mx-auto">
                {/* Phone Header */}
                <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-700 border border-white/30 flex items-center justify-center font-bold text-xs text-white">
                    GB
                  </div>
                  <div>
                    <h4 className="font-semibold text-xs leading-none">Glowix Books</h4>
                    <span className="text-[10px] text-emerald-100">Official Business</span>
                  </div>
                </div>

                {/* WhatsApp Chat Area */}
                <div className="p-4 min-h-[260px] bg-[#efeae2] dark:bg-[#0b141a] flex flex-col justify-end">
                  {/* Chat Bubble */}
                  <div className="max-w-[85%] self-end bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-800 dark:text-slate-100 rounded-lg p-2.5 shadow-sm space-y-2 relative">
                    {/* Media thumbnail preview */}
                    {mediaUrl && (
                      <div className="rounded overflow-hidden border border-black/10">
                        {mediaType === "video" ? (
                          <div className="h-32 bg-black/80 flex items-center justify-center text-white text-xs">
                            <Film className="h-8 w-8 mr-1 text-white/80" /> Video
                          </div>
                        ) : (
                          <img
                            src={mediaUrl}
                            alt="Media Preview"
                            className="w-full h-36 object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Text Caption */}
                    <p className="text-xs whitespace-pre-wrap leading-relaxed">
                      {message
                        ? message.replace(/{name}/gi, "Sarah")
                        : "Hello Sarah! 🌟 Your special offer will be shown here..."}
                    </p>

                    {/* Timestamp & double tick */}
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-300">
                      <span>12:45 PM</span>
                      <span className="text-blue-500 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CAMPAIGN HISTORY SECTION */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Past Broadcast Campaigns
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchCampaigns} disabled={historyLoading} className="h-7 text-xs">
              {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              Refresh
            </Button>
          </div>
          <CardDescription className="text-xs">
            Review previous broadcast reports, delivery status, and resume any incomplete campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaignHistory.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No broadcast campaigns launched yet. Start your first promotional broadcast above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2.5 px-3 font-semibold">Campaign Name</th>
                    <th className="py-2.5 px-3 font-semibold">Segment</th>
                    <th className="py-2.5 px-3 font-semibold">Recipients</th>
                    <th className="py-2.5 px-3 font-semibold">Sent / Failed</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Date</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {campaignHistory.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">{c.name}</td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="capitalize text-[11px]">
                          {c.segment}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 font-semibold">{c.total_recipients}</td>
                      <td className="py-3 px-3">
                        <span className="text-emerald-600 font-medium">{c.sent_count} sent</span>
                        {c.failed_count > 0 && (
                          <span className="text-destructive ml-1.5">({c.failed_count} failed)</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant={
                            c.status === "completed"
                              ? "outline"
                              : c.status === "sending"
                              ? "default"
                              : c.status === "paused"
                              ? "secondary"
                              : "destructive"
                          }
                          className="capitalize text-[11px]"
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-GB")}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {(c.status === "paused" || c.status === "draft") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              setActiveCampaign(c);
                              fetchCampaignDetails(c.id);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <Play className="h-3 w-3" /> Resume
                          </Button>
                        )}
                        {c.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setActiveCampaign(c);
                              fetchCampaignDetails(c.id);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            View Report
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
