-- ============================================================================
-- Peniel Portal — core schema
--
-- Columns marked (internal) must never reach a customer. Customers have no
-- policies on these base tables at all; they read only through the
-- customer_* views defined in a later migration.
-- ============================================================================

-- Helpers, trigger functions and counters live in `app`, which is NOT exposed
-- through the Supabase API (only `public` is).
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'customer_user', 'admin', 'sales', 'production', 'quality', 'warehouse'
);

create type public.order_status as enum (
  'submitted', 'confirmed', 'awaiting_approval', 'scheduled', 'in_production',
  'quality_check', 'ready_for_pickup', 'dispatched', 'delivered', 'on_hold',
  'rejected'
);

create type public.delivery_method as enum ('pickup', 'delivery');
create type public.attachment_type as enum ('purchase_order', 'specification', 'other');
create type public.qc_result as enum ('released', 'on_hold');
create type public.stock_status as enum ('available', 'reserved', 'on_hold');
create type public.pickup_status as enum ('requested', 'confirmed', 'rescheduled', 'collected');
create type public.proof_status as enum ('sent', 'approved', 'changes_requested');
create type public.document_visibility as enum ('customer', 'internal');

-- ---------------------------------------------------------------------------
-- Companies, brands, people
-- ---------------------------------------------------------------------------
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null unique,
  contact_name  text,
  contact_email text,
  contact_phone text,
  address       text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.brands (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies (id),
  name                       text not null,
  crown_image_path           text,
  size                       text not null default '26mm',
  liner                      text not null default 'PVC-free' check (liner in ('PVC-free', 'PVC')),
  finish                     text,
  colours                    text[] not null default '{}',
  current_artwork_version_id uuid,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (company_id, name),
  -- lets child tables enforce "brand belongs to the same company"
  unique (id, company_id)
);

create table public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  company_id    uuid references public.companies (id),
  full_name     text not null,
  email         text,
  role          public.user_role not null,
  active        boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- customers belong to exactly one company; staff belong to none
  constraint profiles_company_matches_role
    check ((role = 'customer_user') = (company_id is not null))
);
create index on public.profiles (company_id);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table app.order_counters (
  year    int primary key,
  last_no int not null
);

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_no           text not null unique,
  company_id         uuid not null references public.companies (id),
  brand_id           uuid not null,
  po_number          text not null,
  quantity           bigint not null check (quantity > 0),
  requested_date     date,
  confirmed_due_date date,
  revised_due_date   date,
  delivery_method    public.delivery_method not null default 'pickup',
  delivery_address   text,
  status             public.order_status not null default 'submitted',
  customer_reason    text,
  internal_notes     text,                         -- (internal)
  submitted_by       uuid references public.profiles (user_id),
  confirmed_by       uuid references public.profiles (user_id),
  confirmed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (brand_id, company_id) references public.brands (id, company_id),
  unique (id, company_id)
);
create index on public.orders (company_id, created_at desc);
create index on public.orders (status);

create table public.order_status_events (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  status          public.order_status not null,
  customer_reason text,
  internal_notes  text,                            -- (internal)
  created_by      uuid references public.profiles (user_id),
  created_at      timestamptz not null default now()
);
create index on public.order_status_events (order_id, created_at);

create table public.order_attachments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null,
  company_id  uuid not null references public.companies (id),
  file_path   text not null unique,
  file_name   text not null,
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  mime_type   text not null check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  type        public.attachment_type not null default 'other',
  uploaded_by uuid references public.profiles (user_id),
  created_at  timestamptz not null default now(),
  foreign key (order_id, company_id) references public.orders (id, company_id) on delete cascade,
  constraint order_attachments_path_in_company_folder
    check (file_path like company_id::text || '/%')
);
create index on public.order_attachments (order_id);

-- ---------------------------------------------------------------------------
-- Production and quality
-- ---------------------------------------------------------------------------
create table public.production_lines (                -- (internal table)
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  active boolean not null default true
);

create table public.production_entries (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id),
  entry_date   date not null,
  shift        text not null,
  line_id      uuid not null references public.production_lines (id),  -- (internal)
  produced_qty bigint not null check (produced_qty >= 0),
  reject_qty   bigint not null default 0 check (reject_qty >= 0),
  entered_by   uuid references public.profiles (user_id),
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.production_entries (order_id, entry_date);

create table public.defect_types (
  code           text primary key,
  customer_label text not null,
  active         boolean not null default true
);

create table public.qc_inspections (
  id              uuid primary key default gen_random_uuid(),
  batch_no        text not null unique,
  order_id        uuid not null references public.orders (id),
  inspected_at    timestamptz not null default now(),
  sample_size     int not null check (sample_size > 0),
  measurements    jsonb not null default '{}',     -- (internal)
  reject_pct      numeric(5, 2) not null default 0 check (reject_pct between 0 and 100),
  result          public.qc_result,
  customer_reason text,
  internal_notes  text,                             -- (internal)
  published       boolean not null default false,
  inspector_id    uuid references public.profiles (user_id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint qc_hold_needs_customer_reason
    check (result is distinct from 'on_hold' or nullif(btrim(customer_reason), '') is not null)
);
create index on public.qc_inspections (order_id);

create table public.qc_defects (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qc_inspections (id) on delete cascade,
  defect_type   text not null references public.defect_types (code),
  count         int not null check (count >= 0),
  unique (inspection_id, defect_type)
);

-- ---------------------------------------------------------------------------
-- Inventory                                           (raw materials internal)
-- ---------------------------------------------------------------------------
create table public.raw_materials (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  unit          text not null,
  on_hand       numeric not null default 0,
  reorder_level numeric,
  updated_at    timestamptz not null default now()
);

create table public.raw_material_movements (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.raw_materials (id),
  quantity    numeric not null,                  -- positive = in, negative = out
  reason      text not null,
  order_id    uuid references public.orders (id),
  created_by  uuid references public.profiles (user_id),
  created_at  timestamptz not null default now()
);

create table public.finished_stock (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id),
  brand_id        uuid not null,
  order_id        uuid,
  batch_no        text not null,
  quantity        bigint not null check (quantity >= 0),
  location        text,                            -- (internal)
  ready_since     timestamptz not null default now(),
  status          public.stock_status not null default 'available',
  customer_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (brand_id, company_id) references public.brands (id, company_id),
  foreign key (order_id, company_id) references public.orders (id, company_id),
  constraint stock_hold_needs_customer_reason
    check (status <> 'on_hold' or nullif(btrim(customer_reason), '') is not null)
);
create index on public.finished_stock (company_id);

create table public.pickup_bookings (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id),
  requested_at     timestamptz not null,
  requested_by     uuid references public.profiles (user_id),
  customer_note    text,
  status           public.pickup_status not null default 'requested',
  proposed_time    timestamptz,
  vehicle          text,
  driver           text,
  delivery_note_no text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.pickup_bookings (company_id);

create table public.pickup_booking_items (
  booking_id uuid not null references public.pickup_bookings (id) on delete cascade,
  stock_id   uuid not null references public.finished_stock (id),
  primary key (booking_id, stock_id)
);

-- ---------------------------------------------------------------------------
-- Artwork, proofs, documents
-- ---------------------------------------------------------------------------
create table public.artwork_versions (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id),
  version     int not null check (version > 0),
  file_path   text not null,
  approved_at timestamptz,
  approved_by uuid references public.profiles (user_id),
  created_at  timestamptz not null default now(),
  unique (brand_id, version)
);

alter table public.brands
  add constraint brands_current_artwork_fk
  foreign key (current_artwork_version_id) references public.artwork_versions (id);

create table public.proofs (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.brands (id),
  order_id         uuid references public.orders (id),
  file_path        text not null,
  status           public.proof_status not null default 'sent',
  customer_comment text,
  sent_by          uuid references public.profiles (user_id),
  responded_by     uuid references public.profiles (user_id),
  responded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.proofs (brand_id);

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id),
  brand_id    uuid,
  order_id    uuid,
  type        text not null,
  title       text not null,
  file_name   text not null,
  file_path   text not null,
  visibility  public.document_visibility not null default 'internal',
  uploaded_by uuid references public.profiles (user_id),
  created_at  timestamptz not null default now(),
  foreign key (brand_id, company_id) references public.brands (id, company_id),
  foreign key (order_id, company_id) references public.orders (id, company_id)
);
create index on public.documents (company_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id),
  order_id        uuid,
  subject         text not null,
  assigned_to     uuid references public.profiles (user_id),
  created_by      uuid references public.profiles (user_id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  foreign key (order_id, company_id) references public.orders (id, company_id)
);
create index on public.message_threads (company_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.message_threads (id) on delete cascade,
  author_id        uuid not null references public.profiles (user_id),
  body             text not null check (length(btrim(body)) > 0),
  read_by_customer boolean not null default false,
  read_by_staff    boolean not null default false,
  created_at       timestamptz not null default now()
);
create index on public.messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Staff helpers
-- ---------------------------------------------------------------------------
create table public.hold_reason_presets (
  id         uuid primary key default gen_random_uuid(),
  text       text not null unique,
  sort_order int not null default 0,
  active     boolean not null default true
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (entity, entity_id);
create index on public.audit_log (created_at desc);
