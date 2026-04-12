CREATE INDEX IF NOT EXISTS idx_ed_deleted_at ON epi_deliveries ("deletedAt");
CREATE INDEX IF NOT EXISTS idx_ed_data_entrega ON epi_deliveries ("dataEntrega");
CREATE INDEX IF NOT EXISTS idx_emp_deleted_at ON employees ("deletedAt");
CREATE INDEX IF NOT EXISTS idx_emp_status_only ON employees (status);
