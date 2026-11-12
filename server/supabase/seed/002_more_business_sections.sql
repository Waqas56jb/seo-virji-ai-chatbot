-- Additional editable Business Information sections (structure only — content is written by the owner).
insert into public.seo_virji_knowledge_sources (title, source_type, section_key, content, status, embedding_status, priority, metadata)
values
  ('Packages',             'business_information', 'packages',     '', 'active', 'complete', 100, '{"description":"Packages or plans you offer and what each includes."}'),
  ('Consultation Details', 'business_information', 'consultation', '', 'active', 'complete', 100, '{"description":"How a strategy consultation works, who it is for and what happens next."}'),
  ('Business Hours',       'business_information', 'hours',        '', 'active', 'complete', 100, '{"description":"When your team is available and typical response times."}')
on conflict do nothing;
