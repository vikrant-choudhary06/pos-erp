-- Add missing hotel roles without changing existing roles or staff assignments.
INSERT INTO "Role" ("id", "tenantId", "name", "description", "permissions", "isSystem", "createdAt", "updatedAt")
SELECT gen_random_uuid(), tenant."id", defaults."name", defaults."description", defaults."permissions", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
CROSS JOIN (VALUES
  ('Hotel Manager', 'Hotel setup, reception, guest payments, refunds, housekeeping and daily closing', ARRAY['hotel.view', 'hotel.manage', 'hotel.frontdesk', 'hotel.billing', 'hotel.housekeeping', 'hotel.close_day', 'reports.view']::text[]),
  ('Receptionist', 'Hotel reservations, check-in/out and guest payments', ARRAY['hotel.view', 'hotel.frontdesk', 'hotel.billing']::text[]),
  ('Cleaner', 'Room cleaning status only; no guest details or payments', ARRAY['hotel.housekeeping']::text[]),
  ('Night Auditor', 'Review guest accounts, record payments, view reports and close completed hotel days', ARRAY['hotel.view', 'hotel.billing', 'hotel.close_day', 'reports.view']::text[])
) AS defaults("name", "description", "permissions")
WHERE tenant."deletedAt" IS NULL
ON CONFLICT ("tenantId", "name") DO NOTHING;
