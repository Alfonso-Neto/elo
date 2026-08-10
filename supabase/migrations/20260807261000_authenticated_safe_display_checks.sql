-- CHECK constraints execute their referenced functions with the DML caller's
-- privileges. Authenticated users therefore need EXECUTE on this pure,
-- immutable validator to update the display fields explicitly granted to them.
-- The private schema remains unavailable for direct API calls.

grant execute on function private.has_unsafe_display_characters(text, boolean)
  to authenticated;

