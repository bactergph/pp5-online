-- Keep existing years open until an administrator closes a term explicitly.
ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS term1_scores_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS term2_scores_open boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.guard_score_entry_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  entry_open boolean;
BEGIN
  -- Signing may still lock an existing score after the entry period closes.
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['locked', 'updated_at']) =
       (to_jsonb(OLD) - ARRAY['locked', 'updated_at']) THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT CASE NEW.term WHEN 1 THEN y.term1_scores_open WHEN 2 THEN y.term2_scores_open ELSE false END
    INTO entry_open
    FROM public.class_subjects cs
    JOIN public.academic_years y ON y.id = cs.academic_year_id
    WHERE cs.id = NEW.class_subject_id
    FOR SHARE OF y;
  IF entry_open IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ปิดการบันทึกคะแนนสำหรับปีการศึกษาและภาคเรียนนี้แล้ว';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_score_entry_period ON public.scores;
CREATE TRIGGER guard_score_entry_period
  BEFORE INSERT OR UPDATE ON public.scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_score_entry_period();
