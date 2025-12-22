-- 1. Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- 2. Create a table to store your documents/knowledge base
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) not null,
  content text not null,        -- The actual text chunk
  source text,                  -- e.g., "Generic FAQ", "Pricing PDF"
  metadata jsonb,               -- Any extra info
  embedding vector(768),        -- 768 is the dimension for Gemini Pro embeddings
  created_at timestamptz default now()
);

-- 3. Create an index for faster similarity search
create index on documents using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- 4. Create a function to search for similar documents
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_org_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  and documents.organization_id = filter_org_id
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 5. Enable RLS (Optional, usually good to have)
alter table documents enable row level security;
