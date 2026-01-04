'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Instagram,
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
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface InstagramAccount {
  id: string;
  instagram_id: string;
  username: string;
  name: string;
  profile_picture: string;
  followers_count: number;
  is_active: boolean;
  connected_at: string;
}

interface Conversation {
  id: string;
  name: string;
  instagram_id: string;
  instagram_username: string;
  instagram_profile_pic: string;
  last_message: {
    content: string;
    message_type: string;
    direction: string;
    timestamp: string;
  } | null;
  unread_count: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string;
  media_url: string | null;
  timestamp: string;
  is_read: boolean;
  reaction?: string;
}

export default function InstagramPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings' | 'insights'>('inbox');
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchAccounts();
      fetchInbox();
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

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/instagram/accounts`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchInbox = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/instagram/inbox`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Error fetching inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (contactId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/instagram/conversations/${contactId}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSendingMessage(true);
    try {
      const res = await fetch(`${API_URL}/api/instagram/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          contact_id: selectedConversation.id,
          recipient_id: selectedConversation.instagram_id,
          message_type: 'text',
          content: newMessage,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, data.message]);
        setNewMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.instagram_username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}د`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}س`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}ي`;
    return date.toLocaleDateString('ar-EG');
  };

  const renderMessageContent = (message: Message) => {
    switch (message.message_type) {
      case 'image':
        return (
          <div>
            <img src={message.media_url || ''} alt="صورة" className="max-w-[200px] rounded-lg" />
            {message.content && <p className="mt-1 text-sm">{message.content}</p>}
          </div>
        );
      case 'video':
        return (
          <video src={message.media_url || ''} controls className="max-w-[200px] rounded-lg" />
        );
      case 'audio':
        return (
          <audio src={message.media_url || ''} controls className="max-w-[200px]" />
        );
      case 'story_mention':
      case 'story_reply':
        return (
          <div className="flex items-center gap-2">
            <span className="text-pink-500">📸</span>
            <span>{message.content}</span>
          </div>
        );
      default:
        return <p>{message.content}</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Instagram className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">رسائل Instagram</h1>
              <p className="text-white/80 text-sm">
                {accounts.length > 0 ? `@${accounts[0].username}` : 'غير متصل'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['inbox', 'insights', 'settings'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
              >
                {tab === 'inbox' && <MessageCircle className="w-4 h-4 inline ml-1" />}
                {tab === 'insights' && <BarChart2 className="w-4 h-4 inline ml-1" />}
                {tab === 'settings' && <Settings className="w-4 h-4 inline ml-1" />}
                {tab === 'inbox' ? 'صندوق الوارد' : tab === 'insights' ? 'الإحصائيات' : 'الإعدادات'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Inbox Tab */}
        {activeTab === 'inbox' && (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex h-[calc(100vh-200px)]">
            {/* Conversations List */}
            <div className={`w-full md:w-96 border-l flex flex-col ${selectedConversation ? 'hidden md:flex' : ''}`}>
              {/* Search */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="بحث في المحادثات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>
              
              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>لا توجد محادثات</p>
                  </div>
                ) : (
                  filteredConversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedConversation?.id === conv.id ? 'bg-pink-50' : ''
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={conv.instagram_profile_pic || `https://ui-avatars.com/api/?name=${conv.name}&background=E1306C&color=fff`}
                          alt={conv.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        {conv.unread_count > 0 && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-xs rounded-full flex items-center justify-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-gray-900 truncate">{conv.name}</span>
                          <span className="text-xs text-gray-400">
                            {conv.last_message && formatTime(conv.last_message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {conv.last_message?.direction === 'outbound' && '✓ '}
                          {conv.last_message?.content || 'ابدأ المحادثة'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Chat Area */}
            <div className={`flex-1 flex flex-col ${!selectedConversation ? 'hidden md:flex' : ''}`}>
              {selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="flex items-center gap-3 p-4 border-b bg-white">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <img
                      src={selectedConversation.instagram_profile_pic || `https://ui-avatars.com/api/?name=${selectedConversation.name}&background=E1306C&color=fff`}
                      alt={selectedConversation.name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{selectedConversation.name}</h3>
                      <p className="text-sm text-gray-500">@{selectedConversation.instagram_username}</p>
                    </div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg">
                      <MoreVertical className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  
                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            message.direction === 'outbound'
                              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-sm'
                              : 'bg-white border text-gray-900 rounded-bl-sm'
                          }`}
                        >
                          {renderMessageContent(message)}
                          <div className={`text-xs mt-1 flex items-center gap-1 ${
                            message.direction === 'outbound' ? 'text-white/70' : 'text-gray-400'
                          }`}>
                            {formatTime(message.timestamp)}
                            {message.direction === 'outbound' && (
                              <CheckCheck className="w-3 h-3" />
                            )}
                            {message.reaction && <span>{message.reaction}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  
                  {/* Input */}
                  <div className="p-4 border-t bg-white">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-100 rounded-full">
                        <Paperclip className="w-5 h-5 text-gray-500" />
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded-full">
                        <Image className="w-5 h-5 text-gray-500" />
                      </button>
                      <input
                        type="text"
                        placeholder="اكتب رسالتك..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-pink-500"
                      />
                      <button className="p-2 hover:bg-gray-100 rounded-full">
                        <Smile className="w-5 h-5 text-gray-500" />
                      </button>
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sendingMessage}
                        className="p-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full hover:opacity-90 disabled:opacity-50"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <Instagram className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">اختر محادثة للبدء</p>
                  <p className="text-sm">رسائل Instagram الخاصة بك ستظهر هنا</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            {accounts.length > 0 && (
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">المتابعين</span>
                    <Users className="w-5 h-5 text-pink-500" />
                  </div>
                  <p className="text-2xl font-bold">{accounts[0].followers_count.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">إجمالي المحادثات</span>
                    <MessageCircle className="w-5 h-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold">{conversations.length}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">رسائل غير مقروءة</span>
                    <MessageCircle className="w-5 h-5 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {conversations.reduce((sum, c) => sum + c.unread_count, 0)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">معدل الرد</span>
                    <CheckCheck className="w-5 h-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">85%</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Connected Accounts */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">الحسابات المتصلة</h2>
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:opacity-90"
                >
                  <Plus className="w-4 h-4" />
                  إضافة حساب
                </button>
              </div>
              
              {accounts.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Instagram className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد حسابات متصلة</p>
                  <p className="text-sm mt-1">اربط حساب Instagram Business للبدء</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map(account => (
                    <div key={account.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <img
                        src={account.profile_picture || `https://ui-avatars.com/api/?name=${account.username}&background=E1306C&color=fff`}
                        alt={account.username}
                        className="w-14 h-14 rounded-full"
                      />
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900">{account.name}</h3>
                        <p className="text-gray-500">@{account.username}</p>
                        <p className="text-sm text-gray-400">{account.followers_count.toLocaleString()} متابع</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          account.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {account.is_active ? 'متصل' : 'غير متصل'}
                        </span>
                        <button className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                          <Unlink className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connection Instructions */}
            <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border border-pink-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4">كيفية ربط حساب Instagram</h3>
              <ol className="space-y-3 text-gray-600">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</span>
                  <span>تأكد من أن حسابك Instagram Business أو Creator</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</span>
                  <span>اربط حساب Instagram بصفحة Facebook</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</span>
                  <span>اضغط على "إضافة حساب" وسجّل الدخول بحسابك Facebook</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 bg-pink-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">4</span>
                  <span>امنح الأذونات اللازمة لإدارة الرسائل</span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">ربط حساب Instagram</h2>
            <p className="text-gray-500 mb-6">
              سيتم توجيهك لتسجيل الدخول عبر Facebook لربط حساب Instagram Business الخاص بك
            </p>
            
            <div className="space-y-4">
              <a
                href={`https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(window.location.origin + '/integrations/instagram/callback')}&scope=instagram_basic,instagram_manage_messages,pages_messaging,pages_manage_metadata&response_type=code`}
                className="block w-full py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-center rounded-xl font-bold hover:opacity-90"
              >
                <Instagram className="w-5 h-5 inline ml-2" />
                تسجيل الدخول عبر Facebook
              </a>
              
              <button
                onClick={() => setShowConnectModal(false)}
                className="block w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
