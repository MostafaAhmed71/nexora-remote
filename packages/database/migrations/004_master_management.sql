CREATE TABLE time_packages(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 10080),UNIQUE(org_id,id));
CREATE TABLE classroom_profiles(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),apps jsonb NOT NULL DEFAULT '[]',sites jsonb NOT NULL DEFAULT '[]',UNIQUE(org_id,id));
CREATE TABLE device_management(org_id uuid NOT NULL,device_id uuid NOT NULL,room text NOT NULL DEFAULT '',seat_x integer NOT NULL DEFAULT 0 CHECK(seat_x BETWEEN 0 AND 20),seat_y integer NOT NULL DEFAULT 0 CHECK(seat_y BETWEEN 0 AND 20),notes text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 0,locked boolean NOT NULL DEFAULT false,ends_at timestamptz,paused_seconds integer CHECK(paused_seconds>=0),profile_id uuid,agent_revision integer,agent_seen timestamptz,agent_error text,PRIMARY KEY(org_id,device_id),FOREIGN KEY(org_id,device_id) REFERENCES devices(org_id,id),FOREIGN KEY(org_id,profile_id) REFERENCES classroom_profiles(org_id,id));
CREATE TABLE managed_files(id uuid PRIMARY KEY,org_id uuid NOT NULL,device_id uuid NOT NULL,created_by uuid REFERENCES users,direction text NOT NULL CHECK(direction IN ('to_device','from_device')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),size integer NOT NULL CHECK(size BETWEEN 0 AND 10485760),data bytea NOT NULL DEFAULT '',transferred integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete','cancelled','rejected')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day',FOREIGN KEY(org_id,device_id) REFERENCES devices(org_id,id));
CREATE INDEX managed_files_pending ON managed_files(org_id,device_id,status);
CREATE UNIQUE INDEX device_room_seat ON device_management(org_id,room,seat_x,seat_y) WHERE room<>'';
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['time_packages','classroom_profiles','device_management','managed_files'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant ON %I USING (org_id::text = current_setting(''app.org_id'',true)) WITH CHECK (org_id::text = current_setting(''app.org_id'',true))',t);
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='nexora_app') THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO nexora_app',t); END IF;
END LOOP; END $$;
