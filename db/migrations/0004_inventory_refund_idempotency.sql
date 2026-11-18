-- Idempotent inventory adjustment requests and one full refund record per sale.
ALTER TABLE inventory_movements ADD COLUMN request_id varchar(128);
CREATE UNIQUE INDEX inventory_movement_request_unique
  ON inventory_movements(business_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX refunds_one_full_refund_per_sale
  ON refunds(business_id, sale_id);
