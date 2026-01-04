'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ShoppingBag, Phone, MessageCircle, Search, Tag, Check } from 'lucide-react';
import Image from 'next/image';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  sale_price?: number;
  images: string[];
  stock_quantity: number;
  category?: string;
}

interface Catalog {
  id: string;
  name: string;
  description: string;
  theme_color: string;
  cover_image?: string;
  show_prices: boolean;
  show_stock: boolean;
  organization?: {
    name: string;
    logo_url?: string;
    phone?: string;
  };
}

export default function ShopPage() {
  const params = useParams();
  const shortCode = params.code as string;
  
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [showCart, setShowCart] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (shortCode) {
      fetchCatalog();
    }
  }, [shortCode]);

  const fetchCatalog = async () => {
    try {
      const res = await fetch(`${API_URL}/api/catalogs/public/${shortCode}`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setCatalog(data.catalog);
        setProducts(data.products || []);
      }
    } catch (err) {
      setError('فشل في تحميل الكتالوج');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const sendOrderViaWhatsApp = () => {
    if (!catalog?.organization?.phone || cart.length === 0) return;

    const orderDetails = cart.map(item => 
      `• ${item.product.name} x${item.quantity} - ${((item.product.sale_price || item.product.price) * item.quantity).toFixed(2)} ج.م`
    ).join('\n');

    const total = cart.reduce((sum, item) => 
      sum + (item.product.sale_price || item.product.price) * item.quantity, 0
    );

    const message = `🛒 *طلب جديد*

${orderDetails}

💰 *الإجمالي: ${total.toFixed(2)} ج.م*

من فضلك أكد الطلب 🙏`;

    const phone = catalog.organization.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const categories: string[] = ['all', ...new Set(products.map(p => p.category).filter((c): c is string => Boolean(c)))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce((sum, item) => 
    sum + (item.product.sale_price || item.product.price) * item.quantity, 0
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">الكتالوج غير موجود</h1>
          <p className="text-gray-500">{error || 'تأكد من الرابط وحاول مرة أخرى'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header 
        className="sticky top-0 z-40 text-white p-4"
        style={{ backgroundColor: catalog.theme_color }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {catalog.organization?.logo_url ? (
              <img 
                src={catalog.organization.logo_url} 
                alt={catalog.organization.name}
                className="w-10 h-10 rounded-full bg-white object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="font-bold">{catalog.name}</h1>
              <p className="text-sm opacity-80">{catalog.organization?.name}</p>
            </div>
          </div>
          
          {cart.length > 0 && (
            <button 
              onClick={() => setShowCart(true)}
              className="relative bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
            >
              <ShoppingBag className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Cover Image */}
      {catalog.cover_image && (
        <div className="relative h-48 md:h-64">
          <img 
            src={catalog.cover_image} 
            alt={catalog.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Description */}
      {catalog.description && (
        <div className="max-w-4xl mx-auto p-4">
          <p className="text-gray-600">{catalog.description}</p>
        </div>
      )}

      {/* Search & Filter */}
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="ابحث عن منتج..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                style={selectedCategory === category ? { backgroundColor: catalog.theme_color } : {}}
              >
                {category === 'all' ? 'الكل' : category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products Grid */}
      <div className="max-w-4xl mx-auto p-4">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">لا توجد منتجات</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map(product => {
              const inCart = cart.find(item => item.product.id === product.id);
              const price = product.sale_price || product.price;
              
              return (
                <div 
                  key={product.id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-square bg-gray-100">
                    {product.images?.[0] ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-gray-300" />
                      </div>
                    )}
                    
                    {product.sale_price && (
                      <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                        خصم
                      </span>
                    )}
                  </div>
                  
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 line-clamp-2">{product.name}</h3>
                    
                    {catalog.show_prices && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-bold" style={{ color: catalog.theme_color }}>
                          {price.toFixed(2)} ج.م
                        </span>
                        {product.sale_price && (
                          <span className="text-sm text-gray-400 line-through">
                            {product.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {catalog.show_stock && (
                      <p className={`text-xs mt-1 ${product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {product.stock_quantity > 0 ? `متوفر (${product.stock_quantity})` : 'غير متوفر'}
                      </p>
                    )}
                    
                    <button
                      onClick={() => addToCart(product)}
                      disabled={catalog.show_stock && product.stock_quantity === 0}
                      className={`mt-3 w-full py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                        inCart 
                          ? 'bg-green-100 text-green-700'
                          : 'text-white disabled:bg-gray-300'
                      }`}
                      style={!inCart ? { backgroundColor: catalog.theme_color } : {}}
                    >
                      {inCart ? (
                        <>
                          <Check className="w-4 h-4" />
                          في السلة ({inCart.quantity})
                        </>
                      ) : (
                        'أضف للسلة'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{cart.length} منتج في السلة</p>
              <p className="font-bold text-lg">{cartTotal.toFixed(2)} ج.م</p>
            </div>
            <button
              onClick={sendOrderViaWhatsApp}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              اطلب عبر واتساب
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">سلة التسوق</h2>
              <button onClick={() => setShowCart(false)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {cart.map(item => (
                <div key={item.product.id} className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {item.product.images?.[0] ? (
                      <img src={item.product.images[0]} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{item.product.name}</h3>
                    <p className="text-sm text-gray-500">
                      {(item.product.sale_price || item.product.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
            
            <div className="sticky bottom-0 bg-white border-t p-4">
              <div className="flex justify-between mb-4">
                <span className="text-gray-600">الإجمالي</span>
                <span className="font-bold text-lg">{cartTotal.toFixed(2)} ج.م</span>
              </div>
              <button
                onClick={sendOrderViaWhatsApp}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                اطلب عبر واتساب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Float Button */}
      {catalog.organization?.phone && (
        <a
          href={`https://wa.me/${catalog.organization.phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-20 left-4 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-colors z-40"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      )}
    </div>
  );
}
