-- 0054 회원이 쓰는 칸에 서버 쪽 길이·형식 제한 (2026-11-02 보안 점검 "입력값은 서버에서 한 번 더")
-- 화면(maxlength)만 막고 있어서, 화면을 거치지 않고 REST 로 직접 넣으면 아주 긴 글·이상한 값이 들어갔다.
-- 화면 제한보다 넉넉하게 잡는다. NOT VALID: 기존 행은 그대로 두고 새로 쓰는 값부터 막는다.
begin;
alter table public.post_comments
  add constraint pc_content_len check (char_length(content) between 1 and 1000) not valid,
  add constraint pc_author_len check (author is null or char_length(author) <= 30) not valid;
alter table public.challenge_entries
  add constraint ce_name_len check (name is null or char_length(name) <= 30) not valid,
  add constraint ce_age_len check (age is null or char_length(age) <= 30) not valid,
  add constraint ce_note_len check (note is null or char_length(note) <= 500) not valid,
  add constraint ce_media_path_len check (media_path is null or char_length(media_path) <= 300) not valid,
  add constraint ce_media_url_https check (media_url is null or (media_url ~ '^https://' and char_length(media_url) <= 2048)) not valid;
alter table public.community_posts
  add constraint cp_author_len check (author is null or char_length(author) <= 30) not valid,
  add constraint cp_media_path_len check (media_path is null or char_length(media_path) <= 300) not valid,
  add constraint cp_media_url_https check (media_url is null or (media_url ~ '^https://' and char_length(media_url) <= 2048)) not valid;
alter table public.profiles
  add constraint pf_nickname_len check (nickname is null or char_length(nickname) <= 20) not valid,
  add constraint pf_region_len check (region is null or char_length(region) <= 40) not valid,
  add constraint pf_kid_type check (kid_type is null or kid_type in ('pregnant','parenting')) not valid,
  add constraint pf_parent_role_len check (parent_role is null or char_length(parent_role) <= 20) not valid,
  add constraint pf_birth_month check (birth_month is null or birth_month ~ '^\d{4}-\d{2}$') not valid,
  add constraint pf_interests_size check (interests is null or pg_column_size(interests) <= 2000) not valid;
alter table public.reports
  add constraint rp_reason_len check (reason is null or char_length(reason) <= 100) not valid,
  add constraint rp_detail_len check (detail is null or char_length(detail) <= 1000) not valid;
alter table public.album_photos
  add constraint ap_caption_len check (caption is null or char_length(caption) <= 200) not valid,
  add constraint ap_path_len check (char_length(path) <= 300) not valid;
alter table public.benefit_applications
  add constraint ba_nickname_len check (nickname is null or char_length(nickname) <= 30) not valid,
  add constraint ba_region_len check (region is null or char_length(region) <= 40) not valid,
  add constraint ba_trial_key_len check (char_length(trial_key) <= 60) not valid;
alter table public.benefit_applications_pii
  add constraint bp_name_len check (recipient_name is null or char_length(recipient_name) <= 40) not valid,
  add constraint bp_contact_len check (contact is null or char_length(contact) <= 40) not valid,
  add constraint bp_address_len check (address is null or char_length(address) <= 300) not valid;
commit;
