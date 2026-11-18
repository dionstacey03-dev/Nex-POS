ALTER TABLE inventory_movements
  ADD COLUMN product_name varchar(140) NOT NULL DEFAULT '',
  ADD COLUMN actor_name varchar(120) NOT NULL DEFAULT '';
ALTER TABLE purchase_order_items
  ADD COLUMN product_name varchar(140) NOT NULL DEFAULT '',
  ADD COLUMN sku varchar(64) NOT NULL DEFAULT '';
ALTER TABLE sales
  ADD COLUMN discount_type varchar(16),
  ADD COLUMN discount_value numeric(14,2) NOT NULL DEFAULT 0;
