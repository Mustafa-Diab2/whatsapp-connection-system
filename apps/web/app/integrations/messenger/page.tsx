'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Send,
  Image,
  Video,
  FileText,
  Settings,
  BarChart2,
  Users,
  CheckCheck,
  Plus,
  Link2,
  Unlink,
  Search,
  MoreVertical,
  Smile,
  Paperclip,
  RefreshCw,
  ChevronLeft,
  Facebook,
  Menu,
  Bell,
  Zap,
  Type,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface MessengerPage {
  id: string;
  page_id: string;
  page_name: string;
  page_picture: string;
  is_active: boolean;
  webhook_subscribed: boolean;
  connected_at: string;
}

interface Conversation {
  id: string;
  psid: string;
  customer_name: string;
  customer_first_name: string;
  customer_last_name: string;
  profile_pic: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_active: boolean;
  messenger_pages?: {
    page_name: string;
    page_picture: string;
  };
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string;
  media_url: string | null;
  metadata: any;
  timestamp: string;
  is_read: boolean;
  reaction?: string;
}

export default function MessengerPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings' | 'insights'>('inbox');
  const [pages, setPages] = useState<MessengerPage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchPages();
      fetchConversations();
      fetchAnalytics();
    }
  }, [organizationId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchPages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/messenger/pages`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setPages(data.pages || []);
    } catch (error) {
      console.error('Error fetching pages:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/messenger/conversations`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    try {
      const res = await fetch(
        `${API_URL}/api/messenger/conversations/${conversationId}/messages`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }
      );
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/api/messenger/analytics`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      const res = await fetch(`${API_URL}/api/messenger/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          message_type: 'text',
          content: newMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...messages, data.message]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const disconnectPage = async (pageId: string) => {
    if (!confirm('هل أنت متأكد من فصل هذه الصفحة؟')) return;

    try {
      await fetch(`${API_URL}/api/messenger/pages/${pageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      fetchPages();
    } catch (error) {
      console.error('Error disconnecting page:', error);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'أمس';
    } else if (days < 7) {
      return date.toLocaleDateString('ar-SA', { weekday: 'long' });
    }
    return date.toLocaleDateString('ar-SA');
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Facebook className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Messenger</h1>
              <p className="text-sm text-white/70">
                {pages.length > 0 ? `${pages.length} صفحة متصلة` : 'لا توجد صفحات متصلة'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConnectModal(true)}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            ربط صفحة
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { id: 'inbox', label: 'الرسائل', icon: MessageCircle },
            { id: 'settings', label: 'الإعدادات', icon: Settings },
            { id: 'insights', label: 'الإحصائيات', icon: BarChart2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600'
                  : 'text-white/80 hover:bg-white/20'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4">
        {activeTab === 'inbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Conversations List */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="بحث في المحادثات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="divide-y max-h-[calc(100vh-320px)] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                    <p className="mt-2 text-gray-500">جاري التحميل...</p>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageCircle className="w-12 h-12 mx-auto text-gray-300" />
                    <p className="mt-2 text-gray-500">لا توجد محادثات</p>
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedConversation?.id === conversation.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img
                            src={conversation.profile_pic || '/default-avatar.png'}
                            alt={conversation.customer_name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          {conversation.unread_count > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className={`font-medium truncate ${conversation.unread_count > 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                              {conversation.customer_name}
                            </h3>
                            <span className="text-xs text-gray-400">
                              {conversation.last_message_at && formatTime(conversation.last_message_at)}
                            </span>
                          </div>
                          <p className={`text-sm truncate ${conversation.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                            {conversation.last_message || 'لا توجد رسائل'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat View */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="lg:hidden p-2 hover:bg-gray-200 rounded-lg"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <img
                        src={selectedConversation.profile_pic || '/default-avatar.png'}
                        alt={selectedConversation.customer_name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <h3 className="font-medium">{selectedConversation.customer_name}</h3>
                        <p className="text-sm text-gray-500">
                          {selectedConversation.is_active ? '🟢 نشط' : '⚪ غير نشط'}
                        </p>
                      </div>
                    </div>
                    <button className="p-2 hover:bg-gray-200 rounded-lg">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-100">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            message.direction === 'outbound'
                              ? 'bg-blue-600 text-white rounded-bl-none'
                              : 'bg-white text-gray-900 rounded-br-none shadow-sm'
                          }`}
                        >
                          {message.message_type !== 'text' && message.media_url && (
                            <div className="mb-2">
                              {message.message_type === 'image' && (
                                <img
                                  src={message.media_url}
                                  alt="Image"
                                  className="rounded-lg max-w-full"
                                />
                              )}
                              {message.message_type === 'video' && (
                                <video
                                  src={message.media_url}
                                  controls
                                  className="rounded-lg max-w-full"
                                />
                              )}
                            </div>
                          )}
                          {message.content && (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          )}
                          <div
                            className={`flex items-center gap-1 mt-1 text-xs ${
                              message.direction === 'outbound' ? 'text-white/70' : 'text-gray-400'
                            }`}
                          >
                            <span>{formatTime(message.timestamp)}</span>
                            {message.direction === 'outbound' && (
                              <CheckCheck className={`w-4 h-4 ${message.is_read ? 'text-blue-300' : ''}`} />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t bg-white">
                    <div className="flex items-center gap-2">
                      <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                        <Smile className="w-5 h-5" />
                      </button>
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="اكتب رسالة..."
                        className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sendingMessage}
                        className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingMessage ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <Facebook className="w-16 h-16 text-blue-200 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-gray-900">Messenger</h3>
                    <p className="mt-2 text-gray-500">اختر محادثة للبدء</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Connected Pages */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-600" />
                الصفحات المتصلة
              </h2>
              {pages.length === 0 ? (
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 text-gray-300 mx-auto" />
                  <p className="mt-2 text-gray-500">لا توجد صفحات متصلة</p>
                  <button
                    onClick={() => setShowConnectModal(true)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    ربط صفحة الآن
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {pages.map((page) => (
                    <div
                      key={page.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={page.page_picture || '/default-page.png'}
                          alt={page.page_name}
                          className="w-12 h-12 rounded-lg"
                        />
                        <div>
                          <h3 className="font-medium">{page.page_name}</h3>
                          <p className="text-sm text-gray-500">
                            {page.is_active ? '🟢 نشط' : '🔴 غير نشط'}
                            {page.webhook_subscribed && ' • Webhook متصل'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => disconnectPage(page.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Unlink className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Messenger Profile Settings */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Menu className="w-5 h-5 text-blue-600" />
                إعدادات الملف الشخصي
              </h2>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">زر البدء (Get Started)</h3>
                    <Zap className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    الزر الذي يظهر للمستخدمين الجدد لبدء المحادثة
                  </p>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    تفعيل
                  </button>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">رسالة الترحيب</h3>
                    <Type className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    الرسالة التي تظهر للمستخدمين قبل بدء المحادثة
                  </p>
                  <textarea
                    placeholder="مرحباً! كيف يمكنني مساعدتك؟"
                    className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'إجمالي المحادثات',
                  value: analytics?.total_conversations || 0,
                  icon: MessageCircle,
                  color: 'bg-blue-500',
                },
                {
                  label: 'المحادثات النشطة',
                  value: analytics?.active_conversations || 0,
                  icon: Users,
                  color: 'bg-green-500',
                },
                {
                  label: 'الرسائل المستلمة',
                  value: analytics?.messages_received || 0,
                  icon: Bell,
                  color: 'bg-purple-500',
                },
                {
                  label: 'الرسائل المرسلة',
                  value: analytics?.messages_sent || 0,
                  icon: Send,
                  color: 'bg-orange-500',
                },
              ].map((stat, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm p-4">
                  <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center mb-3`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-2xl font-bold">{stat.value.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Response Rate */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-bold mb-4">معدل الاستجابة</h2>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-green-500 rounded-full h-4 transition-all"
                    style={{ width: `${analytics?.response_rate || 0}%` }}
                  />
                </div>
                <span className="font-bold text-lg">{analytics?.response_rate || 0}%</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                نسبة الرسائل التي تم الرد عليها
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">ربط صفحة Facebook</h2>
            <p className="text-gray-600 mb-6">
              لربط صفحة Facebook لاستقبال رسائل Messenger، يجب أن تكون مسؤولاً عن الصفحة
              وأن تكون الصفحة مرتبطة بتطبيق Facebook Business.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-medium text-blue-900 mb-2">خطوات الربط:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>سجّل الدخول بحساب Facebook</li>
                  <li>اختر الصفحة المطلوبة</li>
                  <li>امنح الصلاحيات المطلوبة</li>
                </ol>
              </div>

              <button
                onClick={() => {
                  // Redirect to Facebook OAuth
                  const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
                  const redirectUri = `${window.location.origin}/integrations/messenger/callback`;
                  const scope = 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata';
                  window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
                }}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Facebook className="w-5 h-5" />
                الاتصال بـ Facebook
              </button>
            </div>

            <button
              onClick={() => setShowConnectModal(false)}
              className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
