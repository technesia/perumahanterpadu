-- Fungsi trigger append-only memakai search_path tetap (rekomendasi linter keamanan Supabase).
ALTER FUNCTION audit_logs_immutable() SET search_path = pg_catalog;
ALTER FUNCTION ipl_bill_corrections_immutable() SET search_path = pg_catalog;
