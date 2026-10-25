CREATE TABLE organizations(id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users(id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL, mfa_secret text, pending_mfa text,pending_mfa_expires timestamptz,mfa_counter bigint, platform_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE roles(name text PRIMARY KEY);
INSERT INTO roles VALUES ('owner'),('admin'),('technician'),('employee'),('viewer');
CREATE TABLE permissions(name text PRIMARY KEY);
INSERT INTO permissions VALUES ('view'),('control'),('devices'),('users'),('terminate'),('audit'),('settings');
CREATE TABLE role_permissions(role text REFERENCES roles,permission text REFERENCES permissions,PRIMARY KEY(role,permission));
INSERT INTO role_permissions SELECT 'owner',name FROM permissions;
INSERT INTO role_permissions SELECT 'admin',name FROM permissions WHERE name <> 'settings';
INSERT INTO role_permissions VALUES ('technician','view'),('technician','control'),('technician','terminate'),('employee','view'),('viewer','view');
CREATE TABLE memberships(org_id uuid REFERENCES organizations, user_id uuid REFERENCES users, role text NOT NULL REFERENCES roles,PRIMARY KEY(org_id,user_id));
CREATE TABLE auth_sessions(id_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE password_resets(token_hash text PRIMARY KEY,user_id uuid REFERENCES users,expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE device_groups(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,name text NOT NULL,UNIQUE(org_id,id),UNIQUE(org_id,name));
CREATE TABLE device_enrollments(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,token_hash text UNIQUE NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_by uuid REFERENCES users);
CREATE TABLE devices(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,group_id uuid,name text NOT NULL,public_key text NOT NULL,os text NOT NULL,agent_version text NOT NULL,capabilities jsonb NOT NULL DEFAULT '[]',last_seen timestamptz,revoked_at timestamptz,UNIQUE(org_id,id),FOREIGN KEY(org_id,group_id) REFERENCES device_groups(org_id,id));
CREATE INDEX devices_org_seen ON devices(org_id,last_seen);
CREATE TABLE remote_sessions(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,device_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users,auth_session_hash text,mode text NOT NULL CHECK(mode IN ('view','control')),state text NOT NULL CHECK(state IN ('authorized','active','ended')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,ended_at timestamptz,FOREIGN KEY(org_id,device_id) REFERENCES devices(org_id,id),UNIQUE(org_id,id));
CREATE INDEX remote_sessions_org_state ON remote_sessions(org_id,state);
CREATE TABLE session_permissions(org_id uuid NOT NULL,session_id uuid NOT NULL,permission text REFERENCES permissions,PRIMARY KEY(session_id,permission),FOREIGN KEY(org_id,session_id) REFERENCES remote_sessions(org_id,id));
CREATE TABLE audit_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,actor_id uuid REFERENCES users,event text NOT NULL,target_id uuid,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_logs_org_time ON audit_logs(org_id,created_at DESC);
CREATE TABLE agent_versions(version text PRIMARY KEY,minimum_protocol integer NOT NULL,sha256 text,approved boolean NOT NULL DEFAULT false);
CREATE TABLE plans(id text PRIMARY KEY,name text NOT NULL,device_limit integer NOT NULL CHECK(device_limit>0),member_limit integer NOT NULL CHECK(member_limit>0));
CREATE TABLE subscriptions(org_id uuid PRIMARY KEY REFERENCES organizations,plan_id text NOT NULL REFERENCES plans,status text NOT NULL CHECK(status IN ('trial','active','suspended')),expires_at timestamptz);
-- FORCE RLS protects even table owners; deploy with a non-superuser, non-BYPASSRLS application role.
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['memberships','device_groups','device_enrollments','devices','remote_sessions','session_permissions','audit_logs','subscriptions'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant ON %I USING (org_id::text = current_setting(''app.org_id'',true)) WITH CHECK (org_id::text = current_setting(''app.org_id'',true))',t);
END LOOP; END $$;
