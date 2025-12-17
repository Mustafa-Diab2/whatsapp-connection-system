/** @type {import('next').NextConfig} */
const nextConfig = {
  // تحسين للنشر على Vercel
  output: 'standalone',

  // السماح بالصور من أي مصدر
  images: {
    domains: ['*'],
    unoptimized: true,
  },

  // تحسين الأداء
  compress: true,

  // إعدادات البيئة
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
