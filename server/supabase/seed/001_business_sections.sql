-- Structure only: the six editable "Business Information" sections shown in the admin.
-- Content is intentionally empty — the owner writes it (we never invent business facts).
insert into public.seo_virji_knowledge_sources (title, source_type, section_key, content, status, embedding_status, priority, metadata)
values
  ('About SEO Virji',     'business_information', 'about',     '', 'active', 'complete', 100, '{"description":"Who you are, your story and what makes you different."}'),
  ('Services',            'business_information', 'services',  '', 'active', 'complete', 100, '{"description":"What you offer, explained in plain language."}'),
  ('SEO Expertise',       'business_information', 'expertise', '', 'active', 'complete', 100, '{"description":"Industries, specialisms and the approach you take."}'),
  ('Pricing Information', 'business_information', 'pricing',   '', 'active', 'complete', 100, '{"description":"How pricing works. The AI never quotes prices that are not written here."}'),
  ('Business Policies',   'business_information', 'policies',  '', 'active', 'complete', 100, '{"description":"Contracts, notice periods, guarantees and reporting."}'),
  ('Contact Information', 'business_information', 'contact',   '', 'active', 'complete', 100, '{"description":"How and when customers can reach your team."}')
on conflict do nothing;
