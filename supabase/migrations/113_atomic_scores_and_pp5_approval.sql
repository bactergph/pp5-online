-- Serialize score changes and PP5 approvals for the same offering.
create or replace function public.save_score_edits(
  p_school uuid, p_subject uuid, p_term integer, p_primary boolean,
  p_config jsonb, p_rows jsonb
) returns void language plpgsql set search_path = public as $$
declare
  offering record;
  item record;
  score_terms smallint[];
  annual_term integer;
  annual_total numeric;
  annual_max numeric;
  annual_grade numeric;
  annual_result text;
  actual_config jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('scores:' || p_subject::text, 0));
  select cs.classroom_id, cs.semester, cs.score_terms into offering
  from class_subjects cs join classrooms c on c.id = cs.classroom_id
  where cs.id = p_subject and c.school_id = p_school
  for share of cs, c;
  if not found or p_term not in (1, 2) then raise exception 'ไม่พบรายวิชาหรือภาคเรียน'; end if;
  score_terms := case when offering.semester in (1, 2) then array[offering.semester]::smallint[] else offering.score_terms end;
  if not (p_term = any(score_terms)) then raise exception 'รายวิชานี้ไม่ได้เปิดบันทึกคะแนนในภาคเรียนที่เลือก'; end if;
  if exists (
    select 1 from approval_signatures a
    where a.class_subject_id = p_subject and a.status = 'approved'
      and (a.term = p_term or (a.term = 1 and p_primary and offering.semester = 0))
  ) or exists (
    select 1 from scores s where s.class_subject_id = p_subject and s.term = p_term and s.locked
  ) then raise exception 'คะแนนวิชานี้ถูกล็อก (ลงนามแล้ว) แก้ไขไม่ได้'; end if;

  -- Take the same snapshot of the scoring configuration as the server validator.
  select jsonb_build_object('between_scores', sc.between_scores, 'midterm_max', sc.midterm_max,
                            'final_max', sc.final_max, 'total_max', sc.total_max)
  into actual_config from score_configs sc where sc.class_subject_id = p_subject and sc.term = p_term for share;
  if actual_config is null or actual_config is distinct from p_config then
    raise exception 'สัดส่วนคะแนนเปลี่ยนแล้ว กรุณาโหลดคะแนนใหม่ก่อนบันทึก';
  end if;

  for item in select * from jsonb_to_recordset(p_rows) as r(
    student_id uuid, expected_updated_at timestamptz, unit_scores jsonb,
    between_total numeric, midterm_score numeric, final_score numeric, term_total numeric,
    grade numeric, result text
  ) order by student_id loop
    perform 1 from students where id = item.student_id and classroom_id = offering.classroom_id for share;
    if not found then raise exception 'ข้อมูลนักเรียนไม่ตรงกับห้องเรียน'; end if;
    -- Row version protects the read/merge performed by the server. The client can
    -- still save different cells in the same row after the server retries.
    if (select s.updated_at from scores s where s.student_id = item.student_id
        and s.class_subject_id = p_subject and s.term = p_term for update)
       is distinct from item.expected_updated_at then
      raise exception 'คะแนนมีการเปลี่ยนแปลงระหว่างบันทึก' using errcode = '40001';
    end if;

    insert into scores(student_id, class_subject_id, term, unit_scores, between_total,
                       midterm_score, final_score, term_total, year_total, grade, result, updated_at)
    values (item.student_id, p_subject, p_term, item.unit_scores, item.between_total,
            item.midterm_score, item.final_score, item.term_total, null,
            case when p_primary then null else item.grade end, item.result, clock_timestamp())
    on conflict (student_id, class_subject_id, term) do update set
      unit_scores = excluded.unit_scores, between_total = excluded.between_total,
      midterm_score = excluded.midterm_score, final_score = excluded.final_score,
      term_total = excluded.term_total, year_total = excluded.year_total,
      grade = excluded.grade, result = excluded.result, updated_at = excluded.updated_at;

    if p_primary then
      annual_term := case when 2 = any(score_terms) then 2 else 1 end;
      select sum(s.term_total), sum(sc.total_max)
      into annual_total, annual_max
      from unnest(score_terms) as t(term)
      left join scores s on s.class_subject_id = p_subject and s.student_id = item.student_id and s.term = t.term
        and (s.unit_scores <> '{}'::jsonb or s.midterm_score is not null or s.final_score is not null
             or s.term_total <> 0)
      left join score_configs sc on sc.class_subject_id = p_subject and sc.term = t.term
      having count(s.term_total) = cardinality(score_terms)
         and count(*) filter (where sc.total_max > 0) = cardinality(score_terms);

      select s.result into annual_result from scores s
      where s.student_id = item.student_id and s.class_subject_id = p_subject and s.term = annual_term;
      annual_grade := case when annual_result = 'เรียน'
        then calculate_grade(annual_total * 100 / annual_max) end;

      -- A term-only legacy approval keeps its own snapshot. The annual result
      -- is refreshed when the still-editable counterpart changes.
      perform set_config('app.recalculate_primary_scores', 'true', true);
      update scores s set year_total = annual_total, grade = annual_grade, updated_at = clock_timestamp()
      where s.student_id = item.student_id and s.class_subject_id = p_subject and s.term = annual_term
        and not coalesce(s.locked, false)
        and (s.year_total, s.grade) is distinct from (annual_total, annual_grade);
      perform set_config('app.recalculate_primary_scores', 'false', true);
    end if;
  end loop;

end;
$$;

-- Allow the service-only RPC to refresh derived annual values in a closed
-- semester. A closed semester still rejects changes to any input score.
create or replace function public.guard_score_entry_period()
returns trigger language plpgsql set search_path = public as $$
declare
  entry_open boolean;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['locked', 'updated_at']) =
       (to_jsonb(old) - array['locked', 'updated_at']) then return new; end if;
    if old.locked then raise exception 'คะแนนวิชานี้ถูกล็อก (ลงนามแล้ว) แก้ไขไม่ได้'; end if;
    if current_setting('app.recalculate_primary_scores', true) = 'true'
       and not coalesce(old.locked, false)
       and (to_jsonb(new) - array['year_total', 'grade', 'updated_at']) =
           (to_jsonb(old) - array['year_total', 'grade', 'updated_at']) then return new; end if;
  end if;
  select case new.term when 1 then y.term1_scores_open when 2 then y.term2_scores_open else false end
    into entry_open from class_subjects cs join academic_years y on y.id = cs.academic_year_id
    where cs.id = new.class_subject_id for share of y;
  if entry_open is distinct from true then
    raise exception 'ปิดการบันทึกคะแนนสำหรับปีการศึกษาและภาคเรียนนี้แล้ว';
  end if;
  return new;
end;
$$;

create or replace function public.approve_pp5_subject_and_lock_scores(
  p_school uuid, p_subject uuid, p_term integer, p_approval uuid,
  p_expected_updated_at timestamptz, p_signer uuid, p_approved_at timestamptz, p_whole_year boolean
) returns void language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('scores:' || p_subject::text, 0));
  update approval_signatures a
  set status = 'approved', director_decision = 'อนุมัติ', director_signed_at = p_approved_at,
      director_id = p_signer, updated_at = p_approved_at
  where a.id = p_approval and a.class_subject_id = p_subject and a.term = p_term
    and a.updated_at is not distinct from p_expected_updated_at and a.status = 'in_review'
    and exists (
      select 1 from class_subjects cs join classrooms c on c.id = cs.classroom_id
      where cs.id = p_subject and c.school_id = p_school
    );
  if not found then raise exception 'สถานะเอกสารเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนอนุมัติ'; end if;

  update scores set locked = true, updated_at = p_approved_at
  where class_subject_id = p_subject and (term = p_term or p_whole_year) and not coalesce(locked, false);

  update document_approval_submissions d
  set status = 'approved', completed_at = p_approved_at, rejection_note = null
  where d.id = (
    select h.id from document_approval_submissions h
    where h.school_id = p_school and h.doc_kind = 'pp5_subject' and h.class_subject_id = p_subject
      and h.term = p_term and h.status = 'in_review' and h.month is null
    order by h.submitted_at desc limit 1
  );
end;
$$;

revoke all on function public.save_score_edits(uuid, uuid, integer, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_score_edits(uuid, uuid, integer, boolean, jsonb, jsonb) to service_role;
revoke all on function public.approve_pp5_subject_and_lock_scores(uuid, uuid, integer, uuid, timestamptz, uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.approve_pp5_subject_and_lock_scores(uuid, uuid, integer, uuid, timestamptz, uuid, timestamptz, boolean) to service_role;
notify pgrst, 'reload schema';
