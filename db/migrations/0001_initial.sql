-- NexPOS V2 PostgreSQL baseline
-- Apply with: bunx drizzle-kit migrate (after configuring drizzle-kit).
-- All tenant-owned records carry business_id and are protected by composite foreign keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE business_role AS ENUM ('owner', 'admin', 'manager', 'cashier');
CREATE TYPE sale_status AS ENUM ('completed', 'partially_refunded', 'refunded', 'voided');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'other');
CREATE TYPE purchase_status AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
CREATE TYPE inventory_movement_type AS ENUM ('sale', 'purchase', 'adjustment', 'return', 'transfer_in', 'transfer_out');

CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  business_type varchar(32) NOT NULL DEFAULT 'general',
  currency char(3) NOT NULL DEFAULT 'LKR',
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Colombo',
  owner_user_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_memberships (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role business_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);
CREATE INDEX business_memberships_user_idx ON business_memberships(user_id, active);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  description varchar(240),
  color varchar(30),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, name)
);

CREATE TABLE inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  address varchar(300),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);
CREATE UNIQUE INDEX one_default_location_per_business ON inventory_locations(business_id) WHERE is_default;

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid,
  location_id uuid,
  name varchar(140) NOT NULL CHECK (length(trim(name)) > 0),
  description varchar(500),
  sku varchar(64) NOT NULL,
  barcode varchar(64),
  purchase_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price numeric(14,2) NOT NULL CHECK (selling_price >= 0),
  stock_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock_level numeric(14,3) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  image_url varchar(1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, sku),
  FOREIGN KEY (business_id, category_id) REFERENCES categories(business_id, id),
  FOREIGN KEY (business_id, location_id) REFERENCES inventory_locations(business_id, id)
);
CREATE UNIQUE INDEX products_business_barcode_unique ON products(business_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_business_active_idx ON products(business_id, active, name);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  phone varchar(40),
  email varchar(160),
  address varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);
CREATE INDEX customers_business_name_idx ON customers(business_id, name);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  company_name varchar(140) NOT NULL,
  contact_person varchar(120),
  phone varchar(40),
  email varchar(160),
  address varchar(300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  receipt_number varchar(64) NOT NULL,
  request_id varchar(128) NOT NULL,
  request_fingerprint char(64) NOT NULL,
  cashier_user_id text NOT NULL,
  customer_id uuid,
  location_id uuid,
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  grand_total numeric(14,2) NOT NULL CHECK (grand_total >= 0),
  currency char(3) NOT NULL,
  payment_method payment_method NOT NULL,
  amount_tendered numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_tendered >= 0),
  change_due numeric(14,2) NOT NULL DEFAULT 0 CHECK (change_due >= 0),
  payment_reference varchar(100),
  status sale_status NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, request_id),
  UNIQUE (business_id, receipt_number),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id),
  FOREIGN KEY (business_id, location_id) REFERENCES inventory_locations(business_id, id)
);
CREATE INDEX sales_business_created_idx ON sales(business_id, created_at DESC);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name varchar(140) NOT NULL,
  sku varchar(64) NOT NULL DEFAULT '',
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total >= 0),
  is_custom boolean NOT NULL DEFAULT false,
  FOREIGN KEY (business_id, sale_id) REFERENCES sales(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, product_id) REFERENCES products(business_id, id)
);
CREATE INDEX sale_items_sale_idx ON sale_items(business_id, sale_id);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  location_id uuid,
  movement_type inventory_movement_type NOT NULL,
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  previous_stock numeric(14,3) NOT NULL CHECK (previous_stock >= 0),
  new_stock numeric(14,3) NOT NULL CHECK (new_stock >= 0),
  reference_type varchar(32),
  reference_id uuid,
  reason varchar(240) NOT NULL,
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, product_id) REFERENCES products(business_id, id),
  FOREIGN KEY (business_id, location_id) REFERENCES inventory_locations(business_id, id)
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements(business_id, product_id, created_at DESC);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  request_id varchar(128) NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason varchar(240) NOT NULL,
  refund_method payment_method NOT NULL,
  payment_reference varchar(100),
  actor_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, sale_id) REFERENCES sales(business_id, id),
  UNIQUE (business_id, request_id)
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  purchase_number varchar(64) NOT NULL,
  supplier_id uuid NOT NULL,
  location_id uuid,
  status purchase_status NOT NULL DEFAULT 'draft',
  total_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, purchase_number),
  FOREIGN KEY (business_id, supplier_id) REFERENCES suppliers(business_id, id),
  FOREIGN KEY (business_id, location_id) REFERENCES inventory_locations(business_id, id)
);

CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_ordered numeric(14,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  FOREIGN KEY (business_id, purchase_order_id) REFERENCES purchase_orders(business_id, id) ON DELETE CASCADE,
  FOREIGN KEY (business_id, product_id) REFERENCES products(business_id, id)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL,
  action varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id varchar(128) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_business_created_idx ON audit_logs(business_id, created_at DESC);

-- Application connections must set app.business_id only after authorization.
-- Policies provide defence in depth; API queries must still scope every operation.
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_tenant_isolation ON business_memberships
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY categories_tenant_isolation ON categories
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY locations_tenant_isolation ON inventory_locations
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY products_tenant_isolation ON products
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY customers_tenant_isolation ON customers
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY suppliers_tenant_isolation ON suppliers
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY sales_tenant_isolation ON sales
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY sale_items_tenant_isolation ON sale_items
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY inventory_movements_tenant_isolation ON inventory_movements
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY refunds_tenant_isolation ON refunds
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY purchase_items_tenant_isolation ON purchase_order_items
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
