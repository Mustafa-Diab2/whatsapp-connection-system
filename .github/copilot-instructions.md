# GitHub Copilot Instructions for Awfar CRM

## 🎯 Project Overview

This is **Awfar CRM** - a multi-tenant CRM/ERP system with WhatsApp integration built using:
- **Backend**: Node.js + Express + TypeScript (apps/api)
- **Frontend**: Next.js 14 + React + Tailwind (apps/web)
- **Database**: PostgreSQL via Supabase
- **Real-time**: Socket.io
- **AI**: Google Gemini 2.0 Flash
- **WhatsApp**: whatsapp-web.js

## 📁 Project Structure

```
apps/
├── api/src/
│   ├── server.ts          # Main entry point
│   ├── routes/            # Express routes (22+ files)
│   ├── services/          # Business logic
│   ├── wa/WhatsAppManager.ts  # WhatsApp core (~1900 lines)
│   ├── schemas/           # Zod validation schemas
│   └── middleware/        # Auth, validation, rate limiting
│
└── web/
    ├── app/               # Next.js pages (35+ pages)
    ├── components/        # React components
    └── lib/               # Utilities, hooks, Supabase client

supabase/migrations/       # 18 SQL migration files
```

## 🔑 Key Patterns

### 1. Multi-tenancy
Always filter data by `organization_id`:
```typescript
.eq('organization_id', organizationId)
```

### 2. Validation with Zod
All API inputs should be validated:
```typescript
import { validate } from '../middleware/validate';
router.post('/', validate(createSchema), handler);
```

### 3. Error Messages in Arabic
User-facing errors should be in Arabic:
```typescript
throw new Error("رقم غير صالح");
res.status(400).json({ error: "البيانات غير صحيحة" });
```

### 4. Socket.io Events
Real-time events follow this pattern:
```typescript
io.to(`org:${organizationId}`).emit('wa:message', data);
// Events: wa:qr, wa:state, wa:message, wa:message_ack, campaign:update
```

### 5. Database Queries
Use Supabase client:
```typescript
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('organization_id', orgId);
```

## 📊 Main Database Tables

### CRM
- `organizations`, `users`, `customers`, `contacts`
- `conversations`, `messages`, `deals`, `deal_stages`

### ERP
- `products`, `orders`, `order_items`, `invoices`
- `vendors`, `purchase_orders`, `tasks`

### Marketing
- `campaigns`, `campaign_logs`, `quick_replies`

### Integrations
- `facebook_pages`, `messenger_pages`, `messenger_conversations`
- `click_attribution_events`

## 🔧 Important Services

### WhatsAppManager (apps/api/src/wa/WhatsAppManager.ts)
The most critical file. Handles:
- Session management (connect/disconnect/reset)
- Message sending (text, media, buttons, lists)
- AI bot responses (Gemini integration)
- Contact/conversation sync

### FacebookService (apps/api/src/services/facebook.service.ts)
Handles:
- OAuth authentication
- Token encryption (AES-256-GCM)
- Messenger API
- Conversions API

## 🎨 Frontend Conventions

### API Calls
Use axios with the configured base URL:
```typescript
import axios from 'axios';
const API_URL = process.env.NEXT_PUBLIC_API_URL;
axios.get(`${API_URL}/api/endpoint`, { withCredentials: true });
```

### Supabase Client
```typescript
import { supabase, useSupabase } from '@/lib/supabase';
const { session, organizationId } = useSupabase();
```

### Styling
Use Tailwind CSS classes. RTL support is built-in.

## ⚠️ Important Notes

1. **WhatsApp sessions** are stored in `wa_auth` Docker volume
2. **Facebook tokens** are encrypted with AES-256-GCM
3. **Rate limiting** is applied to all endpoints
4. **JWT tokens** expire in 7 days
5. All dates use **TIMESTAMPTZ** in PostgreSQL

## 🔄 Common Tasks

### Adding a new API endpoint
1. Create route in `apps/api/src/routes/`
2. Add Zod schema in `apps/api/src/schemas/`
3. Register in `server.ts`

### Adding a new page
1. Create folder in `apps/web/app/`
2. Add `page.tsx`
3. Update Sidebar if needed

### Adding a new database table
1. Create migration in `supabase/migrations/`
2. Follow naming: `XXX_description.sql`
3. Include RLS policies

## 🐛 Debugging

### WhatsApp Issues
Check `WHATSAPP_ERROR_FIXES.md` for common solutions.

### API Logs
```bash
docker-compose logs -f api
```

### Database
Use Supabase dashboard or psql.
