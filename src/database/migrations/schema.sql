CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  first_contact_at TIMESTAMP,
  last_contact_at TIMESTAMP,
  channel TEXT DEFAULT 'whatsapp',
  phone TEXT UNIQUE,
  whatsapp_id TEXT,
  whatsapp_lid TEXT,
  display_phone TEXT,
  name TEXT,
  email TEXT,
  username TEXT,
  source_keyword TEXT,
  main_pain TEXT,
  emotional_response TEXT,
  problem_duration TEXT,
  tried_before TEXT,
  urgency INTEGER,
  lead_score INTEGER DEFAULT 0,
  lead_status TEXT DEFAULT 'frio',
  funnel_stage TEXT DEFAULT 'inicio',
  main_objection TEXT,
  objection_type TEXT,
  video_sent BOOLEAN DEFAULT FALSE,
  video_sent_at TIMESTAMP,
  pdf_sent BOOLEAN DEFAULT FALSE,
  pdf_sent_at TIMESTAMP,
  offer_presented BOOLEAN DEFAULT FALSE,
  offer_presented_at TIMESTAMP,
  hotmart_link_sent BOOLEAN DEFAULT FALSE,
  hotmart_link_sent_at TIMESTAMP,
  purchase_intent BOOLEAN DEFAULT FALSE,
  closed_conversation BOOLEAN DEFAULT FALSE,
  crisis_detected BOOLEAN DEFAULT FALSE,
  payment_status TEXT DEFAULT 'pendiente',
  human_takeover BOOLEAN DEFAULT FALSE,
  bot_paused BOOLEAN DEFAULT FALSE,
  consent_24h BOOLEAN DEFAULT TRUE,
  memory_expires_at TIMESTAMP,
  last_user_message TEXT,
  last_bot_message TEXT,
  notes TEXT
);

ALTER TABLE leads ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_lid TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS display_phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS objection_type TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS video_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS video_sent_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pdf_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pdf_sent_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offer_presented BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS offer_presented_at TIMESTAMP;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS purchase_intent BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_conversation BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS crisis_detected BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT,
  whatsapp_id TEXT,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP,
  expires_at TIMESTAMP,
  summary TEXT,
  current_step TEXT,
  metadata JSONB DEFAULT '{}'
);

ALTER TABLE conversations ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_id TEXT;

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_id TEXT,
  direction TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  body TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_id TEXT;

CREATE TABLE IF NOT EXISTS conversation_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT,
  memory JSONB DEFAULT '{}',
  summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

ALTER TABLE conversation_memory ALTER COLUMN phone DROP NOT NULL;

CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  json_value JSONB,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT DEFAULT 'disconnected',
  qr_code TEXT,
  connected_phone TEXT,
  last_qr_at TIMESTAMP,
  last_connected_at TIMESTAMP,
  last_disconnected_at TIMESTAMP,
  session_info JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT,
  status TEXT DEFAULT 'pending',
  provider TEXT DEFAULT 'hotmart',
  amount NUMERIC DEFAULT 270,
  currency TEXT DEFAULT 'USD',
  payment_link TEXT,
  reported_by_user BOOLEAN DEFAULT FALSE,
  confirmed_manually BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT,
  whatsapp_id TEXT,
  type TEXT,
  scheduled_at TIMESTAMP,
  sent_at TIMESTAMP,
  status TEXT DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE followups ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE followups ADD COLUMN IF NOT EXISTS whatsapp_id TEXT;

CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  action TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_id ON leads(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_lid ON leads(whatsapp_lid);
CREATE INDEX IF NOT EXISTS idx_leads_display_phone ON leads(display_phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_funnel_stage ON leads(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_id ON conversations(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_created ON messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON conversation_memory(expires_at);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_followups_whatsapp_id ON followups(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_payments_lead_id ON payments(lead_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated_at'
  ) THEN
    CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_memory_updated_at'
  ) THEN
    CREATE TRIGGER trg_memory_updated_at
    BEFORE UPDATE ON conversation_memory
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settings_updated_at'
  ) THEN
    CREATE TRIGGER trg_settings_updated_at
    BEFORE UPDATE ON bot_settings
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_whatsapp_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_whatsapp_sessions_updated_at
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
