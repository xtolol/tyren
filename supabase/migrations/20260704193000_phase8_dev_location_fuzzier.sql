-- Friendlier dev_location matching: underscores count as spaces and
-- apostrophes are ignored, so 'hollow_vigil', 'Hollow Vigil', 'zalthars
-- chains', and '4' all resolve. Error message lists the real ladder.

CREATE OR REPLACE FUNCTION public.dev_location(p_location text)
RETURNS text
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_id text;
  v_ladder text;
BEGIN
  SELECT id INTO v_id FROM map_locations
  WHERE id = p_location
     OR replace(lower(name), '''', '') = replace(replace(lower(p_location), '_', ' '), '''', '')
     OR (p_location ~ '^[0-9]+$' AND sort_order = p_location::int - 1);
  IF v_id IS NULL THEN
    SELECT string_agg(format('%s=%s (L%s)', id, name, sort_order + 1), ' · ' ORDER BY sort_order)
    INTO v_ladder FROM map_locations;
    RAISE EXCEPTION 'no map location matching "%" — use a name, id, or level number: %', p_location, v_ladder;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dev_location(text) FROM PUBLIC, anon, authenticated;
