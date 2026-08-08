-- Kept in its own migration because PostgreSQL requires a newly added enum
-- value to be committed before another transaction can use it.
alter type public.consent_purpose
  add value if not exists 'nutrition_processing';
