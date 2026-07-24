alter function public.deposit_document_analysis(uuid, jsonb) security invoker;

revoke all on function public.deposit_document_analysis(uuid, jsonb) from public;
revoke all on function public.deposit_document_analysis(uuid, jsonb) from anon;
grant execute on function public.deposit_document_analysis(uuid, jsonb) to authenticated;