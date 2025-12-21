"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Status = "idle" | "initializing" | "waiting_qr" | "ready" | "error" | "disconnected";

type ChatItem = { id: string; name: string; isGroup: boolean; unreadCount: number };
type MessageItem = { id: string; body: string; fromMe: boolean; timestamp: number; author?: string; type?: string; from?: string; to?: string };

const clientId = "default";
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
  const socketRef = useRef<Socket | null>(null);
  const selectedChatRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with state for socket callback
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const statusBadge = useMemo(() => statusLabels[status], [status]);

  // Socket.io connection for real-time updates
  useEffect(() => {
    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
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
            }];
          });
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/whatsapp/status/${clientId}`);
      const data = await res.json();
      setStatus(data.status as Status);
    } catch (err) {
      setStatus("error");
      setErrorMsg("تعذر جلب حالة الاتصال");
    }
  }, []);

  const fetchChats = useCallback(async () => {
    setLoadingChats(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/whatsapp/chats/${clientId}`);
      if (!res.ok) throw new Error("تعذر جلب المحادثات");
      const data = await res.json();
      setChats(data.chats || []);
      if (data.chats?.length && !selectedChat) {
        setSelectedChat(data.chats[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "فشل تحميل المحادثات");
    } finally {
      setLoadingChats(false);
    }
  }, [selectedChat]);

  const fetchMessages = useCallback(
    async (chatId: string) => {
      setLoadingMessages(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`${apiBase}/whatsapp/messages/${clientId}/${chatId}`);
        if (!res.ok) throw new Error("تعذر جلب الرسائل");
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err: any) {
        setErrorMsg(err?.message || "فشل تحميل الرسائل");
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status === "ready") {
      void fetchChats();
    }
  }, [status, fetchChats]);

  useEffect(() => {
    if (selectedChat) {
      void fetchMessages(selectedChat);
    }
  }, [selectedChat, fetchMessages]);

  const handleSend = useCallback(async () => {
    if (!selectedChat || !messageInput.trim()) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  }, [selectedChat, messageInput]);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojis, setShowEmojis] = useState(false);

  const emojis = ["😀", "😂", "🥰", "😎", "🤔", "😭", "😡", "👍", "👎", "👏", "🙏", "❤️", "💔", "🔥", "✨", "🎉", "📅", "✅", "❌", "👋"];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    setSending(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Full = reader.result as string;
        const base64 = base64Full.split(',')[1];

        const res = await fetch(`${apiBase}/whatsapp/send-media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
            <button
              className="btn bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
              onClick={fetchChats}
              disabled={loadingChats || status !== "ready"}
            >
              تحديث
            </button>
          </div>
          <div className="h-full overflow-y-auto">
            {loadingChats && <p className="p-4 text-sm text-slate-500">...جاري التحميل</p>}
            {!loadingChats && chats.length === 0 && (
              <p className="p-4 text-sm text-slate-500">لا توجد محادثات متاحة</p>
            )}
            <ul className="divide-y divide-slate-100">
              {chats.map((chat) => {
                const active = chat.id === selectedChat;
                return (
                  <li
                    key={chat.id}
                    className={`cursor-pointer px-4 py-3 transition ${active ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedChat(chat.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{chat.name}</p>
                        <p className="text-xs text-slate-500">{chat.isGroup ? "مجموعة" : "فردي"}</p>
                      </div>
                      {chat.unreadCount > 0 && (
                        <span className="badge bg-brand-blue text-white">{chat.unreadCount}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="card flex h-[70vh] flex-col relative">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {selectedChat ? `المحادثة: ${selectedChat.split('@')[0]}` : "اختر محادثة"}
              </p>
              <p className="text-xs text-slate-500">الرسائل تظهر تلقائياً</p>
            </div>
            <button
              className="btn bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
              onClick={() => selectedChat && fetchMessages(selectedChat)}
              disabled={!selectedChat || loadingMessages}
            >
              تحديث الرسائل
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
            {loadingMessages && <p className="text-sm text-slate-500">...جاري التحميل</p>}
            {!loadingMessages && messages.length === 0 && (
              <p className="text-sm text-slate-500">لا توجد رسائل للعرض</p>
            )}
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[80%] rounded-xl px-4 py-2 text-sm shadow ${msg.fromMe ? "ml-auto bg-brand-blue text-white" : "mr-auto bg-white text-slate-800"}`}
                >
                  <p>{msg.body}</p>
                  <div className="mt-1 text-[11px] opacity-80">
                    {msg.author && !msg.fromMe && <span className="mr-1">من: {msg.author}</span>}
                    <span>{new Date(msg.timestamp * 1000).toLocaleTimeString()}</span>
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

          <div className="border-t border-slate-200 p-4">
            {errorMsg && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</div>}
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                className="btn bg-slate-100 text-slate-500 p-2 rounded-full hover:bg-slate-200"
                onClick={() => fileInputRef.current?.click()}
                title="إرفاق ملف"
                disabled={!selectedChat || status !== "ready"}
              >
                📎
              </button>
              <button
                className="btn bg-slate-100 text-slate-500 p-2 rounded-full hover:bg-slate-200"
                onClick={() => setShowEmojis(!showEmojis)}
                title="إيموجي"
                disabled={!selectedChat || status !== "ready"}
              >
                😊
              </button>

              <input
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/50"
                placeholder="اكتب رسالتك..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={!selectedChat || status !== "ready"}
              />
              <button
                className="btn bg-brand-blue px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={handleSend}
                disabled={!selectedChat || !messageInput.trim() || sending || status !== "ready"}
              >
                إرسال
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
