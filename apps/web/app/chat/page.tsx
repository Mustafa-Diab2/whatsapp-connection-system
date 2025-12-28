"use client";
// Last Updated: Fix structure and features


import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { encodeId, decodeId } from "../../lib/obfuscator";

type Status = "idle" | "initializing" | "waiting_qr" | "ready" | "error" | "disconnected";

type ChatItem = { id: string; name: string; isGroup: boolean; unreadCount: number; customer_id?: string; customer?: any };
type MessageItem = { id: string; body: string; fromMe: boolean; timestamp: number; author?: string; senderName?: string | null; type?: string; from?: string; to?: string; ack?: number; hasMedia?: boolean };
type QuickReply = { id: string; title: string; body: string; shortcut?: string };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || apiBase;

const statusLabels: Record<Status, string> = {
  idle: "غير متصل",
  initializing: "جاري التهيئة",
  waiting_qr: "بانتظار QR",
  ready: "متصل",
  error: "خطأ",
  disconnected: "منفصل",
};

const statusColors: Record<Status, string> = {
  idle: "bg-slate-200 text-slate-700",
  initializing: "bg-blue-100 text-blue-700",
  waiting_qr: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  disconnected: "bg-slate-200 text-slate-700",
};

// Helper to get auth token
const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Helper for author colors in groups
const getAuthorColor = (authorId?: string) => {
  if (!authorId) return "text-slate-600";
  const colors = [
    "text-blue-600", "text-purple-600", "text-emerald-600",
    "text-orange-600", "text-pink-600", "text-indigo-600",
    "text-cyan-600", "text-rose-600"
  ];
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) {
    hash = authorId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const formatFriendlyTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `أمس ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Component to render media
function WhatsAppMedia({ clientId, messageId, type }: { clientId: string, messageId: string, type?: string }) {
  const [mediaData, setMediaData] = useState<{ mimetype: string; data: string; filename?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadMedia() {
      try {
        const res = await fetch(`${apiBase}/whatsapp/media/${clientId}/${messageId}`, {
          headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setMediaData(data);
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadMedia();
  }, [clientId, messageId]);

  if (loading) return <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-slate-100"><span className="animate-pulse text-xs text-slate-400">جاري تحميل الوسائط...</span></div>;
  if (error) return <div className="rounded-lg bg-red-50 p-2 text-[10px] text-red-500">فشل تحميل الوسائط</div>;
  if (!mediaData) return null;

  if (mediaData.mimetype.startsWith('image/')) {
    return <img src={`data:${mediaData.mimetype};base64,${mediaData.data}`} className="max-h-64 w-full cursor-pointer rounded-lg object-contain transition-transform hover:scale-[1.02]" alt="رسالة وسائط" onClick={() => window.open(`data:${mediaData.mimetype};base64,${mediaData.data}`, '_blank')} />;
  }

  if (mediaData.mimetype.startsWith('video/')) {
    return <video src={`data:${mediaData.mimetype};base64,${mediaData.data}`} controls className="max-h-64 w-full rounded-lg" />;
  }

  if (mediaData.mimetype.startsWith('audio/')) {
    return <audio src={`data:${mediaData.mimetype};base64,${mediaData.data}`} controls className="w-full max-w-[200px]" />;
  }

  return (
    <a
      href={`data:${mediaData.mimetype};base64,${mediaData.data}`}
      download={mediaData.filename || 'document'}
      className="flex items-center gap-2 rounded-lg bg-slate-100 p-2 text-xs transition-colors hover:bg-slate-200"
    >
      <span className="text-xl">📄</span>
      <div className="overflow-hidden">
        <p className="truncate font-medium">{mediaData.filename || 'ملف مستند'}</p>
        <p className="text-[10px] text-slate-500 uppercase">{mediaData.mimetype.split('/')[1]}</p>
      </div>
    </a>
  );
}

export default function ChatPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const initialChatEncoded = searchParams.get("c");
  const [clientId, setClientId] = useState<string>("default"); // Start with default, update on mount
  const socketRef = useRef<Socket | null>(null);
  const selectedChatRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showCustomerPanel, setShowCustomerPanel] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [selectedStory, setSelectedStory] = useState<any>(null);
  const [newTag, setNewTag] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [updatingCustomer, setUpdatingCustomer] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingTimerRef = useRef<any>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const currentChatObj = useMemo(() => chats.find(c => c.id === selectedChat), [chats, selectedChat]);

  // Keep ref in sync with state for socket callback
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Load Organization ID
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const orgId = user.organization_id || user.organizationId;
        if (orgId) {
          setClientId(orgId);
          console.log("[Chat] Using Organization ID:", orgId);
        }
      } catch (e) {
        console.error("Failed to parse user", e);
      }
    }
  }, []);

  // Handle Initial Chat from URL
  useEffect(() => {
    if (initialChatEncoded) {
      const decoded = decodeId(initialChatEncoded);
      if (decoded) {
        setSelectedChat(decoded);
      }
    }
  }, [initialChatEncoded]);

  // Update URL when selectedChat changes
  useEffect(() => {
    if (selectedChat) {
      const encoded = encodeId(selectedChat);
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", encoded);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else if (searchParams.has("c")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("c");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [selectedChat, pathname, router, searchParams]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const statusBadge = useMemo(() => statusLabels[status], [status]);

  // Socket.io connection for real-time updates
  useEffect(() => {
    if (clientId === "default") return;

    const token = localStorage.getItem("token");
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: { token }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
      socket.emit("wa:subscribe", { clientId });
    });

    socket.on("wa:state", (data: any) => {
      console.log("State update:", data);
      if (data.status) {
        setStatus(data.status as Status);
      }
    });

    socket.on("wa:message", (data: any) => {
      console.log("New message received:", data);
      if (data.message) {
        const msg = data.message;
        const currentChat = selectedChatRef.current;

        // Check if message belongs to currently viewed chat
        const belongsToChat = currentChat && (
          msg.from === currentChat ||
          msg.to === currentChat ||
          (msg.from && currentChat.includes(msg.from.split('@')[0])) ||
          (msg.from && msg.from.includes(currentChat.split('@')[0]))
        );

        console.log("Current chat:", currentChat, "Message from:", msg.from, "Belongs:", belongsToChat);

        if (belongsToChat) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              body: msg.body,
              fromMe: msg.fromMe,
              timestamp: msg.timestamp,
              type: msg.type,
              from: msg.from,
              to: msg.to,
              author: msg.author,
              senderName: msg.senderName,
              ack: msg.ack,
              hasMedia: msg.hasMedia,
            }];
          });
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [clientId]);

  const fetchCustomerData = async (phone: string) => {
    try {
      const res = await fetch(`${apiBase}/api/customers/phone/${phone}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data.customer);
        setNewNotes(data.customer.notes || "");
      } else {
        setSelectedCustomer(null);
        setNewNotes("");
      }
    } catch (e) {
      console.error("Failed to fetch customer", e);
      setSelectedCustomer(null);
    }
  };

  const updateCustomerTags = async (tags: string[]) => {
    if (!selectedCustomer) return;
    setUpdatingCustomer(true);
    try {
      const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ tags })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data.customer);
      }
    } catch (e) {
      console.error("Failed to update tags", e);
    } finally {
      setUpdatingCustomer(false);
    }
  };

  const updateCustomerNotes = async (notes: string) => {
    if (!selectedCustomer) return;
    setUpdatingCustomer(true);
    try {
      const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data.customer || data);
        alert("تم حفظ الملاحظات بنجاح");
      }
    } finally {
      setUpdatingCustomer(false);
    }
  };

  const fetchStories = useCallback(async () => {
    if (clientId === "default" || status !== "ready") return;
    setLoadingStories(true);
    try {
      const res = await fetch(`${apiBase}/whatsapp/stories`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setStories(data.stories || []);
    } catch (err) {
      console.error("Failed to fetch stories", err);
    } finally {
      setLoadingStories(false);
    }
  }, [clientId, status]);

  const fetchQuickReplies = useCallback(async () => {
    if (clientId === "default") return;
    try {
      const res = await fetch(`${apiBase}/api/quick-replies`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setQuickReplies(data.replies || []);
    } catch (e) {
      console.error("Failed to fetch quick replies", e);
    }
  }, [clientId]);

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  const fetchStatus = useCallback(async () => {
    if (clientId === "default") return;
    try {
      const res = await fetch(`${apiBase}/whatsapp/status/${clientId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setStatus(data.status as Status);
    } catch (err) {
      console.error("Fetch status error", err);
      setStatus("error");
      // setErrorMsg("تعذر جلب حالة الاتصال"); // Don't show error immediately on init
    }
  }, [clientId]);

  const fetchChats = useCallback(async () => {
    if (clientId === "default") return;
    setLoadingChats(true);
    setErrorMsg(null);
    try {
      // API endpoints now use token for auth/orgId
      const res = await fetch(`${apiBase}/whatsapp/chats`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error("تعذر جلب المحادثات");
      const data = await res.json();
      setChats(data.chats || []);
      if (data.chats?.length && !selectedChat) {
        setSelectedChat(data.chats[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "فشل تحميل المحادثات");
    } finally {
      setLoadingChats(false);
    }
  }, [selectedChat, clientId]);

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }, [chats, searchQuery]);

  const selectedChatName = useMemo(() => {
    return chats.find(c => c.id === selectedChat)?.name || selectedChat?.split('@')[0] || "المحادثة";
  }, [chats, selectedChat]);

  const fetchMessages = useCallback(
    async (chatId: string, limit = 50) => {
      if (clientId === "default" || status !== "ready") return;
      setLoadingMessages(true);
      setErrorMsg(null);
      try {
        // API endpoints now use token for auth/orgId
        const res = await fetch(`${apiBase}/whatsapp/messages/${chatId}?limit=${limit}`, {
          headers: getAuthHeaders()
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "تعذر جلب الرسائل");
        }
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err: any) {
        setErrorMsg(err?.message || "فشل تحميل الرسائل");
      } finally {
        setLoadingMessages(false);
      }
    },
    [clientId, status]
  );

  const loadMore = useCallback(() => {
    if (selectedChat) {
      fetchMessages(selectedChat, messages.length + 50);
    }
  }, [selectedChat, messages.length, fetchMessages]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status === "ready") {
      void fetchChats();
      void fetchStories();
    }
  }, [status, fetchChats, fetchStories]);

  useEffect(() => {
    if (selectedChat && status === "ready") {
      void fetchMessages(selectedChat);
      // Find customer info
      const chat = chats.find(c => c.id === selectedChat);
      if (chat?.customer) {
        setSelectedCustomer(chat.customer);
      } else {
        setSelectedCustomer(null);
      }
    }
  }, [selectedChat, status, fetchMessages, chats]);

  const handleSend = useCallback(async () => {
    if (!selectedChat || !messageInput.trim() || clientId === "default") return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/whatsapp/send`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          clientId,
          chatId: selectedChat,
          message: messageInput.trim(),
          quotedMessageId: replyingTo?.id
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "تعذر إرسال الرسالة");
      }
      setMessageInput("");
      setReplyingTo(null);
      // Don't refetch - wait for socket event or add optimistically
    } catch (err: any) {
      setErrorMsg(err?.message || "فشل إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }, [selectedChat, messageInput, clientId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          await fetch(`${apiBase}/whatsapp/send-media`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({
              clientId,
              chatId: selectedChat,
              base64,
              mimetype: 'audio/ogg',
              filename: 'voice-message.ogg'
            })
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (e) {
      console.error("Mic access denied", e);
      setErrorMsg("يجب السماح بالوصول للميكروفون لتسجيل الرسائل الصوتية");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null; // Don't send
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
    }
  };

  const sendLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg("متصفحك لا يدعم مشاركة الموقع");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

      try {
        await fetch(`${apiBase}/whatsapp/send`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            clientId,
            chatId: selectedChat,
            message: `📍 موقعي الحالي: ${googleMapsUrl}`
          })
        });
      } catch (e) {
        setErrorMsg("فشل إرسال الموقع");
      }
    }, () => {
      setErrorMsg("تم رفض الوصول للموقع");
    });
  };

  const useQuickReply = (body: string) => {
    setMessageInput(body);
    setShowQuickReplies(false);
  };


  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojis, setShowEmojis] = useState(false);

  // New Chat State
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const emojis = ["😀", "😂", "🥰", "😎", "🤔", "😭", "😡", "👍", "👎", "👏", "🙏", "❤️", "💔", "🔥", "✨", "🎉", "📅", "✅", "❌", "👋"];

  const handleStartChat = async () => {
    if (!newPhone) return;
    // Basic validation
    const cleanPhone = newPhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      alert("من فضلك أدخل رقم صحيح مع كود الدولة");
      return;
    }
    const chatId = `${cleanPhone}@c.us`;

    // Check if chat exists in local list, if not, we can force select it
    // The chat list update will happen on next sync or message
    setSelectedChat(chatId);
    setShowNewChatModal(false);
    setNewPhone("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat || clientId === "default") return;

    setSending(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Full = reader.result as string;
        const base64 = base64Full.split(',')[1];

        const res = await fetch(`${apiBase}/whatsapp/send-media`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            clientId,
            chatId: selectedChat,
            base64,
            mimetype: file.type,
            filename: file.name,
            caption: messageInput.trim() // Optional caption
          }),
        });

        if (!res.ok) throw new Error("فشل إرسال الملف");
        setMessageInput("");
      } catch (err: any) {
        setErrorMsg(err.message || "فشل رفع الملف");
      } finally {
        setSending(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteMessage = async (msgId: string, everyone: boolean) => {
    if (!confirm(everyone ? "هل تريد حذف الرسالة لدى الجميع؟" : "هل تريد حذف الرسالة لديك فقط؟")) return;
    try {
      await fetch(`${apiBase}/whatsapp/delete-message`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId, messageId: msgId, everyone })
      });
      // Remove from UI optimistically
      setMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (e) {
      alert("فشل حذف الرسالة");
    }
  };

  const handleMessageInfo = async (msgId: string) => {
    try {
      const res = await fetch(`${apiBase}/whatsapp/message-info/${msgId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.ok && data.info) {
        const readCount = data.info.read?.length || 0;
        const deliveryCount = data.info.delivery?.length || 0;
        alert(`تقرير الرسالة:\n👀 تمت القراءة بواسطة: ${readCount}\n📩 تم الاستلام بواسطة: ${deliveryCount}`);
      }
    } catch (e) { console.error(e); }
  };

  const handleCreateCustomer = async () => {
    if (!currentChatObj || !selectedChat) return;
    setUpdatingCustomer(true);
    try {
      // Use the phone number provided by the server (which we improved with realPhone logic)
      // Fallback to JID split only if absolutely necessary
      const phone = (currentChatObj as any).phone || selectedChat.split('@')[0];
      const res = await fetch(`${apiBase}/api/customers`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: currentChatObj.name || phone,
          phone: phone,
          status: 'active'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedCustomer(data.customer);
        // Update local chat list to link customer
        setChats(prev => prev.map(c => c.id === selectedChat ? { ...c, customer: data.customer, customer_id: data.customer.id } : c));
      } else {
        const err = await res.json();
        setErrorMsg(err.message || "فشل إنشاء الملف");
        setTimeout(() => setErrorMsg(null), 3000);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("خطأ في الاتصال بالسيرفر");
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setUpdatingCustomer(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-0 md:p-2 h-full">
      {/* Connection Warning */}
      {status !== "ready" && (
        <div className="mx-4 md:mx-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-bold flex items-center gap-2 shadow-sm shrink-0">
          <span>⚠️</span>
          حالة الاتصال: {statusLabels[status]}. تأكد من إتمام الاتصال في صفحة واتساب.
        </div>
      )}

      {/* Main Layout Context */}
      <div className="flex h-[calc(100vh-140px)] min-h-[450px] gap-4 relative overflow-hidden">

        {/* 1. Chat List Column */}
        <div className={`
          flex-col card overflow-hidden transition-all duration-300 bg-white
          ${selectedChat ? 'hidden lg:flex lg:w-[350px]' : 'flex w-full lg:w-[380px]'}
        `}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 shrink-0 bg-slate-50/50">
            <h3 className="font-black text-slate-800 text-lg">المحادثات</h3>
            <div className="flex gap-2">
              <button
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-brand-blue hover:bg-blue-50 hover:shadow-md transition-all font-black text-lg"
                onClick={() => setShowNewChatModal(true)}
                title="محادثة جديدة"
              >
                +
              </button>
              <button
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white border border-slate-100 text-slate-500 hover:text-brand-blue hover:shadow-md transition-all"
                onClick={fetchStories}
                disabled={loadingStories || status !== "ready"}
                title="تحديث الحالات"
              >
                🎥
              </button>
              <button
                className="h-9 px-4 text-xs font-black bg-brand-blue text-white rounded-xl shadow-sm hover:shadow-md hover:bg-blue-700 transition-all disabled:opacity-50"
                onClick={fetchChats}
                disabled={loadingChats || status !== "ready"}
              >
                تحديث
              </button>
            </div>
          </div>

          {/* Stories Horizontal List */}
          {stories.length > 0 && (
            <div className="flex items-center gap-4 overflow-x-auto border-b border-slate-100 bg-white p-4 no-scrollbar scroll-smooth shrink-0 min-h-[100px]">
              {stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => setSelectedStory(story)}
                  className="flex shrink-0 flex-col items-center gap-2 group w-14"
                >
                  <div className="relative rounded-full border-2 border-brand-blue p-[2px] transition-all group-hover:scale-110 group-active:scale-95 ring-offset-2 ring-transparent group-hover:ring-blue-100 ring-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-[11px] font-black text-brand-blue border border-white overflow-hidden">
                      {story.senderName?.split(' ')[0]?.slice(0, 2).toUpperCase() || "WA"}
                    </div>
                    {story.hasMedia && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue text-[10px] text-white ring-2 ring-white">
                        🎥
                      </span>
                    )}
                  </div>
                  <span className="w-full truncate text-[10px] font-black text-slate-600 text-center">
                    {story.senderName || "حالة"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Search Area */}
          <div className="px-4 py-4 border-b border-slate-100 shrink-0">
            <div className="relative group">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-blue transition-colors">🔍</span>
              <input
                type="text"
                placeholder="ابحث عن المحادثات أو الأرقام..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 pl-4 pr-11 py-3 text-sm outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue/30 focus:bg-white transition-all font-bold"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Chat Items List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
            {loadingChats && (
              <div className="space-y-4 p-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="h-12 w-12 rounded-full bg-slate-100 shrink-0"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-1/3 bg-slate-100 rounded"></div>
                      <div className="h-2 w-1/2 bg-slate-50 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loadingChats && filteredChats.length === 0 && (
              <div className="p-12 text-center flex flex-col items-center gap-3">
                <div className="text-4xl opacity-20">🏝️</div>
                <p className="text-xs text-slate-400 font-black">
                  {searchQuery ? "لم نعثر على أي نتائج" : "لا يوجد محادثات حالياً"}
                </p>
              </div>
            )}
            <ul className="divide-y divide-slate-50">
              {filteredChats.map((chat) => {
                const active = chat.id === selectedChat;
                const initials = chat.name.slice(0, 2).toUpperCase();

                return (
                  <li
                    key={chat.id}
                    className={`group relative cursor-pointer px-5 py-4 transition-all duration-200 ${active ? "bg-blue-50/60 border-r-4 border-brand-blue" : "hover:bg-slate-50 border-r-4 border-transparent"}`}
                    onClick={() => setSelectedChat(chat.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-black text-white shadow-sm transition-all group-hover:rounded-xl ${active ? "bg-brand-blue shadow-blue-200" : "bg-slate-200"}`}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate text-sm font-black transition-colors ${active ? "text-brand-blue" : "text-slate-800"}`}>
                            {chat.name}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-lg bg-red-500 px-1.5 text-[9px] font-black text-white shadow-sm animate-bounce">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`h-2 w-2 rounded-full ${chat.isGroup ? "bg-amber-400" : "bg-emerald-400"}`}></span>
                          <p className="truncate text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {chat.isGroup ? "Group" : "Personal"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* 2. Chat Area Column */}
        <div className={`
          flex-1 flex-col card overflow-hidden relative bg-white border-0 shadow-2xl transition-all duration-300
          ${!selectedChat ? 'hidden lg:flex' : 'flex'}
        `}>
          {/* Messages Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-md shrink-0 z-20">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => setSelectedChat(null)}
                className="lg:hidden h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
              >
                ➡️
              </button>

              {selectedChat && (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 font-black text-brand-blue border border-blue-200/50 shadow-sm">
                  {selectedChatName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                {selectedChat && selectedCustomer ? (
                  <Link
                    href={`/contact-profile/${selectedCustomer.id}`}
                    className="truncate text-[15px] font-black text-slate-900 leading-tight hover:text-brand-blue transition-colors cursor-pointer block"
                  >
                    {selectedChatName}
                  </Link>
                ) : (
                  <p className="truncate text-[15px] font-black text-slate-900 leading-tight">
                    {selectedChat ? selectedChatName : "مرحبا بك في المحادثات"}
                  </p>
                )}
                {selectedChat && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`h-2 w-2 rounded-full ${status === 'ready' ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                      {status === 'ready' ? "Online now" : "Offline"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {selectedChat && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}${pathname}?c=${encodeId(selectedChat)}`;
                    navigator.clipboard.writeText(url);
                    alert("تم نسخ رابط المحادثة المشفر بنجاح!");
                  }}
                  className="hidden sm:flex h-9 px-4 rounded-xl text-[11px] font-black items-center gap-2 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all border border-slate-200"
                >
                  🔗 رابط مشفر
                </button>
              )}
              <button
                className={`h-11 w-11 flex items-center justify-center rounded-2xl transition-all ${showCustomerPanel ? 'bg-brand-blue text-white shadow-lg shadow-blue-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/50'}`}
                onClick={() => setShowCustomerPanel(!showCustomerPanel)}
                disabled={!selectedChat}
              >
                👤
              </button>
            </div>
          </div>

          {/* Messages Feed Area */}
          <div className="flex-1 overflow-y-auto bg-[#fafbfc] p-4 md:p-6 custom-scrollbar relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#005cf7 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

            {loadingMessages && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="h-10 w-10 border-4 border-brand-blue border-t-transparent animate-spin rounded-full"></div>
                <p className="text-sm font-black text-slate-400 italic">جاري تحميل صندوق الرسائل...</p>
              </div>
            )}

            {!loadingMessages && !selectedChat && (
              <div className="flex flex-col items-center justify-center h-full text-center p-10 space-y-6">
                <div className="text-8xl animate-bounce">💬</div>
                <div className="max-w-xs space-y-2">
                  <h4 className="text-xl font-black text-slate-800">ابدأ الدردشة الآن</h4>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed">قم باختيار أحد المحادثات من القائمة الجانبية لبدء التواصل مع عملائك عبر الواتساب</p>
                </div>
              </div>
            )}

            {!loadingMessages && selectedChat && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-30 gap-3">
                <div className="text-6xl">📥</div>
                <p className="text-[11px] font-black uppercase tracking-widest">No messages found here</p>
              </div>
            )}

            <div className="space-y-6 max-w-4xl mx-auto">
              {messages.length >= 50 && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMessages}
                    className="text-[11px] font-black text-brand-blue bg-white border-2 border-blue-50 px-6 py-2 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-100 transition-all active:scale-95"
                  >
                    🔄 تحميل الرسائل السابقة
                  </button>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex w-full group/msg relative ${msg.fromMe ? "justify-start flex-row-reverse" : "justify-start flex-row"}`}
                >
                  {/* Message Actions (Hidden by default, shown on hover) */}
                  <div className={`absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 bg-white shadow-sm border border-slate-100 rounded-lg p-1 z-10 ${msg.fromMe ? "right-full mr-2" : "left-full ml-2"}`}>
                    <button onClick={() => setReplyingTo(msg)} className="p-1.5 hover:bg-slate-50 rounded text-[10px] text-slate-500" title="رد">↩️</button>
                    {msg.fromMe && (
                      <>
                        <button onClick={() => handleMessageInfo(msg.id)} className="p-1.5 hover:bg-slate-50 rounded text-[10px] text-slate-500" title="معلومات">ℹ️</button>
                        <button onClick={() => handleDeleteMessage(msg.id, true)} className="p-1.5 hover:bg-red-50 rounded text-[10px] text-red-500" title="حذف للجميع">🗑️</button>
                      </>
                    )}
                  </div>
                  <div className={`flex flex-col max-w-[88%] sm:max-w-[75%] ${msg.fromMe ? "items-end text-right" : "items-start text-left"}`}>
                    <div
                      className={`relative rounded-3xl px-5 py-3.5 text-sm shadow-sm transition-all hover:shadow-md ${msg.fromMe
                        ? "bg-brand-blue text-white rounded-tr-none"
                        : "bg-white text-slate-800 rounded-tl-none border border-slate-100"
                        }`}
                    >
                      {msg.author && !msg.fromMe && (
                        <div className="mb-1.5">
                          <span className={`text-[10px] font-black tracking-widest uppercase ${getAuthorColor(msg.author)}`}>
                            {msg.senderName || msg.author.split('@')[0]}
                          </span>
                        </div>
                      )}

                      {msg.hasMedia && (
                        <div className="mb-3 overflow-hidden rounded-2xl border border-black/5 shadow-inner">
                          <WhatsAppMedia clientId={clientId} messageId={msg.id} type={msg.type} />
                        </div>
                      )}

                      <p className="whitespace-pre-wrap leading-relaxed text-[13px] font-medium selection:bg-blue-200">
                        {msg.body || (msg.hasMedia ? "" : <span className="text-[10px] opacity-40 italic">رسالة غير مدعومة</span>)}
                      </p>

                      <div className={`mt-2 flex items-center justify-end gap-2 text-[9px] ${msg.fromMe ? "text-blue-100" : "text-slate-400"}`}>
                        <span className="font-black tracking-tight">{formatFriendlyTime(msg.timestamp)}</span>
                        {msg.fromMe && (
                          <span className={`${msg.ack === 3 ? "text-blue-300" : "text-slate-300"}`}>
                            {msg.ack === 0 ? "🕒" : msg.ack === 1 ? "✓" : "✓✓"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Messages Input Area */}
          <div className="bg-white border-t border-slate-100 p-4 md:p-6 shrink-0 relative z-10">
            {errorMsg && (
              <div className="absolute bottom-full left-6 right-6 mb-4 rounded-xl border-l-4 border-red-500 bg-red-50/80 backdrop-blur-sm px-4 py-3 text-xs text-red-800 font-black shadow-xl animate-in slide-in-from-bottom-4 duration-300">
                {errorMsg}
              </div>
            )}

            {/* Floating Popovers */}
            {showEmojis && (
              <div className="absolute bottom-[calc(100%-8px)] left-6 bg-white shadow-2xl border border-slate-100 rounded-2xl p-4 grid grid-cols-6 gap-2 z-30 w-72 animate-in zoom-in-90 slide-in-from-bottom-2 duration-200">
                {emojis.map(e => (
                  <button key={e} onClick={() => { setMessageInput(p => p + e); setShowEmojis(false); }} className="text-xl hover:bg-slate-50 p-2 rounded-xl transition-all hover:scale-125 active:scale-90">{e}</button>
                ))}
              </div>
            )}

            {showQuickReplies && (
              <div className="absolute bottom-[calc(100%-8px)] right-6 w-[300px] sm:w-[350px] bg-white shadow-2xl border border-slate-100 rounded-2xl overflow-hidden z-30 animate-in zoom-in-90 slide-in-from-bottom-2 duration-200">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 text-right">
                  <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">الردود السريعة</span>
                </div>
                <div className="max-h-60 overflow-y-auto p-2 custom-scrollbar">
                  {quickReplies.length === 0 ? (
                    <p className="p-8 text-center text-xs text-slate-400 font-bold italic">لا يوجد ردود مضافة بعد</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1">
                      {quickReplies.map(qr => (
                        <button key={qr.id} onClick={() => useQuickReply(qr.body)} className="flex flex-col items-start gap-1 rounded-xl p-3 text-right bg-white hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-all">
                          <span className="text-xs font-black text-brand-blue">{qr.title}</span>
                          <span className="line-clamp-2 text-[10px] font-bold text-slate-500 leading-normal">{qr.body}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}


            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <button onClick={() => setShowQuickReplies(!showQuickReplies)} className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${showQuickReplies ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>⚡ الردود</button>
                <button onClick={() => fileInputRef.current?.click()} className="shrink-0 px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] font-black">📎 ملفات</button>
                <button onClick={sendLocation} className="shrink-0 px-4 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] font-black">📍 الموقع</button>
                <button onClick={() => setShowEmojis(!showEmojis)} className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-black transition-all ${showEmojis ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>😊 فيسات</button>
              </div>

              {/* Reply Preview */}
              {replyingTo && (
                <div className="flex items-center justify-between bg-slate-50 border-l-4 border-brand-blue rounded-r-xl p-3 animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col text-xs">
                    <span className="font-bold text-brand-blue mb-0.5">الرد على: {replyingTo.senderName || replyingTo.author?.split('@')[0] || "مرسل"}</span>
                    <span className="text-slate-500 line-clamp-1">{replyingTo.body || "ملف وسائط"}</span>
                  </div>
                  <button onClick={() => setReplyingTo(null)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500">✕</button>
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="relative flex-1 group">
                  <textarea
                    className={`w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-3.5 text-sm outline-none focus:ring-4 focus:ring-brand-blue/5 focus:border-brand-blue/30 focus:bg-white transition-all font-bold resize-none custom-scrollbar min-h-[56px] ${replyingTo ? 'rounded-tl-none' : ''}`}
                    rows={1}
                    placeholder="اكتب رسالتك للعميل هنا..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                    disabled={!selectedChat || status !== "ready"}
                  />
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                </div>

                {isRecording ? (
                  <div className="flex items-center gap-3 h-[56px] px-4 rounded-2xl bg-red-50 border-2 border-red-100 text-red-600 animate-pulse transition-all">
                    <span className="font-mono font-black text-sm">{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
                    <button onClick={cancelRecording} className="h-8 px-3 rounded-lg hover:bg-red-100 text-[10px] font-black uppercase">إلغاء</button>
                    <button onClick={stopRecording} className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-200 hover:scale-110 active:scale-90 transition-all">⏹️</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {messageInput.trim() ? (
                      <button onClick={handleSend} className="h-[56px] w-[56px] flex items-center justify-center rounded-2xl bg-brand-blue text-white shadow-xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all">
                        <span className="text-xl">🚀</span>
                      </button>
                    ) : (
                      <button onClick={startRecording} disabled={!selectedChat || status !== "ready"} className="h-[56px] w-[56px] flex items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-blue-50 hover:text-brand-blue transition-all active:scale-95">
                        <span className="text-xl">🎤</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Customer Sidebar Component */}
        <div className={`
          fixed inset-y-0 left-0 z-[60] flex h-full flex-col overflow-hidden bg-white shadow-[0_0_60px_-15px_rgba(0,0,0,0.3)] transition-all duration-500 ease-in-out
          ${showCustomerPanel ? 'w-full sm:w-[400px] translate-x-0' : 'w-0 -translate-x-full'}
          border-r border-slate-100
        `}>
          {showCustomerPanel && (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-6 py-6 border-b border-slate-50 bg-white sticky top-0 z-10">
                <h3 className="text-xl font-black text-slate-800">بيانات العميل</h3>
                <button
                  onClick={() => setShowCustomerPanel(false)}
                  className="h-10 w-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
                >✕</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-10">
                {selectedCustomer ? (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-6 relative">
                        <div className="flex h-28 w-28 items-center justify-center rounded-[40px] bg-slate-50 text-5xl shadow-inner border-2 border-white ring-[12px] ring-slate-50/30">
                          {selectedCustomer.avatar || "👤"}
                        </div>
                        <span className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-xl border-4 border-white ${selectedCustomer.status === 'active' ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                      </div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedCustomer.name}</h3>
                      <p dir="ltr" className="text-[13px] font-black text-slate-400 mt-2 tracking-widest">{selectedCustomer.phone}</p>

                      {/* Profile Link Button */}
                      <Link
                        href={`/contact-profile/${selectedCustomer.id}`}
                        className="mt-4 w-full px-6 py-3 rounded-2xl bg-brand-blue text-white text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                      >
                        📋 عرض الملف الكامل
                      </Link>
                    </div>

                    <div className="space-y-8">
                      {/* Tags Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Tags / الأوسمة</span>
                          <span className="text-[10px] font-black text-slate-300">#{selectedCustomer.tags?.length || 0}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {selectedCustomer.tags?.map((tag: string) => (
                            <span key={tag} className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[10px] font-black text-brand-blue border border-blue-100">
                              {tag}
                              <button onClick={() => updateCustomerTags(selectedCustomer.tags.filter((t: string) => t !== tag))} className="text-xs hover:text-red-500">✕</button>
                            </span>
                          ))}
                          <div className="w-full mt-2">
                            <input
                              type="text"
                              placeholder="إضافة وسم جديد..."
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { updateCustomerTags([...(selectedCustomer.tags || []), newTag.trim()]); setNewTag(''); } }}
                              className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-3 text-xs font-black focus:ring-4 focus:ring-brand-blue/5 outline-none transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Notes Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Notes / ملاحظات</span>
                          <button onClick={() => updateCustomerNotes(newNotes)} className="text-[9px] font-black text-brand-blue hover:underline">حفظ التغييرات</button>
                        </div>
                        <textarea
                          className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-xs font-bold focus:ring-4 focus:ring-brand-blue/5 outline-none transition-all min-h-[120px]"
                          placeholder="اكتب ملاحظاتك عن العميل هنا..."
                          value={newNotes}
                          onChange={(e) => setNewNotes(e.target.value)}
                        />
                      </div>

                      {/* Technical Info */}
                      <div className="space-y-4 bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                        <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-tight">
                          <span className="text-slate-800">{selectedCustomer.source || "غير محدد"}</span>
                          <span className="text-slate-400">Source</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-tight">
                          <span className="text-slate-800">{selectedCustomer.last_contact_at ? new Date(selectedCustomer.last_contact_at).toLocaleDateString() : 'لا يوجد'}</span>
                          <span className="text-slate-400">Last contact</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-6 pt-10">
                    <div className="h-20 w-20 flex items-center justify-center rounded-3xl bg-slate-50 text-3xl">🧩</div>
                    <div className="space-y-2 px-6">
                      <h4 className="text-lg font-black text-slate-800">عميل غير متعرف عليه</h4>
                      <p className="text-xs font-bold text-slate-400 leading-relaxed">لم نتمكن من العثور على ملف تعريف لهذا الرقم في نظام CRM الخاص بك. يمكنك إنشاء ملف جديد الآن.</p>
                      <button
                        onClick={handleCreateCustomer}
                        disabled={updatingCustomer}
                        className="w-full mt-6 rounded-2xl bg-brand-blue py-4 text-xs font-black text-white shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                      >
                        {updatingCustomer ? "جاري الإنشاء..." : "إنشاء ملف عميل جديد"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Overlay Modals */}
      {selectedStory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[40px] bg-[#0f172a] shadow-2xl flex flex-col h-[85vh] border border-white/10">
            <button
              onClick={() => setSelectedStory(null)}
              className="absolute right-6 top-6 z-30 h-12 w-12 flex items-center justify-center rounded-2xl bg-black/40 text-white backdrop-blur-xl border border-white/10 hover:bg-white hover:text-black transition-all active:scale-90"
            >✕</button>

            <div className="flex-1 overflow-hidden flex items-center justify-center bg-black/20">
              {selectedStory.hasMedia ? (
                <div className="w-full">
                  <WhatsAppMedia clientId={clientId} messageId={selectedStory.id} type={selectedStory.type} />
                </div>
              ) : (
                <div className="text-2xl text-white text-center p-12 font-black leading-relaxed">
                  {selectedStory.body}
                </div>
              )}
            </div>

            <div className="bg-[#1e293b]/80 p-8 border-t border-white/5 backdrop-blur-2xl">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-brand-blue flex items-center justify-center text-white font-black text-xl shadow-lg ring-4 ring-white/5">
                  {selectedStory.senderName?.slice(0, 1) || "S"}
                </div>
                <div>
                  <p className="text-base font-black text-white">{selectedStory.senderName || "حالة جديدة"}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{formatFriendlyTime(selectedStory.timestamp)}</p>
                </div>
              </div>
              {selectedStory.body && selectedStory.hasMedia && (
                <div className="mt-6 max-h-32 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-slate-200 font-bold leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/10">{selectedStory.body}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 mb-2">محادثة جديدة</h3>
            <p className="text-xs text-slate-400 font-bold mb-6">أدخل رقم الهاتف مع كود الدولة (بدون +)</p>

            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">📱</span>
                <input
                  type="text"
                  placeholder="مثال: 201000000000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-sm font-black outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all dir-ltr text-left"
                  dir="ltr"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-black text-xs hover:bg-slate-200 transition-all"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleStartChat}
                  className="flex-1 py-3 rounded-xl bg-brand-blue text-white font-black text-xs hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"
                >
                  بدء المحادثة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
