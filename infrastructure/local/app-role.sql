-- Execute as migration owner after migrations. Set role password separately via a secret-aware operator tool.
CREATE ROLE nexora_app LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE nexora TO nexora_app;
GRANT USAGE ON SCHEMA public TO nexora_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexora_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO nexora_app;
-- Application cannot change audit history, plans, role mappings or release trust.
REVOKE UPDATE,DELETE ON audit_logs FROM nexora_app;
REVOKE INSERT,UPDATE,DELETE ON plans,agent_versions,roles,permissions,role_permissions FROM nexora_app;
