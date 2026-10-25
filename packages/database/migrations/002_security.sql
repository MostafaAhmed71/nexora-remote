ALTER TABLE devices ADD COLUMN acl_enforced boolean NOT NULL DEFAULT true;
CREATE TABLE device_acl(org_id uuid NOT NULL,device_id uuid NOT NULL,user_id uuid NOT NULL,permission text NOT NULL CHECK(permission IN ('view','control','clipboard','files')),PRIMARY KEY(device_id,user_id,permission),FOREIGN KEY(org_id,device_id) REFERENCES devices(org_id,id),FOREIGN KEY(org_id,user_id) REFERENCES memberships(org_id,user_id));
ALTER TABLE device_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_acl FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON device_acl USING(org_id::text=current_setting('app.org_id',true)) WITH CHECK(org_id::text=current_setting('app.org_id',true));
CREATE TABLE mfa_recovery_codes(user_id uuid NOT NULL REFERENCES users,code_hash text PRIMARY KEY,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX mfa_recovery_user ON mfa_recovery_codes(user_id);

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nexora_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON device_acl,mfa_recovery_codes TO nexora_app; END IF; END $$;
