-- Prevent mutation of financial and stock ledgers after insertion.
CREATE UNIQUE INDEX purchase_order_items_business_id_unique
  ON purchase_order_items(business_id, id);

ALTER TABLE purchase_receipt_items
  ADD CONSTRAINT purchase_receipt_items_po_line_fk
  FOREIGN KEY (business_id, purchase_order_item_id)
  REFERENCES purchase_order_items(business_id, id);

CREATE OR REPLACE FUNCTION reject_immutable_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger rows are append-only: % is not permitted on %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER sale_items_append_only
  BEFORE UPDATE OR DELETE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();
CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();
CREATE TRIGGER refunds_append_only
  BEFORE UPDATE OR DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();
CREATE TRIGGER purchase_receipts_append_only
  BEFORE UPDATE OR DELETE ON purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();
CREATE TRIGGER purchase_receipt_items_append_only
  BEFORE UPDATE OR DELETE ON purchase_receipt_items
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_mutation();

CREATE OR REPLACE FUNCTION enforce_sale_refund_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Sale financial fields are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'completed' OR NEW.status <> 'refunded' THEN
    RAISE EXCEPTION 'Invalid sale status transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_refund_transition_only
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION enforce_sale_refund_transition();

CREATE OR REPLACE FUNCTION enforce_purchase_order_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Purchase order details are immutable after creation' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.status = 'ordered' AND NEW.status IN ('partially_received','received')) OR
    (OLD.status = 'partially_received' AND NEW.status = 'received')
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order status transition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_order_status_transition_only
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_status_transition();

CREATE OR REPLACE FUNCTION enforce_purchase_order_quantity_receiving()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'quantity_received') IS DISTINCT FROM (to_jsonb(OLD) - 'quantity_received') THEN
    RAISE EXCEPTION 'Purchase order line details are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.quantity_received < OLD.quantity_received OR NEW.quantity_received > NEW.quantity_ordered THEN
    RAISE EXCEPTION 'Invalid received quantity transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER purchase_order_line_receiving_only
  BEFORE UPDATE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_quantity_receiving();
