-- Bind each refund idempotency key to the exact refund request payload.
-- Existing rows receive a deterministic legacy fingerprint; new requests always
-- provide a SHA-256 fingerprint from the trusted API.
ALTER TABLE refunds ADD COLUMN request_fingerprint char(64);
UPDATE refunds
SET request_fingerprint = encode(digest(
  sale_id::text || ':' || reason || ':' || refund_method::text || ':' || coalesce(payment_reference, ''),
  'sha256'
), 'hex')
WHERE request_fingerprint IS NULL;
ALTER TABLE refunds ALTER COLUMN request_fingerprint SET NOT NULL;
