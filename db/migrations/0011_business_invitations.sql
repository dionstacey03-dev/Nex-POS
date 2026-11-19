CREATE TABLE business_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email varchar(160) NOT NULL,
  role business_role NOT NULL CHECK (role IN ('admin','manager','cashier')),
  token_hash char(64) NOT NULL UNIQUE,
  invited_by_user_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_invitations_business_email_idx
  ON business_invitations(business_id, lower(email), created_at DESC);
CREATE INDEX business_invitations_expiry_idx
  ON business_invitations(expires_at) WHERE accepted_at IS NULL;

ALTER TABLE business_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_invitations_tenant_isolation ON business_invitations
  USING (business_id = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK (business_id = nullif(current_setting('app.business_id', true), '')::uuid);
