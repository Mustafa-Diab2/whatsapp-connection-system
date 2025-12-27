"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

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
  const [updatingCustomer, setUpdatingCustomer] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingTimerRef = useRef<any>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        body: JSON.stringify({ clientId, chatId: selectedChat, message: messageInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "تعذر إرسال الرسالة");
      }
      setMessageInput("");
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

  const emojis = ["😀", "😂", "🥰", "😎", "🤔", "😭", "😡", "👍", "👎", "👏", "🙏", "❤️", "💔", "🔥", "✨", "🎉", "📅", "✅", "❌", "👋"];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">المحادثات</p>
          <h1 className="text-2xl font-extrabold text-slate-900">صندوق الرسائل</h1>
        </div>
        <div className={`badge ${statusColors[status]}`}>{statusBadge}</div>
      </div>

      {status !== "ready" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          حالة الاتصال: {statusBadge}. تأكد من إتمام الاتصال في صفحة واتساب ثم عد للمحادثات.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="card h-[70vh] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold text-slate-800">المحادثات</h3>
            <div className="flex gap-2">
              <button
                className="btn bg-slate-100 px-3 py-2 text-xs text-slate-700 hover:bg-slate-200"
                onClick={fetchStories}
                disabled={loadingStories || status !== "ready"}
                title="تحديث الحالات"
              >
                🎥
              </button>
              <button
                className="btn bg-slate-100 px-3 py-2 text-xs text-slate-700 hover:bg-slate-200"
                onClick={fetchChats}
                disabled={loadingChats || status !== "ready"}
              >
                تحديث
              </button>
            </div>
          </div>

          {/* Stories Horizontal List */}
          {stories.length > 0 && (
            <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-100 bg-slate-50/50 p-3 no-scrollbar scroll-smooth">
              {stories.map((story) => (
                <button
                  key={story.id}
                  onClick={() => setSelectedStory(story)}
                  className="flex shrink-0 flex-col items-center gap-1 group"
                >
                  <div className="relative rounded-full border-2 border-brand-blue p-[2px] shadow-sm transition-all group-hover:scale-110 group-active:scale-95 group-hover:shadow-md">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[11px] font-extrabold text-brand-blue border border-white">
                      {story.senderName?.split(' ')[0]?.slice(0, 2).toUpperCase() || "WA"}
                    </div>
                    {story.hasMedia && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue text-[10px] text-white ring-2 ring-white">
                        🎥
                      </span>
                    )}
                  </div>
                  <span className="max-w-[64px] truncate text-[9px] font-extrabold text-slate-700 mt-1">
                    {story.senderName}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-b border-slate-100">
            <input
              type="text"
              placeholder="بحث في المحادثات..."
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="h-full overflow-y-auto">
            {loadingChats && <p className="p-4 text-sm text-slate-500">...جاري التحميل</p>}
            {!loadingChats && filteredChats.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                {searchQuery ? "لا توجد نتائج للبحث" : "لا توجد محادثات متاحة"}
              </p>
            )}
            <ul className="divide-y divide-slate-100 pb-20">
              {filteredChats.map((chat) => {
                const active = chat.id === selectedChat;
                const initials = chat.name.slice(0, 2).toUpperCase();

                return (
                  <li
                    key={chat.id}
                    className={`group relative cursor-pointer px-4 py-4 transition-all duration-200 ${active ? "bg-blue-50/80 border-r-4 border-brand-blue" : "hover:bg-slate-50 border-r-4 border-transparent"}`}
                    onClick={() => setSelectedChat(chat.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm transition-transform group-hover:scale-105 ${active ? "bg-brand-blue" : "bg-slate-300"}`}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate font-semibold transition-colors ${active ? "text-brand-blue" : "text-slate-800"}`}>
                            {chat.name}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-blue px-1.5 text-[10px] font-bold text-white shadow-sm">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`inline-block h-2 w-2 rounded-full ${chat.isGroup ? "bg-amber-400" : "bg-green-400"}`}></span>
                          <p className="truncate text-xs text-slate-500">
                            {chat.isGroup ? "مجموعة" : "محادثة خاصة"}
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

        <div className="card flex h-[70vh] flex-col relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-white/50 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              {selectedChat && (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-brand-blue">
                  {selectedChatName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-slate-800">
                  {selectedChat ? selectedChatName : "اختر محادثة للبدء"}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${status === 'ready' ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  <p className="text-[10px] font-medium text-slate-500">
                    {status === 'ready' ? "متصل الآن" : "غير متصل"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                onClick={() => selectedChat && fetchMessages(selectedChat)}
                disabled={!selectedChat || loadingMessages || status !== "ready"}
              >
                <span>تحديث</span>
                <span className="text-slate-400">🔄</span>
              </button>
              <button
                className={`flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${showCustomerPanel ? 'bg-brand-blue text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setShowCustomerPanel(!showCustomerPanel)}
                title="تفاصيل العميل"
              >
                👤
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
            {loadingMessages && <p className="text-sm text-slate-500">...جاري التحميل</p>}
            {!loadingMessages && messages.length === 0 && (
              <p className="text-sm text-slate-500">لا توجد رسائل للعرض</p>
            )}
            <div className="space-y-3">
              {messages.length >= 50 && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMessages}
                    className="text-[10px] font-bold text-brand-blue hover:underline bg-blue-50 px-3 py-1 rounded-full"
                  >
                    عرض الرسائل القديمة
                  </button>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`group relative flex w-full ${msg.fromMe ? "justify-start flex-row-reverse" : "justify-start flex-row"}`}
                >
                  <div className={`flex flex-col max-w-[85%] ${msg.fromMe ? "items-end" : "items-start"}`}>
                    <div
                      className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-md transition-shadow hover:shadow-lg ${msg.fromMe
                        ? "bg-brand-blue text-white rounded-tr-none"
                        : "bg-white text-slate-800 rounded-tl-none border border-slate-200"
                        }`}
                    >
                      {msg.author && !msg.fromMe && (
                        <div className={`mb-1.5 flex items-center gap-1`}>
                          <span className={`text-[11px] font-extrabold tracking-tight ${getAuthorColor(msg.author)}`}>
                            {msg.senderName || msg.author.split('@')[0]}
                          </span>
                        </div>
                      )}
                      {msg.hasMedia && (
                        <div className="mb-2">
                          <WhatsAppMedia clientId={clientId} messageId={msg.id} type={msg.type} />
                        </div>
                      )}

                      <p className="whitespace-pre-wrap leading-relaxed">
                        {msg.body || (msg.hasMedia ? "" : <span className="text-[10px] opacity-60">رسالة غير مدعومة</span>)}
                      </p>
                      <div className={`mt-1 flex items-center gap-1 text-[9px] ${msg.fromMe ? "text-blue-100" : "text-slate-400"}`}>
                        <span>{formatFriendlyTime(msg.timestamp)}</span>
                        {msg.fromMe && (
                          <span className={`text-[11px] font-bold ${msg.ack === 3 ? "text-blue-400" : ""}`}>
                            {msg.ack === 0 ? "🕒" : msg.ack === 1 ? "✓" : (msg.ack === 2 || msg.ack === 3) ? "✓✓" : "✓✓"}
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

          {/* Emoji Picker Popover */}
          {showEmojis && (
            <div className="absolute bottom-20 left-4 bg-white shadow-xl border border-slate-200 rounded-xl p-3 grid grid-cols-5 gap-2 z-10 w-64">
              {emojis.map(e => (
                <button
                  key={e}
                  className="text-xl hover:bg-slate-100 p-1 rounded"
                  onClick={() => {
                    setMessageInput(prev => prev + e);
                    setShowEmojis(false);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 p-4 relative">
            {errorMsg && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</div>}

            {/* Quick Replies Picker */}
            {showQuickReplies && (
              <div className="absolute bottom-full left-4 right-4 mb-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl z-20">
                <div className="flex items-center justify-between border-b pb-2 mb-2 px-2">
                  <span className="text-xs font-bold text-slate-500 text-right w-full">الردود السريعة</span>
                </div>
                {quickReplies.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">لا توجد ردود سريعة مضافة</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {quickReplies.map(qr => (
                      <button
                        key={qr.id}
                        onClick={() => useQuickReply(qr.body)}
                        className="flex flex-col items-start rounded-lg p-2 text-right transition-colors hover:bg-slate-50"
                      >
                        <span className="text-xs font-bold text-brand-blue">{qr.title}</span>
                        <span className="truncate text-[10px] text-slate-500">{qr.body}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              {isRecording ? (
                <div className="flex flex-1 items-center gap-3 rounded-2xl bg-red-50 px-4 py-2 text-red-600 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-ping"></div>
                  <span className="text-xs font-bold font-mono">
                    {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}
                  </span>
                  <div className="flex-1 text-[10px] font-medium">جاري التسجيل...</div>
                  <button onClick={cancelRecording} className="text-xs font-bold text-slate-400 hover:text-red-500">إلغاء</button>
                  <button onClick={stopRecording} className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
                    ⏹️
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className={`btn h-10 w-10 flex items-center justify-center rounded-full transition-all ${showQuickReplies ? 'bg-brand-blue text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    onClick={() => setShowQuickReplies(!showQuickReplies)}
                    title="الردود السريعة"
                    disabled={!selectedChat || status !== "ready"}
                  >
                    ⚡
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    className="btn bg-slate-100 text-slate-500 h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200"
                    onClick={() => fileInputRef.current?.click()}
                    title="إرفاق ملف"
                    disabled={!selectedChat || status !== "ready"}
                  >
                    📎
                  </button>
                  <button
                    className="btn bg-slate-100 text-slate-500 h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200"
                    onClick={sendLocation}
                    title="مشاركة الموقع"
                    disabled={!selectedChat || status !== "ready"}
                  >
                    📍
                  </button>
                  <button
                    className={`btn h-10 w-10 flex items-center justify-center rounded-full transition-all ${showEmojis ? 'bg-yellow-100 text-orange-500 shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    onClick={() => setShowEmojis(!showEmojis)}
                    title="إيموجي"
                    disabled={!selectedChat || status !== "ready"}
                  >
                    😊
                  </button>

                  <textarea
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50 resize-none max-h-32"
                    rows={1}
                    placeholder="اكتب رسالتك..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={!selectedChat || status !== "ready"}
                  />

                  {messageInput.trim() ? (
                    <button
                      className="btn bg-brand-blue h-10 w-10 flex items-center justify-center rounded-full text-white shadow-md hover:bg-blue-700 transition-all hover:scale-105 active:scale-95"
                      onClick={handleSend}
                    >
                      🚀
                    </button>
                  ) : (
                    <button
                      className="btn bg-slate-100 text-slate-500 h-10 w-10 flex items-center justify-center rounded-full hover:bg-brand-blue hover:text-white transition-all active:scale-95"
                      onClick={startRecording}
                      title="سجل رسالة صوتية"
                      disabled={!selectedChat || status !== "ready"}
                    >
                      🎙️
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Customer Sidebar (Right) */}
        <div className={`${showCustomerPanel ? 'w-80 border-r' : 'w-0'} flex flex-col overflow-hidden bg-white transition-all duration-300 h-[70vh] rounded-l-2xl shadow-sm mr-2 border-slate-100`}>
          {selectedCustomer ? (
            <div className="flex h-full flex-col p-6 overflow-y-auto">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-3xl shadow-inner border-2 border-white ring-4 ring-slate-50">
                  {selectedCustomer.avatar || "👤"}
                </div>
                <h3 className="text-lg font-bold text-slate-800 leading-tight">{selectedCustomer.name}</h3>
                <p dir="ltr" className="text-sm font-medium text-slate-400 mt-1">{selectedCustomer.phone}</p>
                <div className="mt-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${selectedCustomer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                    {selectedCustomer.status === 'active' ? 'نشط' : 'غير نشط'}
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">الأوسمة (Tags)</h4>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {selectedCustomer.tags?.map((tag: string) => (
                      <span key={tag} className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-brand-blue border border-blue-100/50">
                        {tag}
                        <button
                          onClick={() => updateCustomerTags(selectedCustomer.tags.filter((t: string) => t !== tag))}
                          className="hover:text-red-500 text-[8px]"
                        >✕</button>
                      </span>
                    ))}
                    <div className="mt-2 w-full">
                      <input
                        type="text"
                        placeholder="إضافة وسم..."
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] focus:ring-2 focus:ring-brand-blue/30 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTag.trim()) {
                            updateCustomerTags([...(selectedCustomer.tags || []), newTag.trim()]);
                            setNewTag("");
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">ملاحظات</h4>
                  <textarea
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs focus:ring-2 focus:ring-brand-blue/30 outline-none min-h-[100px]"
                    placeholder="أضف ملاحظاتك عن هذا العميل..."
                    defaultValue={selectedCustomer.notes}
                    onBlur={async (e) => {
                      if (e.target.value !== selectedCustomer.notes) {
                        const res = await fetch(`${apiBase}/api/customers/${selectedCustomer.id}`, {
                          method: "PUT",
                          headers: getAuthHeaders(),
                          body: JSON.stringify({ notes: e.target.value })
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setSelectedCustomer(data.customer);
                        }
                      }
                    }}
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                  <h4 className="mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">معلومات تقنية</h4>
                  <div className="space-y-2 text-[10px]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-800">{selectedCustomer.source}</span>
                      <span className="text-slate-400">المصدر</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-800">{selectedCustomer.last_contact_at ? new Date(selectedCustomer.last_contact_at).toLocaleDateString() : 'لا يوجد'}</span>
                      <span className="text-slate-400">آخر تواصل</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center bg-slate-50/50">
              <div className="max-w-[200px]">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-2xl shadow-inner">🔎</div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">عميل غير مسجل</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  هذه المحادثة غير مرتبطة بملف عميل في النظام. يمكنك إنشاء ملف للعميل لتتبع طلباته وملاحظاته.
                </p>
                <button className="mt-6 w-full rounded-xl bg-brand-blue py-2 text-[10px] font-bold text-white shadow-md hover:bg-blue-700 transition-all active:scale-95">
                  إضافة عميل جديد
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Story Viewer Modal */}
      {selectedStory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col h-[85vh] animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setSelectedStory(null)}
              className="absolute right-6 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white transition-all hover:bg-white hover:text-black hover:rotate-90 active:scale-90"
            >
              ✕
            </button>
            <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center bg-slate-950/50">
              {selectedStory.hasMedia ? (
                <div className="w-full">
                  <WhatsAppMedia clientId={clientId} messageId={selectedStory.id} type={selectedStory.type} />
                </div>
              ) : (
                <div className="text-xl text-white text-center px-10 whitespace-pre-wrap font-medium leading-relaxed drop-shadow-md">
                  {selectedStory.body}
                </div>
              )}
            </div>
            <div className="bg-slate-800/80 p-6 border-t border-slate-700/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand-blue flex items-center justify-center text-white font-bold ring-2 ring-white/10 shadow-lg">
                  {selectedStory.senderName?.slice(0, 1) || "S"}
                </div>
                <div>
                  <p className="text-sm font-bold text-white tracking-tight">{selectedStory.senderName || "حالة"}</p>
                  <p className="text-[10px] text-slate-400 font-medium">{formatFriendlyTime(selectedStory.timestamp)}</p>
                </div>
              </div>
              {selectedStory.body && selectedStory.hasMedia && (
                <div className="mt-4 max-h-32 overflow-y-auto custom-scrollbar">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap bg-white/5 p-4 rounded-2xl border border-white/10 leading-relaxed shadow-inner">
                    {selectedStory.body}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
