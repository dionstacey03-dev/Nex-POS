-- Business and membership visibility for the authenticated server-side application role.
-- app.user_id is set only from the Better Auth session, never from request input.

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY businesses_member_select ON businesses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM business_memberships m
      WHERE m.business_id = businesses.id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.active = true
    )
  );

CREATE POLICY businesses_owner_insert ON businesses
  FOR INSERT WITH CHECK (
    owner_user_id = nullif(current_setting('app.user_id', true), '')
  );

CREATE POLICY businesses_owner_update ON businesses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM business_memberships m
      WHERE m.business_id = businesses.id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.active = true
        AND m.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_memberships m
      WHERE m.business_id = businesses.id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.active = true
        AND m.role IN ('owner', 'admin')
    )
  );

CREATE POLICY membership_self_select ON business_memberships
  FOR SELECT USING (
    user_id = nullif(current_setting('app.user_id', true), '')
  );
