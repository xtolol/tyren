-- iap_receipts is a service-role-only payments table: clients never read
-- or write it (RLS already denies all rows, but strip the table-level
-- grants too so it isn't even discoverable in the GraphQL schema).
REVOKE ALL ON public.iap_receipts FROM anon, authenticated;
