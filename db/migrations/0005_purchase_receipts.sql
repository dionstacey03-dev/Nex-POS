CREATE TABLE purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  request_id varchar(128) NOT NULL,
  received_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, request_id),
  FOREIGN KEY (business_id, purchase_order_id) REFERENCES purchase_orders(business_id, id)
);
CREATE TABLE purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  purchase_order_item_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_received numeric(14,3) NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  FOREIGN KEY (business_id, receipt_id) REFERENCES purchase_receipts(business_id, id),
  FOREIGN KEY (business_id, product_id) REFERENCES products(business_id, id)
);
ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_receipts_tenant_isolation ON purchase_receipts
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY purchase_receipt_items_tenant_isolation ON purchase_receipt_items
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
