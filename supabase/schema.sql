-- 報修登記系統：資料表結構
-- 此檔案僅供部署時手動執行；不包含任何連線資訊或真實資料。

create table public.repair_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_name text not null,
  location text not null,
  category text not null,
  description text not null,
  urgency text not null default '中',
  status text not null default '待處理',

  -- CHECK：限制選項值，避免寫入系統未定義的分類或狀態。
  constraint repair_requests_category_check
    check (category in ('設備', '網路', '環境', '其他')),
  constraint repair_requests_urgency_check
    check (urgency in ('低', '中', '高')),
  constraint repair_requests_status_check
    check (status in ('待處理', '處理中', '已完成')),

  -- CHECK：限制文字不可只含空白，並設定合理長度上限。
  constraint repair_requests_reporter_name_length_check
    check (char_length(btrim(reporter_name)) between 1 and 100),
  constraint repair_requests_location_length_check
    check (char_length(btrim(location)) between 1 and 200),
  constraint repair_requests_description_length_check
    check (char_length(btrim(description)) between 1 and 2000)
);

-- GRANT：先移除新資料表可能繼承或既有的權限，採最小權限原則。
revoke all on table public.repair_requests from public, anon, authenticated;

-- GRANT：anon 需要 public schema 的使用權，才能引用其中的資料表。
grant usage on schema public to anon;

-- GRANT：anon 可以讀取完整清單，但不能修改或刪除資料。
grant select on table public.repair_requests to anon;

-- GRANT：anon 只能提供新增報修所需欄位；id、created_at、status 由資料庫產生。
-- urgency 可省略並使用預設值；若提供，仍須通過 CHECK 限制。
grant insert (
  reporter_name,
  location,
  category,
  description,
  urgency
) on table public.repair_requests to anon;

-- RLS：啟用資料列安全，避免僅依賴 GRANT 控制資料存取。
alter table public.repair_requests enable row level security;

-- RLS：任何使用 anon 角色的訪客都可以讀取報修清單。
create policy "anon 可讀取報修清單"
on public.repair_requests
for select
to anon
using (true);

-- RLS：任何使用 anon 角色的訪客都可以新增報修，但初始狀態必須是「待處理」。
create policy "anon 可新增待處理報修"
on public.repair_requests
for insert
to anon
with check (status = '待處理');

-- RLS：刻意不建立 UPDATE 或 DELETE policy；配合未授予的權限，anon 無法修改或刪除。
