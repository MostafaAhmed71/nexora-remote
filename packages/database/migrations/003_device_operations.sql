ALTER TABLE device_acl DROP CONSTRAINT device_acl_permission_check;
ALTER TABLE device_acl ADD CONSTRAINT device_acl_permission_check CHECK(permission IN ('view','control','terminate','devices','clipboard','files'));
