'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MetaRedirectPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/integrations/meta');
  }, [router]);
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">جاري التحويل لمنصة Meta...</p>
      </div>
    </div>
  );
}

// Types
interface MessengerPage {
  id: string;
  page_id: string;
  page_name: string;
  page_picture: string;
  is_active: boolean;
  webhook_subscribed: boolean;
  connected_at: string;
}

interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  page_picture?: string;
  is_active: boolean;
  access_token?: string;
}

interface InstagramAccount {
  id: string;
  instagram_id: string;
  username: string;
  profile_picture?: string;
  is_active: boolean;
}

interface Conversation {
  id: string;
  psid?: string;
  customer_name: string;
  profile_pic: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  platform: 'messenger' | 'instagram' | 'facebook';
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string;
  media_url: string | null;
  timestamp: string;
  is_read: boolean;
}

type TabType = 'overview' | 'messenger' | 'facebook' | 'instagram' | 'settings' | 'analytics';
type SubTabType = 'inbox' | 'pages' | 'webhooks' | 'profile';

export default function MetaPlatformPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('inbox');
  
  // Data States
  const [messengerPages, setMessengerPages] = useState<MessengerPage[]>([]);
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([]);
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTokens, setShowTokens] = useState<{ [key: string]: boolean }>({});
  const [platformFilter, setPlatformFilter] = useState<'all' | 'messenger' | 'instagram' | 'facebook'>('all');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  // Fetch data on mount
  useEffect(() => {
    if (organizationId) {
      fetchAllData();
    }
  }, [organizationId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id, selectedConversation.platform);
    }
  }, [selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchMessengerPages(),
      fetchFacebookPages(),
      fetchInstagramAccounts(),
      fetchConversations(),
      fetchAnalytics(),
    ]);
    setLoading(false);
  };

  const fetchMessengerPages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/messenger/pages`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setMessengerPages(data.pages || []);
    } catch (error) {
      console.error('Error fetching Messenger pages:', error);
    }
  };

  const fetchFacebookPages = async () => {
    try {
      const res = await fetch(`${API_URL}/api/facebook/pages`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setFacebookPages(data.pages || []);
    } catch (error) {
      console.error('Error fetching Facebook pages:', error);
    }
  };

  const fetchInstagramAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/instagram/accounts`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setInstagramAccounts(data.accounts || []);
    } catch (error) {
      console.error('Error fetching Instagram accounts:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      // Fetch from all platforms
      const [messengerRes, instagramRes] = await Promise.all([
        fetch(`${API_URL}/api/messenger/conversations`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }),
        fetch(`${API_URL}/api/instagram/conversations`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }),
      ]);

      const messengerData = await messengerRes.json();
      const instagramData = await instagramRes.json();

      const allConversations = [
        ...(messengerData.conversations || []).map((c: any) => ({ ...c, platform: 'messenger' })),
        ...(instagramData.conversations || []).map((c: any) => ({ ...c, platform: 'instagram' })),
      ].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

      setConversations(allConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchMessages = async (conversationId: string, platform: string) => {
    try {
      const endpoint = platform === 'messenger' 
        ? `/api/messenger/conversations/${conversationId}/messages`
        : `/api/instagram/conversations/${conversationId}/messages`;
      
      const res = await fetch(`${API_URL}${endpoint}`, {
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

  const fetchAnalytics = async () => {
    try {
      const [messengerRes, instagramRes] = await Promise.all([
        fetch(`${API_URL}/api/messenger/analytics`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }),
        fetch(`${API_URL}/api/instagram/analytics`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }),
      ]);

      const messengerData = await messengerRes.json();
      const instagramData = await instagramRes.json();

      setAnalytics({
        messenger: messengerData,
        instagram: instagramData,
        total: {
          conversations: (messengerData.total_conversations || 0) + (instagramData.total_conversations || 0),
          messages: (messengerData.total_messages || 0) + (instagramData.total_messages || 0),
        },
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const syncMessages = async (pageId: string, platform: string, quickSync = false) => {
    setSyncing(true);
    try {
      const endpoint = platform === 'messenger'
        ? `/api/messenger/pages/${pageId}/${quickSync ? 'quick-sync' : 'sync'}`
        : `/api/instagram/accounts/${pageId}/sync`;
      
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchConversations();
      } else {
        alert('حدث خطأ: ' + (data.error || 'غير معروف'));
      }
    } catch (error) {
      console.error('Error syncing:', error);
      alert('حدث خطأ أثناء المزامنة');
    } finally {
      setSyncing(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setSendingMessage(true);
    try {
      const endpoint = selectedConversation.platform === 'messenger'
        ? '/api/messenger/send'
        : '/api/instagram/send';

      const res = await fetch(`${API_URL}${endpoint}`, {
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

  const disconnectPage = async (pageId: string, platform: string) => {
    if (!confirm('هل أنت متأكد من فصل هذه الصفحة؟')) return;

    try {
      const endpoint = platform === 'messenger'
        ? `/api/messenger/pages/${pageId}`
        : platform === 'facebook'
        ? `/api/facebook/pages/${pageId}`
        : `/api/instagram/accounts/${pageId}`;

      await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      fetchAllData();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
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

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'messenger': return <MessageCircle className="w-4 h-4 text-blue-600" />;
      case 'instagram': return <Instagram className="w-4 h-4 text-pink-600" />;
      case 'facebook': return <Facebook className="w-4 h-4 text-blue-700" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'messenger': return 'bg-blue-100 text-blue-700';
      case 'instagram': return 'bg-gradient-to-r from-purple-100 to-pink-100 text-pink-700';
      case 'facebook': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.last_message?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = platformFilter === 'all' || c.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  const totalConnections = messengerPages.length + facebookPages.length + instagramAccounts.length;

  // Render functions
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Link2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalConnections}</p>
          <p className="text-sm text-gray-500">حسابات متصلة</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.total?.conversations || 0}</p>
          <p className="text-sm text-gray-500">إجمالي المحادثات</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Send className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.total?.messages || 0}</p>
          <p className="text-sm text-gray-500">إجمالي الرسائل</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {conversations.filter(c => c.unread_count > 0).length}
          </p>
          <p className="text-sm text-gray-500">رسائل غير مقروءة</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold mb-4">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button 
            onClick={() => setActiveTab('messenger')}
            className="p-4 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-right"
          >
            <MessageCircle className="w-8 h-8 text-blue-600 mb-2" />
            <p className="font-medium">Messenger</p>
            <p className="text-sm text-gray-500">{messengerPages.length} صفحة</p>
          </button>

          <button 
            onClick={() => setActiveTab('instagram')}
            className="p-4 border rounded-xl hover:bg-pink-50 hover:border-pink-200 transition-colors text-right"
          >
            <Instagram className="w-8 h-8 text-pink-600 mb-2" />
            <p className="font-medium">Instagram</p>
            <p className="text-sm text-gray-500">{instagramAccounts.length} حساب</p>
          </button>

          <button 
            onClick={() => setActiveTab('facebook')}
            className="p-4 border rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-right"
          >
            <Facebook className="w-8 h-8 text-blue-700 mb-2" />
            <p className="font-medium">Facebook</p>
            <p className="text-sm text-gray-500">{facebookPages.length} صفحة</p>
          </button>

          <button 
            onClick={() => setActiveTab('analytics')}
            className="p-4 border rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-colors text-right"
          >
            <BarChart2 className="w-8 h-8 text-purple-600 mb-2" />
            <p className="font-medium">التحليلات</p>
            <p className="text-sm text-gray-500">عرض التقارير</p>
          </button>
        </div>
      </div>

      {/* Connected Platforms */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold mb-4">المنصات المتصلة</h2>
        <div className="space-y-3">
          {messengerPages.map(page => (
            <div key={page.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">{page.page_name}</p>
                  <p className="text-sm text-gray-500">Messenger</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">متصل</span>
            </div>
          ))}

          {instagramAccounts.map(account => (
            <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center">
                  <Instagram className="w-5 h-5 text-pink-600" />
                </div>
                <div>
                  <p className="font-medium">@{account.username}</p>
                  <p className="text-sm text-gray-500">Instagram</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">متصل</span>
            </div>
          ))}

          {totalConnections === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Link2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>لا توجد منصات متصلة</p>
              <p className="text-sm">اضغط على "ربط منصة جديدة" للبدء</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-280px)]">
      {/* Conversations List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="بحث في المحادثات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'messenger', 'instagram'].map(filter => (
              <button
                key={filter}
                onClick={() => setPlatformFilter(filter as any)}
                className={`px-3 py-1 rounded-full text-sm ${
                  platformFilter === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter === 'all' ? 'الكل' : filter === 'messenger' ? 'ماسنجر' : 'انستجرام'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 divide-y overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
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
                    <div className="absolute -bottom-1 -left-1">
                      {getPlatformIcon(conversation.platform)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate">{conversation.customer_name}</h3>
                      <span className="text-xs text-gray-400">
                        {formatTime(conversation.last_message_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 truncate">{conversation.last_message}</p>
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                      {conversation.unread_count}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat View */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
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
                  <div className="flex items-center gap-2">
                    {getPlatformIcon(selectedConversation.platform)}
                    <span className="text-sm text-gray-500 capitalize">
                      {selectedConversation.platform}
                    </span>
                  </div>
                </div>
              </div>
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
                    {message.media_url && (
                      <img src={message.media_url} alt="" className="rounded-lg max-w-full mb-2" />
                    )}
                    <p>{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.direction === 'outbound' ? 'text-white/70' : 'text-gray-400'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="اكتب رسالتك..."
                  className="flex-1 px-4 py-2 border rounded-full focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={sendingMessage || !newMessage.trim()}
                  className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50"
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
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">اختر محادثة</p>
              <p className="text-sm">اختر محادثة من القائمة لعرض الرسائل</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderPlatformPages = (platform: 'messenger' | 'facebook' | 'instagram') => {
    const pages = platform === 'messenger' ? messengerPages 
                : platform === 'facebook' ? facebookPages 
                : instagramAccounts;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              {platform === 'messenger' && <MessageCircle className="w-6 h-6 text-blue-600" />}
              {platform === 'instagram' && <Instagram className="w-6 h-6 text-pink-600" />}
              {platform === 'facebook' && <Facebook className="w-6 h-6 text-blue-700" />}
              {platform === 'messenger' ? 'صفحات Messenger' : platform === 'instagram' ? 'حسابات Instagram' : 'صفحات Facebook'}
            </h2>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              ربط {platform === 'instagram' ? 'حساب' : 'صفحة'} جديدة
            </button>
          </div>

          {pages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Link2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">لا توجد {platform === 'instagram' ? 'حسابات' : 'صفحات'} متصلة</p>
              <p className="text-sm mt-2">اضغط على الزر أعلاه لربط {platform === 'instagram' ? 'حساب' : 'صفحة'} جديدة</p>
            </div>
          ) : (
            <div className="space-y-4">
              {platform === 'messenger' && messengerPages.map(page => (
                <div key={page.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <img
                      src={page.page_picture || '/default-page.png'}
                      alt={page.page_name}
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                    <div>
                      <h3 className="font-bold text-lg">{page.page_name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          page.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {page.is_active ? '✓ نشط' : '✗ غير نشط'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          page.webhook_subscribed ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {page.webhook_subscribed ? '✓ Webhook متصل' : '⚠ Webhook غير متصل'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => syncMessages(page.id, 'messenger', true)}
                      disabled={syncing}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      title="مزامنة سريعة"
                    >
                      <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('مزامنة جميع الرسائل؟')) syncMessages(page.id, 'messenger', false);
                      }}
                      disabled={syncing}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      مزامنة الكل
                    </button>
                    <button
                      onClick={() => disconnectPage(page.id, 'messenger')}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Unlink className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}

              {platform === 'instagram' && instagramAccounts.map(account => (
                <div key={account.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <img
                      src={account.profile_picture || '/default-avatar.png'}
                      alt={account.username}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="font-bold text-lg">@{account.username}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                        ✓ متصل
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => disconnectPage(account.id, 'instagram')}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Unlink className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      {/* Webhook Settings */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-blue-600" />
          إعدادات Webhook
        </h2>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium">Messenger Webhook URL</p>
              <button className="p-2 hover:bg-gray-200 rounded-lg">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <code className="text-sm text-gray-600 break-all">
              {API_URL}/api/messenger/webhook
            </code>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium">Instagram Webhook URL</p>
              <button className="p-2 hover:bg-gray-200 rounded-lg">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <code className="text-sm text-gray-600 break-all">
              {API_URL}/api/instagram/webhook
            </code>
          </div>
        </div>
      </div>

      {/* App Settings */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-600" />
          إعدادات التطبيق
        </h2>
        <div className="space-y-4">
          <div className="p-4 border rounded-xl">
            <label className="block font-medium mb-2">Facebook App ID</label>
            <input
              type="text"
              placeholder="أدخل App ID"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="p-4 border rounded-xl">
            <label className="block font-medium mb-2">Facebook App Secret</label>
            <div className="relative">
              <input
                type="password"
                placeholder="أدخل App Secret"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Messenger Profile */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          إعدادات Messenger Profile
        </h2>
        <div className="space-y-4">
          <div className="p-4 border rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">زر البدء (Get Started)</h3>
              <Zap className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500 mb-3">الزر الذي يظهر للمستخدمين الجدد</p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              تفعيل
            </button>
          </div>

          <div className="p-4 border rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">رسالة الترحيب</h3>
              <Type className="w-5 h-5 text-blue-600" />
            </div>
            <textarea
              placeholder="مرحباً! كيف يمكنني مساعدتك؟"
              className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <button className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              حفظ
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Messenger Stats */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Messenger</h2>
              <p className="text-sm text-gray-500">إحصائيات آخر 30 يوم</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.messenger?.total_conversations || 0}
              </p>
              <p className="text-sm text-gray-500">محادثة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.messenger?.total_messages || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.messenger?.messages_received || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة واردة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.messenger?.messages_sent || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة صادرة</p>
            </div>
          </div>
        </div>

        {/* Instagram Stats */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center">
              <Instagram className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Instagram</h2>
              <p className="text-sm text-gray-500">إحصائيات آخر 30 يوم</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.instagram?.total_conversations || 0}
              </p>
              <p className="text-sm text-gray-500">محادثة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.instagram?.total_messages || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.instagram?.messages_received || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة واردة</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.instagram?.messages_sent || 0}
              </p>
              <p className="text-sm text-gray-500">رسالة صادرة</p>
            </div>
          </div>
        </div>
      </div>

      {/* Response Rate */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-4">معدل الاستجابة</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="12"
                  strokeDasharray={`${(analytics?.messenger?.response_rate || 0) * 3.52} 352`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">{analytics?.messenger?.response_rate || 0}%</span>
              </div>
            </div>
            <p className="font-medium">Messenger</p>
          </div>

          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#ec4899"
                  strokeWidth="12"
                  strokeDasharray={`${(analytics?.instagram?.response_rate || 0) * 3.52} 352`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">{analytics?.instagram?.response_rate || 0}%</span>
              </div>
            </div>
            <p className="font-medium">Instagram</p>
          </div>

          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={`${((analytics?.messenger?.response_rate || 0) + (analytics?.instagram?.response_rate || 0)) / 2 * 3.52} 352`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">
                  {Math.round(((analytics?.messenger?.response_rate || 0) + (analytics?.instagram?.response_rate || 0)) / 2)}%
                </span>
              </div>
            </div>
            <p className="font-medium">المتوسط</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur">
                <Facebook className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">منصة Meta</h1>
                <p className="text-white/70">Facebook • Messenger • Instagram</p>
              </div>
            </div>
            <button
              onClick={fetchAllData}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { id: 'overview', label: 'نظرة عامة', icon: Globe },
              { id: 'messenger', label: 'Messenger', icon: MessageCircle },
              { id: 'instagram', label: 'Instagram', icon: Instagram },
              { id: 'facebook', label: 'Facebook', icon: Facebook },
              { id: 'settings', label: 'الإعدادات', icon: Settings },
              { id: 'analytics', label: 'التحليلات', icon: BarChart2 },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
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
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-10 h-10 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'messenger' && (
              <div className="space-y-6">
                <div className="flex gap-2 mb-4">
                  {[
                    { id: 'inbox', label: 'الرسائل' },
                    { id: 'pages', label: 'الصفحات' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveSubTab(tab.id as SubTabType)}
                      className={`px-4 py-2 rounded-lg ${
                        activeSubTab === tab.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {activeSubTab === 'inbox' && renderInbox()}
                {activeSubTab === 'pages' && renderPlatformPages('messenger')}
              </div>
            )}
            {activeTab === 'instagram' && renderPlatformPages('instagram')}
            {activeTab === 'facebook' && renderPlatformPages('facebook')}
            {activeTab === 'settings' && renderSettings()}
            {activeTab === 'analytics' && renderAnalytics()}
          </>
        )}
      </main>
    </div>
  );
}
