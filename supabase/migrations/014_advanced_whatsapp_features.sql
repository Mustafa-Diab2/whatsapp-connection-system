-- Migration: 014_advanced_whatsapp_features
-- Description: Adding columns for receipts, reactions, quoted replies, and advanced media

-- 1. Update messages table for status receipts, quoted messages, and reactions
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
ADD COLUMN IF NOT EXISTS quoted_message_id TEXT,
ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS location_lng DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS location_name TEXT,
ADD COLUMN IF NOT EXISTS poll_data JSONB DEFAULT '{}';

-- 2. Update message_type check if needed (or just use TEXT)
-- Since we already have a CHECK constraint, let's update it.
-- In Supabase, it's safer to drop and recreate the constraint if we need more types.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check 
CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'vcard', 'poll'));

-- 3. Create a view for easy reporting if necessary
CREATE OR REPLACE VIEW message_details AS
SELECT 
    m.*,
    q.body as quoted_body,
    q.from_phone as quoted_from
FROM messages m
LEFT JOIN messages q ON m.quoted_message_id = q.wa_message_id;
