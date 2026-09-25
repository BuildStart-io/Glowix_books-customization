import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Send,
  MessageCircle,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Sparkles,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  secondary_phone?: string | null;
  whatsapp_phone: string | null;
  district: string | null;
  customer_address: string | null;
  order_items: unknown;
  special_instructions: string | null;
  payment_method: string;
  status: string;
  total_amount: number;
  is_preorder: boolean;
  waybill_number?: string | null;
  waybill_updated_at?: string | null;
  waybill_sent_at?: string | null;
  created_at: string;
}

interface SendWaybillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orders: Order[];
  preSelectedOrderId?: string | null;
}

const DEFAULT_TEMPLATE = `✨ *GLOWIX BOOKS - ORDER DISPATCHED* 🚚

Dear {customer_name},

Ungaloda Glowix Books order confirm aagi courier la dispatch panniyachu! 📦✨

🚚 *Waybill / Tracking No:* {waybill_number}
🔖 *Order ID:* #{order_id}
💵 *Amount to Pay:* LKR {total_amount}

Ungaloda package 2-3 business days kulla ungalukku deliver aagidum. Courier rider delivery ku call pannuvanga, please stay reachable.

Thank you for choosing Glowix Books! 💖`;

function formatWhatsAppNumber(phone: string): string {
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) {
    return "94" + digits.slice(1);
  }
  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    return "94" + digits;
  }
  return digits;
}

export default function SendWaybillModal({
  isOpen,
  onClose,
  onSuccess,
  orders,
  preSelectedOrderId,
}: SendWaybillModalProps) {
  const { toast } = useToast();

  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [showAlreadySent, setShowAlreadySent] = useState<boolean>(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);

  // Sending State
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendProgress, setSendProgress] = useState<number>(0);
  const [currentSendingName, setCurrentSendingName] = useState<string>("");

  // Orders that have a waybill assigned
  const waybillOrders = useMemo(() => {
    return orders.filter((o) => Boolean(o.waybill_number && o.waybill_number.trim()));
  }, [orders]);

  // Filter based on whether user wants to see unsent only or all
  const filteredOrders = useMemo(() => {
    if (preSelectedOrderId) {
      return waybillOrders.filter((o) => o.id === preSelectedOrderId);
    }
    if (showAlreadySent) {
      return waybillOrders;
    }
    // Only pending / unsent
    return waybillOrders.filter((o) => !o.waybill_sent_at);
  }, [waybillOrders, showAlreadySent, preSelectedOrderId]);

  // Auto-select pending orders upon opening
  useEffect(() => {
    if (isOpen) {
      if (preSelectedOrderId) {
        setSelectedOrderIds(new Set([preSelectedOrderId]));
        setPreviewOrderId(preSelectedOrderId);
      } else {
        const pendingIds = waybillOrders
          .filter((o) => !o.waybill_sent_at && o.whatsapp_phone)
          .map((o) => o.id);
        setSelectedOrderIds(new Set(pendingIds));
        setPreviewOrderId(pendingIds[0] || waybillOrders[0]?.id || null);
      }
    }
  }, [isOpen, waybillOrders, preSelectedOrderId]);

  const toggleSelectAll = () => {
    const selectable = filteredOrders.filter((o) => Boolean(o.whatsapp_phone));
    if (selectedOrderIds.size === selectable.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(selectable.map((o) => o.id)));
    }
  };

  const toggleSelectOrder = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOrderIds(next);
    setPreviewOrderId(id);
  };

  // Preview message generator
  const activePreviewOrder = useMemo(() => {
    return (
      filteredOrders.find((o) => o.id === previewOrderId) ||
      filteredOrders[0] ||
      null
    );
  }, [filteredOrders, previewOrderId]);

  const renderedPreviewMessage = useMemo(() => {
    if (!activePreviewOrder) return "Select an order to preview message";
    return template
      .replace(/{customer_name}/g, activePreviewOrder.customer_name || "Customer")
      .replace(/{waybill_number}/g, activePreviewOrder.waybill_number || "N/A")
      .replace(/{order_id}/g, activePreviewOrder.id.slice(0, 8))
      .replace(
        /{total_amount}/g,
        Number(activePreviewOrder.total_amount || 0).toLocaleString()
      );
  }, [template, activePreviewOrder]);

  // Execute Sending Process
  const handleSendWaybills = async () => {
    const ordersToSend = filteredOrders.filter((o) => selectedOrderIds.has(o.id));
    if (ordersToSend.length === 0) {
      toast({
        title: "No orders selected",
        description: "Please select at least one order to notify.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    setSendProgress(0);

    try {
      // 1. Fetch user's active WAHA session
      const { data: sessionData } = await supabase
        .from("user_wsender_sessions")
        .select("session_id, session_api_key")
        .limit(1)
        .maybeSingle();

      const sessionApiKey =
        (sessionData as any)?.session_api_key || (sessionData as any)?.session_id || "default";

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < ordersToSend.length; i++) {
        const order = ordersToSend[i];
        setCurrentSendingName(order.customer_name);

        // Target phone MUST be the original WhatsApp chatting number
        const targetPhone = formatWhatsAppNumber(
          order.whatsapp_phone || order.customer_phone
        );

        if (!targetPhone) {
          console.warn(`No valid WhatsApp phone for order ${order.id}`);
          failCount++;
          continue;
        }

        const messageText = template
          .replace(/{customer_name}/g, order.customer_name || "Customer")
          .replace(/{waybill_number}/g, order.waybill_number || "")
          .replace(/{order_id}/g, order.id.slice(0, 8))
          .replace(/{total_amount}/g, Number(order.total_amount || 0).toLocaleString());

        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-Glowix_books`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                to: targetPhone,
                message: messageText,
                sessionApiKey,
              }),
            }
          );

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP ${res.status}`);
          }

          // 2. Mark order as waybill_sent_at in Database to prevent duplicate sends forever
          const now = new Date().toISOString();
          await supabase
            .from("orders")
            .update({
              waybill_sent_at: now,
              // If still pending/processing, transition to shipped as waybill is in customer's hand
              ...(order.status === "pending" || order.status === "processing"
                ? { status: "shipped" }
                : {}),
            })
            .eq("id", order.id);

          successCount++;
        } catch (sendErr: any) {
          console.error(`Failed to send waybill for order ${order.id}:`, sendErr);
          failCount++;
        }

        // Update progress bar
        setSendProgress(Math.round(((i + 1) / ordersToSend.length) * 100));

        // Anti-spam delay between WhatsApp sends (1.2s)
        if (i < ordersToSend.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      toast({
        title: "Waybill Notifications Sent! 🚀",
        description: `Successfully sent tracking to ${successCount} customers via WhatsApp.${
          failCount > 0 ? ` (${failCount} failed)` : ""
        }`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Waybill sending error:", err);
      toast({
        title: "Error sending notifications",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      setCurrentSendingName("");
      setSendProgress(0);
    }
  };

  const pendingCount = waybillOrders.filter((o) => !o.waybill_sent_at).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg text-foreground">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              Send Waybill Tracking via WhatsApp
            </DialogTitle>
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Duplicate Protection Active
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Sends tracking waybills exclusively to the original WhatsApp chat number (<code>whatsapp_phone</code>). Customers who already received their tracking will not be notified again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20 text-xs">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                disabled={isSending || filteredOrders.length === 0}
                className="h-8 text-xs"
              >
                {selectedOrderIds.size === filteredOrders.filter((o) => o.whatsapp_phone).length &&
                filteredOrders.length > 0
                  ? "Deselect All"
                  : "Select All Pending"}
              </Button>
              <span className="text-muted-foreground font-medium">
                Selected: <strong>{selectedOrderIds.size}</strong> of {filteredOrders.length}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-sent"
                  checked={showAlreadySent}
                  onCheckedChange={setShowAlreadySent}
                  disabled={isSending || Boolean(preSelectedOrderId)}
                  className="scale-75"
                />
                <Label htmlFor="show-sent" className="text-xs cursor-pointer text-muted-foreground">
                  Show already sent ({waybillOrders.length - pendingCount})
                </Label>
              </div>
            </div>
          </div>

          {/* MAIN GRID: Left = Orders List, Right = Message Template & Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LEFT: Customer List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Audience Queue ({filteredOrders.length})</span>
                <span className="text-[11px] font-normal">Original WhatsApp Phone</span>
              </div>

              <div className="border rounded-xl max-h-80 overflow-y-auto divide-y bg-card text-xs">
                {filteredOrders.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                    <p className="font-medium text-foreground">All Waybills Already Sent!</p>
                    <p className="text-xs text-muted-foreground">
                      No pending tracking notifications. Turn on "Show already sent" above if you need to resend.
                    </p>
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    const isSelected = selectedOrderIds.has(order.id);
                    const isPreviewed = previewOrderId === order.id;
                    const hasWaPhone = Boolean(order.whatsapp_phone);

                    return (
                      <div
                        key={order.id}
                        onClick={() => setPreviewOrderId(order.id)}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          isPreviewed ? "bg-muted/60" : "hover:bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectOrder(order.id)}
                            disabled={isSending || !hasWaPhone}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                              {order.customer_name}
                              <span className="text-[10px] text-muted-foreground font-mono">
                                #{order.id.slice(0, 8)}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              {hasWaPhone ? (
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {order.whatsapp_phone}
                                </span>
                              ) : (
                                <span className="text-amber-600 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" /> No WhatsApp phone
                                </span>
                              )}
                              <span>•</span>
                              <span className="font-mono font-medium text-foreground">
                                {order.waybill_number}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {order.waybill_sent_at ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Sent {format(new Date(order.waybill_sent_at), "dd/MM")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                            >
                              <Clock className="h-3 w-3 mr-1" /> Pending
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT: Template & Live Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" /> WhatsApp Message Template
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTemplate(DEFAULT_TEMPLATE)}
                  className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-2.5 w-2.5 mr-1" /> Reset Default
                </Button>
              </div>

              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={5}
                disabled={isSending}
                className="text-xs font-mono resize-none"
                placeholder="Type your message template..."
              />

              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5">
                <span>Variables:</span>
                <code className="bg-muted px-1 rounded">{"{customer_name}"}</code>
                <code className="bg-muted px-1 rounded">{"{waybill_number}"}</code>
                <code className="bg-muted px-1 rounded">{"{order_id}"}</code>
                <code className="bg-muted px-1 rounded">{"{total_amount}"}</code>
              </div>

              {/* Real-time WhatsApp Chat Bubble Preview */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Live Preview ({activePreviewOrder?.customer_name || "Sample"}):
                </span>
                <div className="p-3.5 rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground whitespace-pre-wrap font-sans max-h-40 overflow-y-auto leading-relaxed shadow-sm">
                  {renderedPreviewMessage}
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Sending Progress */}
          {isSending && (
            <div className="p-4 rounded-xl border bg-muted/40 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  Sending to: <strong>{currentSendingName}</strong>
                </span>
                <span className="font-mono text-emerald-600">{sendProgress}%</span>
              </div>
              <Progress value={sendProgress} className="h-2 bg-muted" />
              <p className="text-[11px] text-muted-foreground">
                Safe anti-spam rate limiter active (1.2s delay between messages).
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectedOrderIds.size > 0 && !isSending && (
              <span>
                Ready to send tracking to <strong>{selectedOrderIds.size}</strong> customers via WhatsApp.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSending}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSendWaybills}
              disabled={selectedOrderIds.size === 0 || isSending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isSending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending Notifications...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send {selectedOrderIds.size} Waybill Notifications
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
