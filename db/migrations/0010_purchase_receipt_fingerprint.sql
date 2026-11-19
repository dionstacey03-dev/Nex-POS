-- Bind each purchase receipt idempotency key to its exact receiving payload.
ALTER TABLE purchase_receipts
  ADD COLUMN request_fingerprint char(64) NOT NULL DEFAULT repeat('0', 64);

ALTER TABLE purchase_receipts
  ALTER COLUMN request_fingerprint DROP DEFAULT;
