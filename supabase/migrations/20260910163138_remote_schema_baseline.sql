SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE EXTENSION "pg_cron";

CREATE TABLE "public"."academies" (
  "id"                              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                            text                     NOT NULL,
  "owner_id"                        uuid,
  "created_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "salary_payment_day"              smallint                 NOT NULL DEFAULT 10,
  "tuition_due_day"                 smallint                 NOT NULL DEFAULT 1,
  "staff_check_method"              text                     NOT NULL DEFAULT 'manual'::text,
  "student_check_method"            text                     NOT NULL DEFAULT 'teacher_manual'::text,
  "staff_manual_override_enabled"   boolean                  NOT NULL DEFAULT true,
  "student_manual_override_enabled" boolean                  NOT NULL DEFAULT true,
  "attendance_qr_token"             text,
  "attendance_qr_token_rotated_at"  timestamp with time zone,
  "attendance_onboarded_at"         timestamp with time zone,
  "academy_type"                    text                     DEFAULT 'core_subjects'::text,
  "clinic_required"                 boolean                  NOT NULL DEFAULT true,
  "academy_onboarded_at"            timestamp with time zone,
  "academy_subjects"                jsonb                    NOT NULL DEFAULT '["korean", "english", "math"]'::jsonb,
  "tuition_policy"                  text                     NOT NULL DEFAULT 'school_level'::text,
  "tuition_policy_onboarded_at"     timestamp with time zone,
  "address"                         text,
  "phone"                           text,
  "tuition_rates"                   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "clinic_record_fields"            jsonb                    NOT NULL DEFAULT '["materials", "description", "result"]'::jsonb,
  "clinic_default_activity_type"    text                     NOT NULL DEFAULT 'clinic'::text,
  "clinic_default_items"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "drive_quota_bytes"               bigint                   NOT NULL DEFAULT 1073741824,
  "job_title_permissions"           jsonb
    NOT NULL DEFAULT
    '{"선생님": {"role": "teacher", "permissions": {"canManageDrive": true, "canManageStaff": false, "canViewPayroll": true, "canViewPayments": false, "canViewStudents": true, "canManageClasses": false, "canEditAttendance": true, "canManagePayments": false, "canManageStudents": true, "canEditClinicRecords": true, "canEditLessonRecords": true, "canManageStaffPermissions": false}}, "운영 매니저": {"role": "manager", "permissions": {"canManageDrive": true, "canManageStaff": true, "canViewPayroll": true, "canViewPayments": true, "canViewStudents": true, "canManageClasses": true, "canEditAttendance": true, "canManagePayments": true, "canManageStudents": true, "canEditClinicRecords": true, "canEditLessonRecords": true, "canManageStaffPermissions": false}}}'::jsonb,
  CONSTRAINT "academies_clinic_default_items_object_chk" CHECK ((jsonb_typeof(clinic_default_items) = 'object'::text)),
  CONSTRAINT "academies_clinic_record_fields_array_chk" CHECK ((jsonb_typeof(clinic_record_fields) = 'array'::text)),
  CONSTRAINT "academies_drive_quota_bytes_chk" CHECK (((drive_quota_bytes >= 52428800) AND (drive_quota_bytes <= '1099511627776'::bigint))),
  CONSTRAINT "academies_job_title_permissions_object_check" CHECK ((jsonb_typeof(job_title_permissions) = 'object'::text)),
  CONSTRAINT "academies_pkey" PRIMARY KEY (id),
  CONSTRAINT "academies_salary_payment_day_range" CHECK (((salary_payment_day >= 1) AND (salary_payment_day <= 31))),
  CONSTRAINT "academies_staff_check_method_chk" CHECK ((staff_check_method = ANY (ARRAY['manual'::text, 'qr'::text]))),
  CONSTRAINT "academies_student_check_method_chk" CHECK ((student_check_method = ANY (ARRAY['teacher_manual'::text, 'qr'::text, 'disabled'::text]))),
  CONSTRAINT "academies_tuition_due_day_range" CHECK (((tuition_due_day >= 1) AND (tuition_due_day <= 31))),
  CONSTRAINT "academies_tuition_policy_check" CHECK ((tuition_policy = ANY (ARRAY['school_level'::text, 'grade'::text, 'class'::text])))
);

ALTER TABLE "public"."academies"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_calendar_events" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"             uuid                     NOT NULL,
  "category"               text                     NOT NULL DEFAULT 'other'::text,
  "title"                  text                     NOT NULL,
  "start_date"             date                     NOT NULL,
  "end_date"               date                     NOT NULL,
  "all_day"                boolean                  NOT NULL DEFAULT true,
  "start_time"             time without time zone,
  "end_time"               time without time zone,
  "target_type"            text                     NOT NULL DEFAULT 'all'::text,
  "school_names"           jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "grades"                 jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "class_group_ids"        jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "student_ids"            jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "memo"                   text,
  "visibility"             text                     NOT NULL DEFAULT 'internal'::text,
  "affects_classes"        boolean                  NOT NULL DEFAULT false,
  "impact_class_group_ids" jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "source"                 text                     NOT NULL DEFAULT 'manual'::text,
  "external_id"            text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"             timestamp with time zone,
  CONSTRAINT "academy_calendar_events_category_chk"
    CHECK ((category = ANY (ARRAY['academy_break'::text, 'school_exam'::text, 'school_schedule'::text, 'academy_event'::text, 'consultation'::text, 'other'::text]))),
  CONSTRAINT "academy_calendar_events_date_chk" CHECK ((end_date >= start_date)),
  CONSTRAINT "academy_calendar_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_calendar_events_range_chk" CHECK (((end_date - start_date) <= 366)),
  CONSTRAINT "academy_calendar_events_source_chk" CHECK ((source = ANY (ARRAY['manual'::text, 'neis'::text]))),
  CONSTRAINT "academy_calendar_events_target_chk" CHECK ((target_type = ANY (ARRAY['all'::text, 'school'::text, 'class'::text, 'student'::text]))),
  CONSTRAINT "academy_calendar_events_time_chk" CHECK ((all_day OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time)))),
  CONSTRAINT "academy_calendar_events_title_chk" CHECK ((btrim(title) <> ''::text)),
  CONSTRAINT "academy_calendar_events_visibility_chk" CHECK ((visibility = ANY (ARRAY['internal'::text, 'parent'::text]))),
  "created_by"             uuid                     DEFAULT auth.uid(),
  "updated_by"             uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."academy_calendar_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_chat_messages" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid                     NOT NULL,
  "thread_id"  uuid                     NOT NULL,
  "sender_id"  uuid                     NOT NULL,
  "body"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_chat_messages_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 4000))),
  CONSTRAINT "academy_chat_messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."academy_chat_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_chat_reads" (
  "thread_id"    uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "last_read_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_chat_reads_pkey" PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE "public"."academy_chat_reads"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_chat_thread_members" (
  "thread_id"  uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_chat_thread_members_pkey" PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE "public"."academy_chat_thread_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_chat_threads" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"  uuid                     NOT NULL,
  "kind"        text                     NOT NULL,
  "dm_user_a"   uuid,
  "dm_user_b"   uuid,
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "title"       text,
  "group_scope" text                     NOT NULL DEFAULT 'academy'::text,
  CONSTRAINT "academy_chat_threads_check" CHECK ((((kind = 'group'::text) AND (dm_user_a IS NULL) AND (dm_user_b IS NULL)) OR ((kind = 'dm'::text) AND (dm_user_a IS
    NOT NULL) AND (dm_user_b IS NOT NULL) AND (dm_user_a < dm_user_b)))),
  CONSTRAINT "academy_chat_threads_kind_check" CHECK ((kind = ANY (ARRAY['group'::text, 'dm'::text]))),
  CONSTRAINT "academy_chat_threads_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."academy_chat_threads"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_drive_events" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"  uuid                     NOT NULL,
  "actor_id"    uuid,
  "target_kind" text                     NOT NULL,
  "target_id"   uuid                     NOT NULL,
  "target_name" text                     NOT NULL,
  "event_type"  text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_drive_events_event_type_check" CHECK ((event_type = ANY (ARRAY['created'::text, 'trashed'::text, 'restored'::text, 'permanently_deleted'::text]))),
  CONSTRAINT "academy_drive_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_drive_events_target_kind_check" CHECK ((target_kind = ANY (ARRAY['file'::text, 'folder'::text])))
);

ALTER TABLE "public"."academy_drive_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_drive_files" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"       uuid                     NOT NULL,
  "storage_path"     text                     NOT NULL,
  "original_name"    text                     NOT NULL,
  "mime_type"        text                     NOT NULL DEFAULT 'application/octet-stream'::text,
  "size_bytes"       bigint                   NOT NULL,
  "download_allowed" boolean                  NOT NULL DEFAULT false,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "folder_id"        uuid,
  "deleted_at"       timestamp with time zone,
  "deleted_by"       uuid,
  CONSTRAINT "academy_drive_files_check" CHECK ((storage_path ~~ ((academy_id)::text || '/%'::text))),
  CONSTRAINT "academy_drive_files_original_name_check" CHECK (((char_length(original_name) >= 1) AND (char_length(original_name) <= 255))),
  CONSTRAINT "academy_drive_files_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_drive_files_size_bytes_check" CHECK (((size_bytes > 0) AND (size_bytes <= 52428800))),
  CONSTRAINT "academy_drive_files_storage_path_key" UNIQUE (storage_path)
);

ALTER TABLE "public"."academy_drive_files"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_drive_folders" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid                     NOT NULL,
  "parent_id"  uuid,
  "name"       text                     NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  CONSTRAINT "academy_drive_folders_academy_id_id_key" UNIQUE (academy_id, id),
  CONSTRAINT "academy_drive_folders_check" CHECK (((parent_id IS NULL) OR (parent_id <> id))),
  CONSTRAINT "academy_drive_folders_name_check" CHECK ((((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)) AND (POSITION(('/'::text) IN (name)) = 0))),
  CONSTRAINT "academy_drive_folders_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."academy_drive_folders"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_invitations" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"       uuid                     NOT NULL,
  "email"            text                     NOT NULL,
  "role"             text                     NOT NULL DEFAULT 'pending'::text,
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "invited_by"       uuid,
  "accepted_user_id" uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "job_title"        text,
  CONSTRAINT "academy_invitations_job_title_check"
    CHECK (((job_title IS NULL) OR (((char_length(job_title) >= 1) AND (char_length(job_title) <= 40)) AND (job_title = btrim(job_title))))),
  CONSTRAINT "academy_invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_invitations_role_check" CHECK ((role = ANY (ARRAY['teacher'::text, 'manager'::text, 'pending'::text]))),
  CONSTRAINT "academy_invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'canceled'::text])))
);

ALTER TABLE "public"."academy_invitations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_members" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "role"       text                     NOT NULL,
  "status"     text                     NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_members_academy_id_user_id_key" UNIQUE (academy_id, user_id),
  CONSTRAINT "academy_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'teacher'::text, 'manager'::text, 'pending'::text]))),
  CONSTRAINT "academy_members_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'inactive'::text])))
);

ALTER TABLE "public"."academy_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_staff_profiles" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"            uuid                     NOT NULL,
  "user_id"               uuid                     NOT NULL,
  "member_id"             uuid,
  "role"                  text                     NOT NULL,
  "subject"               text,
  "subjects"              jsonb                    DEFAULT '[]'::jsonb,
  "wage_type"             text,
  "hourly_wage"           integer                  NOT NULL DEFAULT 0,
  "monthly_salary"        integer                  NOT NULL DEFAULT 0,
  "memo"                  text,
  "status"                text                     NOT NULL DEFAULT 'active'::text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "permissions"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "scope"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "job_title"             text,
  "employment_started_on" date                     DEFAULT ((now() AT TIME ZONE 'Asia/Seoul'::text))::date,
  "employment_ended_on"   date,
  "exit_reason"           text,
  CONSTRAINT "academy_staff_profiles_academy_id_user_id_key" UNIQUE (academy_id, user_id),
  CONSTRAINT "academy_staff_profiles_employment_dates_chk"
    CHECK (((employment_ended_on IS NULL) OR (employment_started_on IS NULL) OR (employment_ended_on >= employment_started_on))),
  CONSTRAINT "academy_staff_profiles_job_title_check"
    CHECK (((job_title IS NULL) OR (((char_length(job_title) >= 1) AND (char_length(job_title) <= 40)) AND (job_title = btrim(job_title))))),
  CONSTRAINT "academy_staff_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_staff_profiles_role_check" CHECK ((role = ANY (ARRAY['teacher'::text, 'manager'::text]))),
  CONSTRAINT "academy_staff_profiles_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT "academy_staff_profiles_wage_type_check" CHECK ((wage_type = ANY (ARRAY['hourly'::text, 'monthly'::text])))
);

ALTER TABLE "public"."academy_staff_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_staff_shifts" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"           uuid                     NOT NULL,
  "staff_user_id"        uuid                     NOT NULL,
  "staff_role"           text                     NOT NULL,
  "date"                 date                     NOT NULL,
  "scheduled_start_time" time without time zone,
  "scheduled_end_time"   time without time zone,
  "actual_start_time"    time without time zone,
  "actual_end_time"      time without time zone,
  "break_minutes"        integer                  NOT NULL DEFAULT 0,
  "status"               text                     NOT NULL DEFAULT 'scheduled'::text,
  "memo"                 text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_staff_shifts_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_staff_shifts_staff_role_check" CHECK ((staff_role = ANY (ARRAY['teacher'::text, 'manager'::text]))),
  CONSTRAINT "academy_staff_shifts_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'canceled'::text])))
);

ALTER TABLE "public"."academy_staff_shifts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_staff_work_exceptions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"    uuid                     NOT NULL,
  "staff_user_id" uuid                     NOT NULL,
  "date"          date                     NOT NULL,
  "type"          text                     NOT NULL,
  "start_time"    text,
  "end_time"      text,
  "break_minutes" integer,
  "memo"          text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "academy_staff_work_exceptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_staff_work_exceptions_type_chk" CHECK ((type = ANY (ARRAY['extra'::text, 'cancel'::text, 'change'::text])))
);

ALTER TABLE "public"."academy_staff_work_exceptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."academy_staff_work_rules" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"            uuid                     NOT NULL,
  "staff_user_id"         uuid                     NOT NULL,
  "staff_role"            text                     NOT NULL,
  "day_of_week"           smallint                 NOT NULL,
  "start_time"            text                     NOT NULL,
  "end_time"              text                     NOT NULL,
  "break_minutes"         integer                  NOT NULL DEFAULT 0,
  "effective_start_date"  date                     NOT NULL,
  "effective_end_date"    date,
  "is_active"             boolean                  NOT NULL DEFAULT true,
  "memo"                  text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "repeat_interval_weeks" smallint                 NOT NULL DEFAULT 1,
  "rotation_week_index"   smallint                 NOT NULL DEFAULT 0,
  CONSTRAINT "academy_staff_work_rules_dow_chk" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "academy_staff_work_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "academy_staff_work_rules_repeat_interval_chk" CHECK ((repeat_interval_weeks = ANY (ARRAY[1, 2]))),
  CONSTRAINT "academy_staff_work_rules_role_chk" CHECK ((staff_role = ANY (ARRAY['teacher'::text, 'manager'::text]))),
  CONSTRAINT "academy_staff_work_rules_rotation_week_index_chk" CHECK ((rotation_week_index = ANY (ARRAY[0, 1])))
);

ALTER TABLE "public"."academy_staff_work_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."app_developers" (
  "user_id"      uuid                     NOT NULL,
  "role"         text                     NOT NULL DEFAULT 'developer'::text,
  "capabilities" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_developers_capabilities_chk" CHECK ((jsonb_typeof(capabilities) = 'object'::text)),
  CONSTRAINT "app_developers_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "app_developers_role_chk" CHECK ((role = ANY (ARRAY['developer'::text, 'support'::text, 'viewer'::text])))
);

ALTER TABLE "public"."app_developers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."attendance_records" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"         uuid,
  "user_id"            uuid,
  "mode"               text                     NOT NULL DEFAULT 'academy'::text,
  "class_group_id"     uuid,
  "class_session_id"   uuid,
  "student_id"         uuid,
  "date"               date,
  "status"             text                     NOT NULL DEFAULT 'present'::text,
  "memo"               text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "source"             text,
  "checked_at"         timestamp with time zone,
  "confirmation_state" text                     NOT NULL DEFAULT 'teacher_confirmed'::text,
  "confirmed_at"       timestamp with time zone,
  "confirmed_by"       uuid,
  CONSTRAINT "attendance_records_class_session_id_student_id_key" UNIQUE (class_session_id, student_id),
  CONSTRAINT "attendance_records_confirmation_state_chk" CHECK ((confirmation_state = ANY (ARRAY['auto_inferred'::text, 'teacher_confirmed'::text, 'legacy_confirmed'::text]))),
  CONSTRAINT "attendance_records_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY (id),
  CONSTRAINT "attendance_records_source_chk" CHECK (((source IS NULL) OR (source = ANY (ARRAY['qr'::text, 'teacher_manual'::text])))),
  CONSTRAINT "attendance_records_status_check" CHECK ((status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text, 'makeup'::text, 'excused'::text])))
);

ALTER TABLE "public"."attendance_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."class_groups" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"            uuid,
  "user_id"               uuid,
  "mode"                  text                     NOT NULL DEFAULT 'academy'::text,
  "name"                  text                     NOT NULL,
  "subject"               text,
  "level"                 text,
  "teacher_id"            text,
  "teacher_type"          text                     NOT NULL DEFAULT 'teacher'::text,
  "student_ids"           jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "weekdays"              jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "start_time"            text,
  "end_time"              text,
  "room"                  text,
  "start_date"            date,
  "end_date"              date,
  "billing_mode"          text                     NOT NULL DEFAULT 'same'::text,
  "default_billing"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "student_billings"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "memo"                  text,
  "status"                text                     NOT NULL DEFAULT 'active'::text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "assistant_ids"         jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "teacher_user_id"       uuid,
  "activity_type"         text                     NOT NULL DEFAULT 'regular_class'::text,
  "activity_name"         text,
  "record_blocks"         jsonb                    NOT NULL DEFAULT '["content", "homework", "next_plan", "student_memo", "support"]'::jsonb,
  "record_schema"         jsonb,
  "initial_homework"      text,
  "initial_next_plan"     text,
  "fee_policy"            text                     NOT NULL DEFAULT 'included'::text,
  "additional_fee_type"   text                     NOT NULL DEFAULT 'monthly'::text,
  "additional_fee_amount" integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "class_groups_activity_type_chk"
    CHECK
    ((activity_type = ANY (ARRAY['regular_class'::text, 'one_on_one'::text, 'special_lecture'::text, 'makeup'::text, 'assessment'::text, 'self_study'::text, 'coaching'::text,
    'other'::text]))),
  CONSTRAINT "class_groups_additional_fee_amount_chk" CHECK ((additional_fee_amount >= 0)),
  CONSTRAINT "class_groups_additional_fee_type_chk" CHECK ((additional_fee_type = ANY (ARRAY['monthly'::text, 'one_time'::text, 'per_session'::text]))),
  CONSTRAINT "class_groups_billing_mode_check" CHECK ((billing_mode = ANY (ARRAY['same'::text, 'perStudent'::text]))),
  CONSTRAINT "class_groups_fee_policy_chk" CHECK ((fee_policy = ANY (ARRAY['included'::text, 'additional'::text]))),
  CONSTRAINT "class_groups_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "class_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "class_groups_record_blocks_array_chk" CHECK ((jsonb_typeof(record_blocks) = 'array'::text)),
  CONSTRAINT "class_groups_record_schema_array_chk" CHECK (((record_schema IS NULL) OR (jsonb_typeof(record_schema) = 'array'::text))),
  CONSTRAINT "class_groups_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text]))),
  CONSTRAINT "class_groups_teacher_type_check" CHECK ((teacher_type = ANY (ARRAY['owner'::text, 'teacher'::text])))
);

ALTER TABLE "public"."class_groups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."class_schedule_rules" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"           uuid                     NOT NULL,
  "class_group_id"       uuid                     NOT NULL,
  "day_of_week"          smallint                 NOT NULL,
  "start_time"           text                     NOT NULL,
  "end_time"             text                     NOT NULL,
  "teacher_user_id"      uuid,
  "assistant_ids"        jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "room"                 text,
  "is_active"            boolean                  NOT NULL DEFAULT true,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "effective_start_date" date,
  "effective_end_date"   date,
  CONSTRAINT "class_schedule_rules_dow_chk" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "class_schedule_rules_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."class_schedule_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."class_session_exceptions" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"                 uuid                     NOT NULL,
  "class_group_id"             uuid                     NOT NULL,
  "session_date"               date                     NOT NULL,
  "type"                       text                     NOT NULL,
  "start_time"                 text,
  "end_time"                   text,
  "teacher_user_id"            uuid,
  "assistant_ids"              jsonb,
  "substitute_teacher_user_id" uuid,
  "reason"                     text,
  "memo"                       text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "calendar_event_id"          uuid,
  CONSTRAINT "class_session_exceptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "class_session_exceptions_type_chk" CHECK ((type = ANY (ARRAY['cancel'::text, 'reschedule'::text, 'substitute'::text, 'extra'::text])))
);

ALTER TABLE "public"."class_session_exceptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."class_sessions" (
  "id"                                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"                            uuid,
  "user_id"                               uuid,
  "mode"                                  text                     NOT NULL DEFAULT 'academy'::text,
  "class_group_id"                        uuid,
  "date"                                  date                     NOT NULL,
  "start_time"                            text,
  "end_time"                              text,
  "room"                                  text,
  "teacher_id"                            text,
  "teacher_type"                          text                     NOT NULL DEFAULT 'teacher'::text,
  "student_ids"                           jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "status"                                text                     NOT NULL DEFAULT 'scheduled'::text,
  "memo"                                  text,
  "created_at"                            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                            timestamp with time zone NOT NULL DEFAULT now(),
  "substitute_teacher_user_id"            uuid,
  "substitute_reason"                     text,
  "assistant_ids"                         jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "teacher_user_id"                       uuid,
  "record_schema"                         jsonb,
  "activity_type"                         text,
  "activity_name"                         text,
  "session_kind"                          text                     NOT NULL DEFAULT 'regular'::text,
  "origin_session_id"                     uuid,
  "schedule_rule_id"                      uuid,
  "occurrence_date"                       date,
  "session_exception_id"                  uuid,
  "canceled_by_schedule_exception"        boolean                  NOT NULL DEFAULT false,
  "calendar_cancel_original_status"       text,
  "calendar_cancel_original_by_exception" boolean,
  "calendar_cancel_original_exception_id" uuid,
  CONSTRAINT "class_sessions_kind_chk"
    CHECK ((session_kind = ANY (ARRAY['regular'::text, 'makeup'::text, 'special'::text, 'assessment'::text, 'self_study'::text, 'other'::text]))),
  CONSTRAINT "class_sessions_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "class_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "class_sessions_record_schema_array_chk" CHECK (((record_schema IS NULL) OR (jsonb_typeof(record_schema) = 'array'::text))),
  CONSTRAINT "class_sessions_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'canceled'::text, 'rescheduled'::text]))),
  CONSTRAINT "class_sessions_teacher_type_check" CHECK ((teacher_type = ANY (ARRAY['owner'::text, 'teacher'::text])))
);

ALTER TABLE "public"."class_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clinic_event_students" (
  "clinic_event_id"  uuid                     NOT NULL,
  "student_id"       uuid                     NOT NULL,
  "subject_override" text,
  "sort_order"       integer                  NOT NULL DEFAULT 0,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clinic_event_students_pkey" PRIMARY KEY (clinic_event_id, student_id)
);

ALTER TABLE "public"."clinic_event_students"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clinic_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"     uuid                     NOT NULL,
  "name"           text                     NOT NULL,
  "event_date"     date                     NOT NULL,
  "start_time"     time without time zone,
  "end_time"       time without time zone,
  "subject"        text,
  "room"           text,
  "class_group_id" uuid,
  "memo"           text,
  "status"         text                     NOT NULL DEFAULT 'scheduled'::text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clinic_events_name_not_blank" CHECK ((btrim(name) <> ''::text)),
  CONSTRAINT "clinic_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "clinic_events_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT "clinic_events_time_order" CHECK (((start_time IS NULL) OR (end_time IS NULL) OR (end_time > start_time))),
  "created_by"     uuid                     DEFAULT auth.uid()
);

ALTER TABLE "public"."clinic_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."clinic_records" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"              uuid,
  "user_id"                 uuid,
  "mode"                    text                     NOT NULL DEFAULT 'academy'::text,
  "student_id"              uuid,
  "class_group_id"          uuid,
  "class_session_id"        uuid,
  "date"                    date                     NOT NULL,
  "subject"                 text,
  "teacher_id"              text,
  "assistant_id"            text,
  "source_lesson_record_id" uuid,
  "source_support_tags"     jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "source_support_memo"     text,
  "items"                   jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "overall_memo"            text,
  "created_by_role"         text,
  "created_by_id"           text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "activity_type"           text                     NOT NULL DEFAULT 'clinic'::text,
  "activity_name"           text,
  "clinic_event_id"         uuid,
  CONSTRAINT "clinic_records_activity_type_chk"
    CHECK ((activity_type = ANY (ARRAY['clinic'::text, 'makeup'::text, 'self_study'::text, 'assessment'::text, 'consulting'::text, 'assignment_check'::text, 'other'::text]))),
  CONSTRAINT "clinic_records_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "clinic_records_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."clinic_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."developer_action_logs" (
  "id"            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "actor_user_id" uuid                     NOT NULL,
  "action"        text                     NOT NULL,
  "target_type"   text,
  "target_id"     text,
  "details"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "developer_action_logs_details_chk" CHECK ((jsonb_typeof(details) = 'object'::text)),
  CONSTRAINT "developer_action_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."developer_action_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exam_results" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid,
  "user_id"    uuid,
  "mode"       text                     NOT NULL DEFAULT 'academy'::text,
  "student_id" uuid,
  "exam_name"  text,
  "exam_type"  text,
  "subject"    text,
  "exam_date"  date,
  "score"      numeric,
  "max_score"  numeric,
  "grade"      text,
  "memo"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exam_results_exam_type_check"
    CHECK (((exam_type IS NULL) OR (exam_type = ANY (ARRAY['midterm'::text, 'final'::text, 'mock'::text, 'sat'::text, 'school'::text, 'other'::text])))),
  CONSTRAINT "exam_results_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "exam_results_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."exam_results"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lesson_records" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"                 uuid,
  "user_id"                    uuid,
  "mode"                       text                     NOT NULL DEFAULT 'academy'::text,
  "class_group_id"             uuid,
  "class_session_id"           uuid,
  "date"                       date,
  "teacher_id"                 text,
  "common_progress"            text,
  "common_lesson_content"      text,
  "common_homework"            text,
  "next_lesson_plan"           text,
  "teacher_memo"               text,
  "student_records"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "ai_parent_notice"           text,
  "ai_student_homework_notice" text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "common_custom_values"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "lesson_records_class_session_id_key" UNIQUE (class_session_id),
  CONSTRAINT "lesson_records_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "lesson_records_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."lesson_records"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payments" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"       uuid,
  "user_id"          uuid,
  "mode"             text                     NOT NULL DEFAULT 'academy'::text,
  "student_id"       uuid,
  "class_group_id"   uuid,
  "month"            text                     NOT NULL,
  "amount"           integer                  NOT NULL DEFAULT 0,
  "due_date"         date,
  "paid_date"        date,
  "status"           text                     NOT NULL DEFAULT 'unpaid'::text,
  "payer_name"       text,
  "memo"             text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "payment_kind"     text                     NOT NULL DEFAULT 'legacy_class'::text,
  "billing_snapshot" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "payments_class_group_id_student_id_month_key" UNIQUE (class_group_id, student_id, month),
  CONSTRAINT "payments_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "payments_payment_kind_chk" CHECK ((payment_kind = ANY (ARRAY['student_monthly'::text, 'legacy_class'::text, 'manual'::text]))),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "payments_status_check" CHECK ((status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'partial'::text, 'waived'::text, 'overdue'::text])))
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."payrolls" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"              uuid,
  "user_id"                 uuid,
  "mode"                    text                     NOT NULL DEFAULT 'academy'::text,
  "staff_type"              text                     NOT NULL,
  "staff_id"                text                     NOT NULL,
  "month"                   text                     NOT NULL,
  "wage_type"               text,
  "hourly_wage"             integer                  NOT NULL DEFAULT 0,
  "monthly_salary"          integer                  NOT NULL DEFAULT 0,
  "total_hours"             numeric                  NOT NULL DEFAULT 0,
  "completed_session_count" integer                  NOT NULL DEFAULT 0,
  "completed_clinic_count"  integer                  NOT NULL DEFAULT 0,
  "amount"                  integer                  NOT NULL DEFAULT 0,
  "status"                  text                     NOT NULL DEFAULT 'scheduled'::text,
  "paid_date"               date,
  "memo"                    text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "staff_user_id"           uuid,
  "is_exit_settlement"      boolean                  NOT NULL DEFAULT false,
  "requires_review"         boolean                  NOT NULL DEFAULT false,
  "period_start"            date,
  "period_end"              date,
  "calculation_snapshot"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "payrolls_academy_id_staff_type_staff_id_month_key" UNIQUE (academy_id, staff_type, staff_id, month),
  CONSTRAINT "payrolls_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "payrolls_pkey" PRIMARY KEY (id),
  CONSTRAINT "payrolls_staff_type_check" CHECK ((staff_type = ANY (ARRAY['owner'::text, 'teacher'::text, 'assistant'::text, 'manager'::text]))),
  CONSTRAINT "payrolls_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'hold'::text]))),
  CONSTRAINT "payrolls_wage_type_check" CHECK (((wage_type IS NULL) OR (wage_type = ANY (ARRAY['hourly'::text, 'monthly'::text]))))
);

ALTER TABLE "public"."payrolls"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."product_feedback" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"       uuid,
  "category"         text                     NOT NULL,
  "message"          text                     NOT NULL,
  "screenshot_path"  text,
  "page_path"        text,
  "app_mode"         text,
  "reporter_role"    text,
  "context"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"           text                     NOT NULL DEFAULT 'received'::text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_feedback_category_chk" CHECK ((category = ANY (ARRAY['bug'::text, 'improvement'::text]))),
  CONSTRAINT "product_feedback_context_chk" CHECK ((jsonb_typeof(context) = 'object'::text)),
  CONSTRAINT "product_feedback_message_chk" CHECK (((char_length(btrim(message)) >= 10) AND (char_length(btrim(message)) <= 4000))),
  CONSTRAINT "product_feedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "product_feedback_status_chk" CHECK ((status = ANY (ARRAY['received'::text, 'reviewing'::text, 'planned'::text, 'resolved'::text, 'closed'::text]))),
  "reporter_user_id" uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."product_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."product_update_reads" (
  "user_id"   uuid                     NOT NULL,
  "update_id" text                     NOT NULL,
  "read_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_update_reads_pkey" PRIMARY KEY (user_id, update_id),
  CONSTRAINT "product_update_reads_update_id_check" CHECK (((char_length(update_id) >= 1) AND (char_length(update_id) <= 120)))
);

ALTER TABLE "public"."product_update_reads"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"           uuid                     NOT NULL,
  "email"        text,
  "display_name" text,
  "default_role" text                     DEFAULT 'tutor'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "account_type" text                     DEFAULT 'tutor'::text,
  "phone"        text,
  "withdrawn_at" timestamp with time zone,
  CONSTRAINT "profiles_account_type_check" CHECK ((account_type = ANY (ARRAY['tutor'::text, 'owner'::text, 'staff'::text]))),
  CONSTRAINT "profiles_default_role_check" CHECK ((default_role = ANY (ARRAY['tutor'::text, 'owner'::text, 'teacher'::text, 'manager'::text]))),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."push_devices" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "platform"     text                     NOT NULL,
  "provider"     text                     NOT NULL,
  "token"        text                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT true,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "push_devices_pkey" PRIMARY KEY (id),
  CONSTRAINT "push_devices_platform_check" CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text, 'web'::text]))),
  CONSTRAINT "push_devices_provider_check" CHECK ((provider = ANY (ARRAY['fcm'::text, 'apns'::text, 'webpush'::text]))),
  CONSTRAINT "push_devices_provider_token_key" UNIQUE (PROVIDER, token)
);

ALTER TABLE "public"."push_devices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff_attendance_logs" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"           uuid                     NOT NULL,
  "staff_user_id"        uuid                     NOT NULL,
  "staff_role"           text                     NOT NULL,
  "work_date"            date                     NOT NULL,
  "scheduled_start_time" text,
  "scheduled_end_time"   text,
  "actual_start_time"    text,
  "actual_end_time"      text,
  "break_minutes"        integer                  DEFAULT 0,
  "status"               text                     NOT NULL DEFAULT 'pending'::text,
  "source"               text,
  "approved_by"          uuid,
  "approved_at"          timestamp with time zone,
  "memo"                 text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "is_void"              boolean                  NOT NULL DEFAULT false,
  "voided_at"            timestamp with time zone,
  "void_reason"          text,
  CONSTRAINT "staff_attendance_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "staff_attendance_logs_role_chk" CHECK ((staff_role = ANY (ARRAY['teacher'::text, 'manager'::text]))),
  CONSTRAINT "staff_attendance_logs_source_chk" CHECK (((source IS NULL) OR (source = ANY (ARRAY['qr'::text, 'manual'::text])))),
  CONSTRAINT "staff_attendance_logs_status_chk" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'approved'::text, 'rejected'::text])))
);

ALTER TABLE "public"."staff_attendance_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."student_check_events" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid                     NOT NULL,
  "student_id" uuid                     NOT NULL,
  "event_type" text                     NOT NULL,
  "source"     text                     NOT NULL DEFAULT 'qr'::text,
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "session_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_check_events_event_type_chk" CHECK ((event_type = ANY (ARRAY['check_in'::text, 'check_out'::text]))),
  CONSTRAINT "student_check_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "student_check_events_source_chk" CHECK ((source = ANY (ARRAY['qr'::text, 'teacher_manual'::text, 'system_auto'::text])))
);

ALTER TABLE "public"."student_check_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."student_events" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" uuid,
  "user_id"    uuid,
  "mode"       text                     NOT NULL DEFAULT 'academy'::text,
  "student_id" uuid,
  "title"      text                     NOT NULL,
  "event_type" text,
  "date"       date                     NOT NULL,
  "memo"       text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_events_event_type_check"
    CHECK
    (((event_type IS NULL) OR (event_type = ANY (ARRAY['midterm'::text, 'final'::text, 'mock'::text, 'sat'::text, 'assignment'::text, 'school_event'::text, 'other'::text])))),
  CONSTRAINT "student_events_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "student_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."student_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."students" (
  "id"                           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "academy_id"                   uuid,
  "user_id"                      uuid,
  "mode"                         text                     NOT NULL DEFAULT 'academy'::text,
  "name"                         text                     NOT NULL,
  "school_type"                  text,
  "school_name"                  text,
  "grade"                        text,
  "phone"                        text,
  "parent_phone"                 text,
  "parent_title"                 text,
  "parent_name"                  text,
  "enrollment_date"              date,
  "status"                       text                     NOT NULL DEFAULT 'active'::text,
  "memo"                         text,
  "class_group_ids"              jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "created_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "checkin_pin"                  text,
  "clinic_record_fields"         jsonb,
  "clinic_default_activity_type" text,
  "clinic_default_items"         jsonb,
  "base_tuition"                 integer                  NOT NULL DEFAULT 0,
  "tuition_subjects"             jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "tuition_source"               text                     NOT NULL DEFAULT 'academy_rate'::text,
  "tuition_effective_from"       date,
  "tuition_effective_to"         date,
  "parent_title_custom"          text,
  "grade_reference_year"         smallint,
  CONSTRAINT "students_base_tuition_nonnegative_chk" CHECK ((base_tuition >= 0)),
  CONSTRAINT "students_checkin_pin_chk" CHECK (((checkin_pin IS NULL) OR (checkin_pin ~ '^[0-9]{4}$'::text))),
  CONSTRAINT "students_clinic_default_items_object_chk" CHECK (((clinic_default_items IS NULL) OR (jsonb_typeof(clinic_default_items) = 'object'::text))),
  CONSTRAINT "students_clinic_record_fields_array_chk" CHECK (((clinic_record_fields IS NULL) OR (jsonb_typeof(clinic_record_fields) = 'array'::text))),
  CONSTRAINT "students_grade_reference_year_check" CHECK (((grade_reference_year IS NULL) OR ((grade_reference_year >= 2000) AND (grade_reference_year <= 2200)))),
  CONSTRAINT "students_mode_check" CHECK ((mode = ANY (ARRAY['academy'::text, 'private'::text]))),
  CONSTRAINT "students_parent_title_check"
    CHECK (((parent_title IS NULL) OR (parent_title = ANY (ARRAY['mother'::text, 'father'::text, 'guardian'::text, 'parent'::text, 'custom'::text])))),
  CONSTRAINT "students_parent_title_custom_check"
    CHECK
    (((parent_title_custom IS NULL) OR (((char_length(btrim(parent_title_custom)) >= 1) AND (char_length(btrim(parent_title_custom)) <= 20)) AND (parent_title_custom =
    btrim(parent_title_custom))))),
  CONSTRAINT "students_pkey" PRIMARY KEY (id),
  CONSTRAINT "students_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'paused'::text, 'inactive'::text]))),
  CONSTRAINT "students_tuition_period_chk" CHECK (((tuition_effective_to IS NULL) OR (tuition_effective_from IS NULL) OR (tuition_effective_to >= tuition_effective_from))),
  CONSTRAINT "students_tuition_source_chk" CHECK ((tuition_source = ANY (ARRAY['academy_rate'::text, 'custom'::text])))
);

ALTER TABLE "public"."students"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.academy_member_has_permission (
  p_academy_id uuid,
  p_user_id    uuid,
  p_permission text
)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_role text;
  v_job_title text;
  v_title_policies jsonb := '{}'::jsonb;
  v_individual jsonb := '{}'::jsonb;
  v_effective jsonb := '{}'::jsonb;
  v_value jsonb;
  v_result boolean := false;
begin
  if p_academy_id is null or p_user_id is null or p_permission is null then
    return false;
  end if;

  if exists (
    select 1 from public.academies a
    where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    return true;
  end if;

  select m.role, asp.job_title, coalesce(asp.permissions, '{}'::jsonb),
         coalesce(a.job_title_permissions, '{}'::jsonb)
    into v_role, v_job_title, v_individual, v_title_policies
  from public.academy_members m
  join public.academies a on a.id = m.academy_id
  left join public.academy_staff_profiles asp
    on asp.academy_id = m.academy_id and asp.user_id = m.user_id
  where m.academy_id = p_academy_id
    and m.user_id = p_user_id
    and m.status = 'active'
  limit 1;

  if not found then return false; end if;
  if p_permission = 'canManageDrive' then return true; end if;

  v_effective := case v_role
    when 'teacher' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canManageStudents', true
    )
    when 'assistant' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canManageStudents', true
    )
    when 'manager' then jsonb_build_object(
      'canViewStudents', true,
      'canEditLessonRecords', true,
      'canEditAttendance', true,
      'canEditClinicRecords', true,
      'canViewPayroll', true,
      'canViewPayments', true,
      'canManageClasses', true,
      'canManageStudents', true,
      'canManagePayments', true,
      'canManageStaff', true
    )
    else '{}'::jsonb
  end;

  v_value := v_title_policies
    -> coalesce(
      nullif(btrim(v_job_title), ''),
      case when v_role = 'manager' then '운영 매니저' else '선생님' end
    )
    -> 'permissions';
  if jsonb_typeof(v_value) = 'object' then v_effective := v_effective || v_value; end if;
  if jsonb_typeof(v_individual) = 'object' then v_effective := v_effective || v_individual; end if;

  v_value := v_effective -> p_permission;
  if jsonb_typeof(v_value) = 'boolean' then
    v_result := (v_value #>> '{}')::boolean;
  end if;

  if not v_result and p_permission = 'canViewStudents' then
    v_value := v_effective -> 'canManageStudents';
    if jsonb_typeof(v_value) = 'boolean' then
      v_result := (v_value #>> '{}')::boolean;
    end if;
  end if;

  if not v_result and p_permission = 'canViewStudentContacts' then
    v_value := v_effective -> 'canManageStudentContacts';
    if jsonb_typeof(v_value) = 'boolean' then
      v_result := (v_value #>> '{}')::boolean;
    end if;
  end if;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_academy_invitation (
  p_invitation_id uuid
)
  RETURNS TABLE (
    out_invitation_id    uuid,
    out_academy_id       uuid,
    out_role             text,
    out_accepted_user_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.email(), '')));
  v_invite public.academy_invitations%rowtype;
  v_member_id uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select invitation.* into v_invite
    from public.academy_invitations invitation
   where invitation.id = p_invitation_id;
  if not found then raise exception '초대를 찾을 수 없어요.' using errcode = 'P0002'; end if;

  -- 생성 함수와 같은 순서로 advisory lock을 먼저 잡은 뒤 invitation row를
  -- 잠근다. 이 순서를 지켜 재초대/수락 동시 실행의 교착과 상태 경쟁을 막는다.
  perform pg_advisory_xact_lock(
    hashtextextended(v_invite.academy_id::text || ':' || lower(btrim(v_invite.email)), 0)
  );
  select invitation.* into v_invite
    from public.academy_invitations invitation
   where invitation.id = p_invitation_id
   for update;
  if not found then raise exception '초대를 찾을 수 없어요.' using errcode = 'P0002'; end if;
  if v_invite.status <> 'pending' then raise exception '이미 처리된 초대예요.'; end if;
  if lower(btrim(v_invite.email)) <> v_email then
    raise exception '초대받은 이메일과 로그인 이메일이 달라요.' using errcode = '42501';
  end if;

  select case
      when academy.job_title_permissions -> v_invite.job_title ->> 'role' = 'manager'
        then 'manager'
      when academy.job_title_permissions ? v_invite.job_title
        then 'teacher'
      else v_invite.role
    end
    into v_role
    from public.academies academy
   where academy.id = v_invite.academy_id;
  if v_role not in ('teacher', 'manager') then
    raise exception '잘못된 초대 직책이에요.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.academy_members member
     where member.academy_id = v_invite.academy_id
       and member.user_id = v_uid
       and member.status = 'active'
  ) then
    raise exception '이미 학원에 참여 중인 직원이에요.' using errcode = '23505';
  end if;

  insert into public.academy_members as member (academy_id, user_id, role, status)
  values (v_invite.academy_id, v_uid, v_role, 'active')
  on conflict (academy_id, user_id) do update
    set role = excluded.role, status = 'active', updated_at = now()
  returning member.id into v_member_id;

  insert into public.academy_staff_profiles as profile (
    academy_id, user_id, member_id, role, job_title, subjects, wage_type,
    hourly_wage, monthly_salary, status, permissions
  ) values (
    v_invite.academy_id,
    v_uid,
    v_member_id,
    v_role,
    coalesce(
      nullif(btrim(v_invite.job_title), ''),
      case v_role when 'manager' then '운영 매니저' else '선생님' end
    ),
    '[]'::jsonb,
    'hourly',
    0,
    0,
    'active',
    '{}'::jsonb
  )
  on conflict (academy_id, user_id) do update
    set member_id = excluded.member_id,
        role = excluded.role,
        job_title = excluded.job_title,
        status = 'active',
        subjects = '[]'::jsonb,
        wage_type = 'hourly',
        hourly_wage = 0,
        monthly_salary = 0,
        permissions = '{}'::jsonb,
        employment_started_on = (now() at time zone 'Asia/Seoul')::date,
        employment_ended_on = null,
        exit_reason = null,
        updated_at = now();

  update public.academy_invitations invitation
     set status = 'accepted', accepted_user_id = v_uid, updated_at = now()
   where invitation.id = p_invitation_id;

  out_invitation_id := v_invite.id;
  out_academy_id := v_invite.academy_id;
  out_role := v_role;
  out_accepted_user_id := v_uid;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_academy_member_role (
  p_academy_id uuid,
  p_user_id    uuid,
  p_role       text
)
  RETURNS TABLE (
    out_member_id uuid,
    out_role      text,
    out_status    text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_member public.academy_members%rowtype;
begin
  if p_role not in ('teacher', 'manager') then
    raise exception '배정할 수 없는 역할이에요.';
  end if;

  if not public.is_academy_operations_manager(p_academy_id) then
    raise exception '직원 역할을 배정할 권한이 없어요.';
  end if;

  if p_role = 'manager' and not public.is_owner_of_academy(p_academy_id) then
    raise exception '운영 매니저 역할은 원장만 배정할 수 있어요.';
  end if;

  update public.academy_members m
  set role = p_role, status = 'active', updated_at = now()
  where m.academy_id = p_academy_id
    and m.user_id = p_user_id
    and m.role = 'pending'
    and m.status = 'invited'
  returning m.* into v_member;

  if not found then
    raise exception '역할 배정 대기 중인 직원을 찾을 수 없어요.';
  end if;

  out_member_id := v_member.id;
  out_role := v_member.role;
  out_status := v_member.status;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_random_student_checkin_pin()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_pin text;
  v_attempt integer := 0;
begin
  if new.mode <> 'academy' or new.checkin_pin is not null then return new; end if;
  loop
    v_attempt := v_attempt + 1;
    v_pin := lpad(floor(random() * 10000)::integer::text, 4, '0');
    exit when not exists (
      select 1 from public.students s
      where s.academy_id = new.academy_id and s.checkin_pin = v_pin
        and s.id is distinct from new.id
    );
    if v_attempt >= 100 then
      raise exception '사용 가능한 등하원 PIN을 발급하지 못했어요. 다시 시도해주세요.';
    end if;
  end loop;
  new.checkin_pin := v_pin;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_student_to_class_groups_guarded (
  p_academy_id          uuid,
  p_student_id          uuid,
  p_class_group_ids     uuid[],
  p_effective_from      date,
  p_tuition_subjects    jsonb,
  p_base_tuition        integer,
  p_expected_updated_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_student public.students%rowtype;
  v_group_ids uuid[] := coalesce(p_class_group_ids, '{}'::uuid[]);
  v_valid_group_count integer;
  v_group_count integer;
  v_group_updates integer := 0;
  v_session_updates integer := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canManageStudents')
  ) then
    raise exception '학생을 배정할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_effective_from is null then
    raise exception '배정 시작일이 필요해요.' using errcode = '22023';
  end if;
  if p_tuition_subjects is null or jsonb_typeof(p_tuition_subjects) <> 'array' then
    raise exception '수강 과목 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if coalesce(p_base_tuition, 0) < 0 then
    raise exception '기본 학원비는 0원 이상이어야 해요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text || ':student-assignment', 0));

  select *
    into v_student
    from public.students
   where id = p_student_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;
  if not found then
    raise exception '배정할 학생을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or v_student.updated_at is distinct from p_expected_updated_at then
    raise exception '다른 기기에서 이 학생 정보를 먼저 수정했어요.' using errcode = '40001';
  end if;

  select count(*), count(distinct group_id)
    into v_group_count, v_valid_group_count
    from unnest(v_group_ids) as selected(group_id);
  if v_group_count <> v_valid_group_count then
    raise exception '같은 반이 중복 선택됐어요.' using errcode = '22023';
  end if;
  select count(*)
    into v_valid_group_count
    from public.class_groups cg
   where cg.id = any(v_group_ids)
     and cg.academy_id = p_academy_id
     and cg.mode = 'academy'
     and cg.status <> 'inactive';
  if v_valid_group_count <> cardinality(v_group_ids) then
    raise exception '선택한 반 중 사용할 수 없는 반이 있어요.' using errcode = '22023';
  end if;

  update public.students
     set class_group_ids = to_jsonb(v_group_ids),
         tuition_subjects = p_tuition_subjects,
         base_tuition = coalesce(p_base_tuition, 0)
   where id = p_student_id
  returning * into v_student;

  update public.class_groups cg
     set student_ids = case
       when coalesce(cg.student_ids, '[]'::jsonb) @> jsonb_build_array(p_student_id)
         then coalesce(cg.student_ids, '[]'::jsonb)
       else coalesce(cg.student_ids, '[]'::jsonb) || jsonb_build_array(p_student_id)
     end
   where cg.id = any(v_group_ids);
  get diagnostics v_group_updates = row_count;

  update public.class_sessions cs
     set student_ids = case
       when coalesce(cs.student_ids, '[]'::jsonb) @> jsonb_build_array(p_student_id)
         then coalesce(cs.student_ids, '[]'::jsonb)
       else coalesce(cs.student_ids, '[]'::jsonb) || jsonb_build_array(p_student_id)
     end
   where cs.academy_id = p_academy_id
     and cs.class_group_id = any(v_group_ids)
     and cs.status <> 'canceled'
     and coalesce(cs.occurrence_date, cs.date) >= p_effective_from;
  get diagnostics v_session_updates = row_count;

  return jsonb_build_object(
    'student', to_jsonb(v_student),
    'group_update_count', v_group_updates,
    'session_update_count', v_session_updates
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.audit_academy_drive_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_row jsonb;
  v_old jsonb;
  v_kind text;
  v_name text;
  v_event text;
  v_academy_id uuid;
  v_target_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_kind := case when tg_table_name = 'academy_drive_files' then 'file' else 'folder' end;
  v_name := case
    when v_kind = 'file' then v_row ->> 'original_name'
    else v_row ->> 'name'
  end;
  v_academy_id := (v_row ->> 'academy_id')::uuid;
  v_target_id := (v_row ->> 'id')::uuid;

  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif tg_op = 'DELETE' then
    v_event := 'permanently_deleted';
  elsif (v_old ->> 'deleted_at') is null and (v_row ->> 'deleted_at') is not null then
    v_event := 'trashed';
  elsif (v_old ->> 'deleted_at') is not null and (v_row ->> 'deleted_at') is null then
    v_event := 'restored';
  else
    return new;
  end if;

  insert into public.academy_drive_events (
    academy_id, actor_id, target_kind, target_id, target_name, event_type
  )
  values (
    v_academy_id,
    coalesce(
      auth.uid(),
      nullif(v_row ->> 'deleted_by', '')::uuid,
      nullif(v_row ->> 'created_by', '')::uuid
    ),
    v_kind,
    v_target_id,
    coalesce(v_name, '(이름 없음)'),
    v_event
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.auto_checkout_students_at_22_kst()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_day_start timestamptz;
  v_cutoff timestamptz;
  v_inserted integer := 0;
begin
  v_day_start := v_today::timestamp at time zone 'Asia/Seoul';
  v_cutoff := (v_today + time '22:00') at time zone 'Asia/Seoul';

  -- 22시 전에 수동 실행되더라도 미래 시각의 하원 기록을 만들지 않는다.
  if now() < v_cutoff then
    return 0;
  end if;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    event_time,
    session_id,
    created_by
  )
  select
    latest.academy_id,
    latest.student_id,
    'check_out',
    'system_auto',
    v_cutoff,
    latest.session_id,
    null
  from (
    select distinct on (event.academy_id, event.student_id)
      event.academy_id,
      event.student_id,
      event.event_type,
      event.event_time,
      event.session_id
    from public.student_check_events event
    where event.event_time >= v_day_start
      and event.event_time <= now()
    order by event.academy_id, event.student_id, event.event_time desc, event.created_at desc
  ) latest
  where latest.event_type = 'check_in'
    and latest.event_time <= v_cutoff
  on conflict (academy_id, student_id, event_time)
    where event_type = 'check_out' and source = 'system_auto'
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_academy_class_group (
  p_academy_id     uuid,
  p_class_group_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(p_academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_group(p_academy_id, p_class_group_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_academy_class_session (
  p_academy_id       uuid,
  p_class_session_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(p_academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_session(p_academy_id, p_class_session_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_academy_student (
  p_academy_id uuid,
  p_student_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    exists (
      select 1
        from public.students s
       where s.id = p_student_id
         and s.academy_id = p_academy_id
         and s.mode = 'academy'
    )
    and (
      public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canViewStudents')
      or public.has_academy_permission(p_academy_id, 'canManageStudents')
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_chat_thread (
  p_thread_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academy_chat_threads t
    where t.id = p_thread_id
      and public.is_member_of_academy(t.academy_id)
      and (
        t.kind = 'dm'
          and auth.uid() in (t.dm_user_a, t.dm_user_b)
        or t.kind = 'group'
          and t.group_scope = 'academy'
        or t.kind = 'group'
          and t.group_scope = 'custom'
          and exists (
            select 1
            from public.academy_chat_thread_members tm
            where tm.thread_id = t.id
              and tm.user_id = auth.uid()
          )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_student_contacts (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStudentContacts');
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_academy_drive_object (
  p_object_name text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academy_drive_files f
    where f.storage_path = p_object_name
      and f.created_by = auth.uid()
      and f.deleted_at is null
      and public.is_member_of_academy(f.academy_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_view_student_contacts (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canViewStudentContacts')
    or public.has_academy_permission(p_academy_id, 'canManageStudentContacts');
$function$;

CREATE OR REPLACE FUNCTION public.cancel_future_shifts_for_inactive_member()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if old.status = 'active' and new.status <> 'active' then
    update public.academy_staff_work_rules
       set is_active = false, updated_at = now()
     where academy_id = new.academy_id and staff_user_id = new.user_id and is_active = true;
    update public.academy_staff_shifts
       set status = 'canceled', updated_at = now()
     where academy_id = new.academy_id and staff_user_id = new.user_id
       and date > (now() at time zone 'Asia/Seoul')::date
       and status = 'scheduled';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_assigned_class_session (
  p_session_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_session public.class_sessions%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select *
    into v_session
  from public.class_sessions
  where id = p_session_id
    and mode = 'academy'
  for update;

  if not found then
    raise exception '수업 회차를 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  if not (
    public.is_owner_of_academy(v_session.academy_id)
    or public.has_academy_permission(v_session.academy_id, 'canManageClasses')
    or (
      public.has_academy_permission(v_session.academy_id, 'canEditLessonRecords')
      and public.is_assigned_to_class_session(v_session.academy_id, v_session.id)
    )
  ) then
    raise exception '이 수업을 완료할 권한이 없어요.' using errcode = '42501';
  end if;

  update public.class_sessions
  set status = 'completed', updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return to_jsonb(v_session);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_academy_invitation_guarded (
  p_academy_id uuid,
  p_email      text,
  p_job_title  text
)
  RETURNS public.academy_invitations
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_uid uuid := auth.uid();
  v_caller_email text := lower(btrim(coalesce(auth.email(), '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_job_title text := btrim(coalesce(p_job_title, ''));
  v_title_policies jsonb := '{}'::jsonb;
  v_role text := 'teacher';
  v_target_user_id uuid;
  v_invitation public.academy_invitations%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_academy_id is null then
    raise exception '학원을 선택해주세요.' using errcode = '22023';
  end if;
  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '직원을 초대할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_email = '' or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception '올바른 이메일을 입력해주세요.' using errcode = '22023';
  end if;
  if v_email = v_caller_email then
    raise exception '본인 계정은 초대할 수 없어요.' using errcode = '42501';
  end if;
  if v_job_title = '' or length(v_job_title) > 40 then
    raise exception '직책은 40자 이내로 입력해주세요.' using errcode = '22023';
  end if;

  select coalesce(a.job_title_permissions, '{}'::jsonb)
    into v_title_policies
    from public.academies a
   where a.id = p_academy_id;
  if not found then
    raise exception '학원을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  -- 역할은 클라이언트가 보낸 값이 아니라 학원의 서버 직책 정책에서 결정한다.
  v_role := case
    when v_title_policies -> v_job_title ->> 'role' = 'manager' then 'manager'
    when v_job_title = '운영 매니저' then 'manager'
    else 'teacher'
  end;
  if v_role = 'manager' and not public.is_owner_of_academy(p_academy_id) then
    raise exception '운영 매니저는 원장만 초대할 수 있어요.' using errcode = '42501';
  end if;

  -- 같은 학원·이메일의 초대 생성과 수락을 직렬화한다. 활성 여부를 확인한 뒤
  -- 수락이 끼어들어 active 직원에게 새 pending 초대가 생기는 경쟁을 막는다.
  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || v_email, 0)
  );

  -- profiles가 아직 없는 과거 계정은 accepted_user_id 이력으로 한 번 더 찾는다.
  select p.id into v_target_user_id
    from public.profiles p
   where lower(btrim(coalesce(p.email, ''))) = v_email
   limit 1;
  if v_target_user_id is null then
    select ai.accepted_user_id into v_target_user_id
      from public.academy_invitations ai
     where ai.academy_id = p_academy_id
       and lower(btrim(ai.email)) = v_email
       and ai.accepted_user_id is not null
       and not exists (
         select 1 from public.profiles existing_profile
          where existing_profile.id = ai.accepted_user_id
       )
     order by ai.updated_at desc
     limit 1;
  end if;

  -- 과거 accepted 초대가 아니라 현재 active 멤버십만 재초대를 차단한다.
  if v_target_user_id is not null and exists (
    select 1
      from public.academy_members member
     where member.academy_id = p_academy_id
       and member.user_id = v_target_user_id
       and member.status = 'active'
  ) then
    raise exception '이미 학원에 참여 중인 직원이에요.' using errcode = '23505';
  end if;

  select invitation.* into v_invitation
    from public.academy_invitations invitation
   where invitation.academy_id = p_academy_id
     and lower(btrim(invitation.email)) = v_email
     and invitation.status = 'pending'
   order by invitation.created_at desc
   limit 1
   for update;

  if found then
    update public.academy_invitations invitation
       set role = v_role,
           job_title = v_job_title,
           invited_by = v_uid,
           accepted_user_id = null,
           updated_at = now()
     where invitation.id = v_invitation.id
     returning invitation.* into v_invitation;
  else
    insert into public.academy_invitations (
      academy_id, email, role, job_title, status, invited_by, accepted_user_id
    ) values (
      p_academy_id, v_email, v_role, v_job_title, 'pending', v_uid, null
    )
    returning * into v_invitation;
  end if;

  return v_invitation;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_class_group_with_rules (
  p_academy_id     uuid,
  p_class_group_id uuid,
  p_group          jsonb,
  p_rules          jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_group public.class_groups%rowtype;
  v_rule jsonb;
  v_rule_ids uuid[] := '{}'::uuid[];
  v_rule_id uuid;
  v_rule_count integer;
  v_distinct_day_count integer;
  v_day_of_week smallint;
  v_start_time text;
  v_end_time text;
  v_effective_from date;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if p_academy_id is null or p_class_group_id is null then
    raise exception '학원과 반 정보가 필요해요.' using errcode = '22023';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
  ) then
    raise exception '반을 만들 권한이 없어요.' using errcode = '42501';
  end if;

  if p_group is null or jsonb_typeof(p_group) <> 'object' then
    raise exception '반 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception '수업 규칙 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if nullif(btrim(p_group->>'name'), '') is null then
    raise exception '반 이름이 필요해요.' using errcode = '22023';
  end if;

  -- 회차 실체화 및 규칙 수정과 같은 학원 단위 잠금을 사용한다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  -- 같은 클라이언트 요청이 응답 유실로 다시 들어오면 기존 결과를 반환한다.
  select *
    into v_group
    from public.class_groups
   where id = p_class_group_id
   for update;

  if found then
    if v_group.academy_id <> p_academy_id or v_group.mode <> 'academy' then
      raise exception '반 생성 요청을 다시 확인해주세요.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'group', to_jsonb(v_group),
      'rules', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.day_of_week)
          from public.class_schedule_rules r
         where r.class_group_id = p_class_group_id
           and r.academy_id = p_academy_id
           and r.is_active = true
      ), '[]'::jsonb),
      'replayed', true
    );
  end if;

  select count(*), count(distinct (value->>'day_of_week'))
    into v_rule_count, v_distinct_day_count
    from jsonb_array_elements(p_rules);

  if v_rule_count = 0 then
    raise exception '수업 요일을 최소 1개 선택해주세요.' using errcode = '22023';
  end if;

  if v_rule_count <> v_distinct_day_count then
    raise exception '같은 요일의 수업 규칙이 중복되어 있어요.' using errcode = '22023';
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    begin
      v_day_of_week := (v_rule->>'day_of_week')::smallint;
    exception when others then
      raise exception '수업 요일 값이 올바르지 않아요.' using errcode = '22023';
    end;
    v_start_time := nullif(btrim(v_rule->>'start_time'), '');
    v_end_time := nullif(btrim(v_rule->>'end_time'), '');

    if v_day_of_week not between 0 and 6 then
      raise exception '수업 요일 값은 0~6이어야 해요.' using errcode = '22023';
    end if;
    if v_start_time is null or v_end_time is null
       or v_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_start_time >= v_end_time then
      raise exception '수업 시작·종료 시간을 확인해주세요.' using errcode = '22023';
    end if;
  end loop;

  v_effective_from := greatest(
    coalesce(nullif(p_group->>'start_date', '')::date, (now() at time zone 'Asia/Seoul')::date),
    (now() at time zone 'Asia/Seoul')::date
  );

  insert into public.class_groups (
    id,
    academy_id,
    user_id,
    mode,
    name,
    subject,
    level,
    activity_type,
    activity_name,
    record_blocks,
    record_schema,
    initial_homework,
    initial_next_plan,
    teacher_id,
    teacher_type,
    teacher_user_id,
    student_ids,
    assistant_ids,
    weekdays,
    start_time,
    end_time,
    room,
    start_date,
    end_date,
    billing_mode,
    default_billing,
    student_billings,
    fee_policy,
    additional_fee_type,
    additional_fee_amount,
    memo,
    status
  ) values (
    p_class_group_id,
    p_academy_id,
    auth.uid(),
    'academy',
    btrim(p_group->>'name'),
    nullif(p_group->>'subject', ''),
    nullif(p_group->>'level', ''),
    coalesce(nullif(p_group->>'activity_type', ''), 'regular_class'),
    nullif(p_group->>'activity_name', ''),
    coalesce(p_group->'record_blocks', '[]'::jsonb),
    p_group->'record_schema',
    nullif(p_group->>'initial_homework', ''),
    nullif(p_group->>'initial_next_plan', ''),
    nullif(p_group->>'teacher_id', ''),
    coalesce(nullif(p_group->>'teacher_type', ''), 'teacher'),
    nullif(p_group->>'teacher_user_id', '')::uuid,
    coalesce(p_group->'student_ids', '[]'::jsonb),
    coalesce(p_group->'assistant_ids', '[]'::jsonb),
    coalesce(p_group->'weekdays', '[]'::jsonb),
    nullif(p_group->>'start_time', ''),
    nullif(p_group->>'end_time', ''),
    nullif(p_group->>'room', ''),
    nullif(p_group->>'start_date', '')::date,
    nullif(p_group->>'end_date', '')::date,
    coalesce(nullif(p_group->>'billing_mode', ''), 'same'),
    coalesce(p_group->'default_billing', '{}'::jsonb),
    coalesce(p_group->'student_billings', '{}'::jsonb),
    coalesce(nullif(p_group->>'fee_policy', ''), 'included'),
    coalesce(nullif(p_group->>'additional_fee_type', ''), 'monthly'),
    coalesce((p_group->>'additional_fee_amount')::integer, 0),
    nullif(p_group->>'memo', ''),
    coalesce(nullif(p_group->>'status', ''), 'active')
  )
  returning * into v_group;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    insert into public.class_schedule_rules (
      academy_id,
      class_group_id,
      day_of_week,
      start_time,
      end_time,
      teacher_user_id,
      assistant_ids,
      room,
      is_active,
      effective_start_date,
      effective_end_date
    ) values (
      p_academy_id,
      p_class_group_id,
      (v_rule->>'day_of_week')::smallint,
      v_rule->>'start_time',
      v_rule->>'end_time',
      nullif(v_rule->>'teacher_user_id', '')::uuid,
      coalesce(v_rule->'assistant_ids', '[]'::jsonb),
      nullif(v_rule->>'room', ''),
      true,
      v_effective_from,
      null
    )
    returning id into v_rule_id;
    v_rule_ids := array_append(v_rule_ids, v_rule_id);
  end loop;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'rules', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.day_of_week)
        from public.class_schedule_rules r
       where r.id = any(v_rule_ids)
    ), '[]'::jsonb),
    'replayed', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_group_chat_thread (
  p_academy_id      uuid,
  p_title           text,
  p_member_user_ids uuid[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_id uuid;
  v_title text;
  v_members uuid[];
  v_member_count int;
begin
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '권한이 없어요.';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception '단톡방 이름을 입력해주세요.';
  end if;

  select array_agg(distinct uid)
  into v_members
  from unnest(coalesce(p_member_user_ids, array[]::uuid[]) || auth.uid()) as x(uid);

  select count(*) into v_member_count
  from unnest(v_members) as x(uid)
  join public.academy_members m
    on m.academy_id = p_academy_id
   and m.user_id = uid
   and m.status = 'active';

  if v_member_count <> cardinality(v_members) then
    raise exception '같은 학원의 활성 직원만 초대할 수 있어요.';
  end if;
  if v_member_count < 3 then
    raise exception '단톡방은 나를 포함해 3명 이상이어야 해요.';
  end if;

  insert into public.academy_chat_threads (academy_id, kind, group_scope, title, created_by)
  values (p_academy_id, 'group', 'custom', left(v_title, 80), auth.uid())
  returning id into v_id;

  insert into public.academy_chat_thread_members (thread_id, user_id)
  select v_id, uid
  from unnest(v_members) as x(uid)
  on conflict do nothing;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_academy_calendar_event (
  p_event_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_event public.academy_calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select * into v_event
  from public.academy_calendar_events
  where id = p_event_id and deleted_at is null
  for update;
  if not found then raise exception '일정을 찾을 수 없어요.'; end if;
  if v_event.created_by is distinct from auth.uid()
     and not public.has_academy_permission(v_event.academy_id, 'canManageClasses') then
    raise exception '다른 직원의 일정을 삭제할 권한이 없어요.' using errcode = '42501';
  end if;

  update public.class_sessions cs
     set status = case
           when exists (
             select 1 from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
           ) then 'canceled'
           when cs.status = 'canceled' then 'scheduled'
           else cs.status
         end,
         canceled_by_schedule_exception = exists (
           select 1 from public.class_session_exceptions other_exception
           where other_exception.calendar_event_id is distinct from p_event_id
             and other_exception.class_group_id = cs.class_group_id
             and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
             and other_exception.type = 'cancel'
         ),
         session_exception_id = (
           select other_exception.id
           from public.class_session_exceptions other_exception
           where other_exception.calendar_event_id is distinct from p_event_id
             and other_exception.class_group_id = cs.class_group_id
             and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
             and other_exception.type = 'cancel'
           order by other_exception.created_at desc
           limit 1
         ),
         updated_at = now()
    from public.class_session_exceptions e
   where e.calendar_event_id = p_event_id
     and cs.session_exception_id = e.id
     and cs.canceled_by_schedule_exception = true
     and cs.status <> 'completed';
  delete from public.class_session_exceptions where calendar_event_id = p_event_id;

  update public.academy_calendar_events
  set deleted_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = p_event_id;

  if v_event.affects_classes
     and public.has_academy_permission(v_event.academy_id, 'canManageClasses') then
    perform 1 from public.ensure_class_sessions_for_range(
      v_event.academy_id, v_event.start_date, v_event.end_date, null
    );
  end if;
  return p_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_student_contact_write_permission()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_contacts_changed boolean;
  v_can_register_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if new.mode = 'private' then
    if new.user_id is distinct from auth.uid() then
      raise exception '개인 학생 연락처를 변경할 권한이 없어요.' using errcode = '42501';
    end if;
    return new;
  end if;

  v_contacts_changed := tg_op = 'INSERT'
    and num_nonnulls(new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin) > 0;
  if tg_op = 'UPDATE' then
    v_contacts_changed := row(
      new.phone, new.parent_phone, new.parent_name, new.parent_title,
      new.parent_title_custom, new.checkin_pin
    ) is distinct from row(
      old.phone, old.parent_phone, old.parent_name, old.parent_title,
      old.parent_title_custom, old.checkin_pin
    );
  end if;

  -- 신규 등록에 한해서만 학생 관리 권한을 연락처 입력 권한으로 인정한다.
  -- has_academy_permission은 active 멤버십과 서버 저장 권한을 다시 확인한다.
  v_can_register_contacts := tg_op = 'INSERT'
    and new.mode = 'academy'
    and new.academy_id is not null
    and (
      public.is_owner_of_academy(new.academy_id)
      or public.has_academy_permission(new.academy_id, 'canManageStudents')
    );

  if v_contacts_changed
     and not v_can_register_contacts
     and not public.can_manage_student_contacts(new.academy_id) then
    raise exception '학생·보호자 연락처를 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_class_sessions_for_range (
  p_academy_id     uuid,
  p_from_date      date,
  p_to_date        date,
  p_class_group_id uuid DEFAULT NULL::uuid
)
  RETURNS SETOF public.class_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_group record;
  v_can_manage boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_academy_id is null or p_from_date is null or p_to_date is null
     or p_from_date > p_to_date or (p_to_date - p_from_date) > 93 then
    raise exception '학원과 최대 94일의 올바른 날짜 범위가 필요해요.' using errcode = '22023';
  end if;
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '이 학원의 수업을 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_manage := public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses');

  if p_class_group_id is not null then
    if not v_can_manage
       and not public.can_access_academy_class_group(p_academy_id, p_class_group_id) then
      raise exception '담당하지 않은 반의 수업을 확인할 수 없어요.' using errcode = '42501';
    end if;
    perform public.ensure_class_sessions_for_range_internal(
      p_academy_id, p_from_date, p_to_date, p_class_group_id);
  elsif v_can_manage then
    perform public.ensure_class_sessions_for_range_internal(
      p_academy_id, p_from_date, p_to_date, null);
  else
    for v_group in
      select g.id from public.class_groups g
      where g.academy_id = p_academy_id
        and public.can_access_academy_class_group(p_academy_id, g.id)
    loop
      perform public.ensure_class_sessions_for_range_internal(
        p_academy_id, p_from_date, p_to_date, v_group.id);
    end loop;
  end if;

  return query
  select cs.* from public.class_sessions cs
  where cs.academy_id = p_academy_id
    and cs.date between p_from_date and p_to_date
    and (p_class_group_id is null or cs.class_group_id = p_class_group_id)
    and (
      v_can_manage
      or public.can_access_academy_class_session(p_academy_id, cs.id)
    )
  order by cs.date, cs.start_time, cs.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_class_sessions_for_range_internal (
  p_academy_id     uuid,
  p_from_date      date,
  p_to_date        date,
  p_class_group_id uuid DEFAULT NULL::uuid
)
  RETURNS SETOF public.class_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_occ record;
  v_session_id uuid;
  v_start_time text;
  v_end_time text;
  v_teacher_user_id uuid;
  v_assistant_ids jsonb;
  v_substitute_teacher_user_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if p_academy_id is null or p_from_date is null or p_to_date is null then
    raise exception '학원과 날짜 범위가 필요해요.' using errcode = '22023';
  end if;

  if p_from_date > p_to_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.' using errcode = '22023';
  end if;

  if (p_to_date - p_from_date) > 93 then
    raise exception '한 번에 최대 94일까지만 준비할 수 있어요.' using errcode = '22023';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.is_member_of_academy(p_academy_id)
  ) then
    raise exception '이 학원의 수업을 준비할 권한이 없어요.' using errcode = '42501';
  end if;

  if p_class_group_id is not null and not exists (
    select 1
      from public.class_groups g
     where g.id = p_class_group_id
       and g.academy_id = p_academy_id
  ) then
    raise exception '선택한 반을 찾을 수 없어요.' using errcode = '22023';
  end if;

  -- 같은 학원에 대한 동시 실체화를 직렬화한다. 기존 자연키 회차를 연결하는 짧은
  -- 순간에만 유지되며, 다른 학원의 요청은 서로 막지 않는다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  for v_occ in
    select
      r.id as rule_id,
      r.start_time as rule_start_time,
      r.end_time as rule_end_time,
      r.teacher_user_id as rule_teacher_user_id,
      r.assistant_ids as rule_assistant_ids,
      r.room as rule_room,
      g.id as group_id,
      g.user_id as group_user_id,
      g.teacher_id as group_teacher_id,
      g.teacher_type as group_teacher_type,
      g.teacher_user_id as group_teacher_user_id,
      g.assistant_ids as group_assistant_ids,
      g.student_ids as group_student_ids,
      g.room as group_room,
      g.record_schema as group_record_schema,
      g.activity_type as group_activity_type,
      g.activity_name as group_activity_name,
      generated.day::date as occurrence_date,
      e.id as exception_id,
      e.type as exception_type,
      e.start_time as exception_start_time,
      e.end_time as exception_end_time,
      e.teacher_user_id as exception_teacher_user_id,
      e.assistant_ids as exception_assistant_ids,
      e.substitute_teacher_user_id as exception_substitute_teacher_user_id,
      e.reason as exception_reason,
      e.memo as exception_memo
    from public.class_schedule_rules r
    join public.class_groups g
      on g.id = r.class_group_id
     and g.academy_id = r.academy_id
    cross join lateral generate_series(
      p_from_date::timestamp,
      p_to_date::timestamp,
      interval '1 day'
    ) as generated(day)
    left join lateral (
      select x.*
        from public.class_session_exceptions x
       where x.academy_id = r.academy_id
         and x.class_group_id = r.class_group_id
         and x.session_date = generated.day::date
         and x.type <> 'extra'
       order by
         case x.type
           when 'cancel' then 1
           when 'reschedule' then 2
           when 'substitute' then 3
           else 4
         end,
         x.created_at desc
       limit 1
    ) e on true
    where r.academy_id = p_academy_id
      and r.is_active = true
      and g.status = 'active'
      and (p_class_group_id is null or g.id = p_class_group_id)
      and extract(dow from generated.day)::smallint = r.day_of_week
      and (
        r.effective_start_date is null
        or generated.day::date >= r.effective_start_date
      )
      and (
        r.effective_end_date is null
        or generated.day::date <= r.effective_end_date
      )
      and (g.start_date is null or generated.day::date >= g.start_date)
      and (g.end_date is null or generated.day::date <= g.end_date)
    order by generated.day, r.start_time, r.id
  loop
    v_start_time := coalesce(v_occ.exception_start_time, v_occ.rule_start_time);
    v_end_time := coalesce(v_occ.exception_end_time, v_occ.rule_end_time);
    v_teacher_user_id := coalesce(
      v_occ.exception_teacher_user_id,
      v_occ.rule_teacher_user_id,
      v_occ.group_teacher_user_id
    );
    v_assistant_ids := coalesce(
      v_occ.exception_assistant_ids,
      v_occ.rule_assistant_ids,
      v_occ.group_assistant_ids,
      '[]'::jsonb
    );
    v_substitute_teacher_user_id := case
      when v_occ.exception_type = 'substitute'
        then v_occ.exception_substitute_teacher_user_id
      else null
    end;

    select cs.id
      into v_session_id
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.class_group_id = v_occ.group_id
       and (
         (
           cs.schedule_rule_id = v_occ.rule_id
           and cs.occurrence_date = v_occ.occurrence_date
         )
         or (
           cs.schedule_rule_id is null
           and cs.date = v_occ.occurrence_date
           and left(coalesce(cs.start_time, ''), 5) in (
             left(coalesce(v_occ.rule_start_time, ''), 5),
             left(coalesce(v_start_time, ''), 5)
           )
         )
       )
     order by
       (cs.schedule_rule_id = v_occ.rule_id) desc,
       cs.created_at
     limit 1;

    if v_occ.exception_type = 'cancel' then
      if v_session_id is not null then
        update public.class_sessions
           set schedule_rule_id = coalesce(schedule_rule_id, v_occ.rule_id),
               occurrence_date = coalesce(occurrence_date, v_occ.occurrence_date),
               session_exception_id = v_occ.exception_id,
               canceled_by_schedule_exception = true,
               status = case when status = 'completed' then status else 'canceled' end
         where id = v_session_id;
      end if;
      continue;
    end if;

    if v_session_id is not null then
      update public.class_sessions
         set schedule_rule_id = coalesce(schedule_rule_id, v_occ.rule_id),
             occurrence_date = coalesce(occurrence_date, v_occ.occurrence_date),
             session_exception_id = v_occ.exception_id,
             date = v_occ.occurrence_date,
             start_time = case
               when status = 'completed' then start_time
               else v_start_time
             end,
             end_time = case
               when status = 'completed' then end_time
               else v_end_time
             end,
             room = case
               when status = 'completed' then room
               else coalesce(v_occ.rule_room, v_occ.group_room)
             end,
             teacher_user_id = case
               when status = 'completed' then teacher_user_id
               else v_teacher_user_id
             end,
             assistant_ids = case
               when status = 'completed' then assistant_ids
               else v_assistant_ids
             end,
             student_ids = case
               when status = 'completed' then student_ids
               else coalesce(v_occ.group_student_ids, '[]'::jsonb)
             end,
             substitute_teacher_user_id = case
               when status = 'completed' then substitute_teacher_user_id
               else v_substitute_teacher_user_id
             end,
             substitute_reason = case
               when status = 'completed' then substitute_reason
               else v_occ.exception_reason
             end,
             memo = case
               when status = 'completed' then memo
               else coalesce(v_occ.exception_memo, memo)
             end,
             record_schema = case
               when status = 'completed' then record_schema
               else coalesce(record_schema, v_occ.group_record_schema)
             end,
             activity_type = case
               when status = 'completed' then activity_type
               else coalesce(activity_type, v_occ.group_activity_type)
             end,
             activity_name = case
               when status = 'completed' then activity_name
               else coalesce(activity_name, v_occ.group_activity_name)
             end,
             status = case
               when status = 'completed' then status
               when canceled_by_schedule_exception then 'scheduled'
               when status = 'canceled' then status
               when v_occ.exception_type = 'reschedule' then 'rescheduled'
               else 'scheduled'
             end,
             canceled_by_schedule_exception = false
       where id = v_session_id;
    else
      v_status := case
        when v_occ.exception_type = 'reschedule' then 'rescheduled'
        else 'scheduled'
      end;

      insert into public.class_sessions (
        academy_id,
        user_id,
        mode,
        class_group_id,
        date,
        start_time,
        end_time,
        room,
        teacher_id,
        teacher_type,
        teacher_user_id,
        assistant_ids,
        student_ids,
        status,
        memo,
        record_schema,
        activity_type,
        activity_name,
        session_kind,
        substitute_teacher_user_id,
        substitute_reason,
        schedule_rule_id,
        occurrence_date,
        session_exception_id,
        canceled_by_schedule_exception
      ) values (
        p_academy_id,
        coalesce(v_occ.group_user_id, auth.uid()),
        'academy',
        v_occ.group_id,
        v_occ.occurrence_date,
        v_start_time,
        v_end_time,
        coalesce(v_occ.rule_room, v_occ.group_room),
        v_occ.group_teacher_id,
        coalesce(v_occ.group_teacher_type, 'teacher'),
        v_teacher_user_id,
        v_assistant_ids,
        coalesce(v_occ.group_student_ids, '[]'::jsonb),
        v_status,
        v_occ.exception_memo,
        v_occ.group_record_schema,
        v_occ.group_activity_type,
        v_occ.group_activity_name,
        'regular',
        v_substitute_teacher_user_id,
        v_occ.exception_reason,
        v_occ.rule_id,
        v_occ.occurrence_date,
        v_occ.exception_id,
        false
      )
      on conflict (schedule_rule_id, occurrence_date)
        where schedule_rule_id is not null and occurrence_date is not null
      do nothing;
    end if;
  end loop;

  -- 정기 규칙이 없는 추가 회차도 예외 ID를 기준으로 한 번만 만든다.
  for v_occ in
    select
      e.id as exception_id,
      e.session_date,
      e.start_time,
      e.end_time,
      e.teacher_user_id as exception_teacher_user_id,
      e.assistant_ids as exception_assistant_ids,
      e.substitute_teacher_user_id,
      e.reason,
      e.memo as exception_memo,
      g.id as group_id,
      g.user_id as group_user_id,
      g.teacher_id as group_teacher_id,
      g.teacher_type as group_teacher_type,
      g.teacher_user_id as group_teacher_user_id,
      g.assistant_ids as group_assistant_ids,
      g.student_ids as group_student_ids,
      g.room as group_room,
      g.record_schema as group_record_schema,
      g.activity_type as group_activity_type,
      g.activity_name as group_activity_name
    from public.class_session_exceptions e
    join public.class_groups g
      on g.id = e.class_group_id
     and g.academy_id = e.academy_id
   where e.academy_id = p_academy_id
     and e.type = 'extra'
     and e.session_date between p_from_date and p_to_date
     and g.status = 'active'
     and (p_class_group_id is null or g.id = p_class_group_id)
     and (g.start_date is null or e.session_date >= g.start_date)
     and (g.end_date is null or e.session_date <= g.end_date)
  loop
    if v_occ.start_time is null or v_occ.end_time is null then
      continue;
    end if;

    insert into public.class_sessions (
      academy_id,
      user_id,
      mode,
      class_group_id,
      date,
      start_time,
      end_time,
      room,
      teacher_id,
      teacher_type,
      teacher_user_id,
      assistant_ids,
      student_ids,
      status,
      memo,
      record_schema,
      activity_type,
      activity_name,
      session_kind,
      substitute_teacher_user_id,
      substitute_reason,
      occurrence_date,
      session_exception_id
    ) values (
      p_academy_id,
      coalesce(v_occ.group_user_id, auth.uid()),
      'academy',
      v_occ.group_id,
      v_occ.session_date,
      v_occ.start_time,
      v_occ.end_time,
      v_occ.group_room,
      v_occ.group_teacher_id,
      coalesce(v_occ.group_teacher_type, 'teacher'),
      coalesce(v_occ.exception_teacher_user_id, v_occ.group_teacher_user_id),
      coalesce(v_occ.exception_assistant_ids, v_occ.group_assistant_ids, '[]'::jsonb),
      coalesce(v_occ.group_student_ids, '[]'::jsonb),
      'scheduled',
      v_occ.exception_memo,
      v_occ.group_record_schema,
      v_occ.group_activity_type,
      v_occ.group_activity_name,
      'regular',
      v_occ.substitute_teacher_user_id,
      v_occ.reason,
      v_occ.session_date,
      v_occ.exception_id
    )
    on conflict (session_exception_id)
      where schedule_rule_id is null and session_exception_id is not null
    do nothing;
  end loop;

  return query
    select cs.*
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.date between p_from_date and p_to_date
       and (p_class_group_id is null or cs.class_group_id = p_class_group_id)
     order by cs.date, cs.start_time, cs.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_academy_drive_usage (
  p_academy_id uuid
)
  RETURNS TABLE (
    used_bytes  bigint,
    quota_bytes bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    coalesce(sum(f.size_bytes), 0)::bigint as used_bytes,
    a.drive_quota_bytes as quota_bytes
  from public.academies a
  left join public.academy_drive_files f on f.academy_id = a.id
  where a.id = p_academy_id
    and public.is_member_of_academy(a.id)
  group by a.id, a.drive_quota_bytes;
$function$;

CREATE OR REPLACE FUNCTION public.get_developer_dashboard_stats()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_feedback jsonb;
  v_active_academies bigint := 0;
  v_active_members bigint := 0;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'received', count(*) filter (where feedback.status = 'received'),
    'reviewing', count(*) filter (where feedback.status = 'reviewing'),
    'planned', count(*) filter (where feedback.status = 'planned'),
    'resolved', count(*) filter (where feedback.status = 'resolved'),
    'closed', count(*) filter (where feedback.status = 'closed'),
    'bugs', count(*) filter (where feedback.category = 'bug'),
    'improvements', count(*) filter (where feedback.category = 'improvement'),
    'last_7_days', count(*) filter (where feedback.created_at >= now() - interval '7 days')
  ) into v_feedback
  from public.product_feedback feedback;

  select count(*) into v_active_academies
  from public.academies;

  select count(*) into v_active_members
  from public.academy_members member
  where member.status = 'active';

  return coalesce(v_feedback, '{}'::jsonb) || jsonb_build_object(
    'active_academies', v_active_academies,
    'active_members', v_active_members,
    'generated_at', now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_developer_access()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_developer public.app_developers%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select * into v_developer
  from public.app_developers developer
  where developer.user_id = auth.uid()
    and developer.is_active = true;

  if not found then
    return jsonb_build_object('has_access', false);
  end if;

  return jsonb_build_object(
    'has_access', true,
    'role', v_developer.role,
    'capabilities', v_developer.capabilities
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_dm_thread (
  p_academy_id    uuid,
  p_other_user_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_id uuid;
  v_a uuid;
  v_b uuid;
begin
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '권한이 없어요.';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception '상대를 선택해주세요.';
  end if;
  -- 상대도 같은 학원 멤버여야 한다.
  if not exists (
    select 1 from public.academy_members
    where academy_id = p_academy_id
      and user_id = p_other_user_id
      and status = 'active'
  ) then
    raise exception '같은 학원의 직원만 채팅할 수 있어요.';
  end if;

  if auth.uid() < p_other_user_id then
    v_a := auth.uid(); v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := auth.uid();
  end if;

  select id into v_id
  from public.academy_chat_threads
  where academy_id = p_academy_id and kind = 'dm'
    and dm_user_a = v_a and dm_user_b = v_b
  limit 1;

  if v_id is null then
    insert into public.academy_chat_threads (academy_id, kind, dm_user_a, dm_user_b, created_by)
    values (p_academy_id, 'dm', v_a, v_b, auth.uid())
    on conflict (academy_id, dm_user_a, dm_user_b) where kind = 'dm'
    do update set updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_group_thread (
  p_academy_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_id uuid;
begin
  if not public.is_member_of_academy(p_academy_id) then
    raise exception '권한이 없어요.';
  end if;

  select id into v_id
  from public.academy_chat_threads
  where academy_id = p_academy_id
    and kind = 'group'
    and group_scope = 'academy'
  limit 1;

  if v_id is null then
    insert into public.academy_chat_threads (academy_id, kind, group_scope, title, created_by)
    values (p_academy_id, 'group', 'academy', '학원 전체', auth.uid())
    on conflict (academy_id) where kind = 'group' and group_scope = 'academy'
    do update set updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_student_secure (
  p_student_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_student public.students%rowtype;
  v_can_view_contacts boolean := false;
  v_can_manage_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then return null; end if;

  if v_student.mode = 'private' then
    if v_student.user_id is distinct from auth.uid() then
      raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
    end if;
    return to_jsonb(v_student);
  end if;

  if not public.is_owner_of_academy(v_student.academy_id)
     and not public.has_academy_permission(v_student.academy_id, 'canViewStudents') then
    raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_view_contacts := public.can_view_student_contacts(v_student.academy_id);
  v_can_manage_contacts := public.can_manage_student_contacts(v_student.academy_id);
  return to_jsonb(v_student)
    || jsonb_build_object(
      'phone', case when v_can_view_contacts then v_student.phone else null end,
      'parent_phone', case when v_can_view_contacts then v_student.parent_phone else null end,
      'parent_name', case when v_can_view_contacts then v_student.parent_name else null end,
      'parent_title', case when v_can_view_contacts then v_student.parent_title else null end,
      'parent_title_custom', case when v_can_view_contacts then v_student.parent_title_custom else null end,
      'checkin_pin', case when v_can_manage_contacts then v_student.checkin_pin else null end
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_academy_drive_file()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_extension text;
  v_quota bigint;
  v_used bigint;
begin
  if tg_op = 'UPDATE' and (
    new.academy_id is distinct from old.academy_id
    or new.storage_path is distinct from old.storage_path
    or new.created_by is distinct from old.created_by
    or new.size_bytes is distinct from old.size_bytes
    or new.mime_type is distinct from old.mime_type
    or new.original_name is distinct from old.original_name
  ) then
    raise exception '파일의 원본 정보는 변경할 수 없어요.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.original_name is distinct from old.original_name)
  then
    v_extension := lower(substring(new.original_name from '\.([^.]+)$'));
    if v_extension is null or v_extension not in (
      'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'odt', 'rtf',
      'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'
    ) then
      raise exception '지원하지 않는 파일 형식이에요.'
        using errcode = '22023';
    end if;
  end if;

  if new.deleted_at is null
    and new.folder_id is not null
    and not exists (
    select 1
    from public.academy_drive_folders f
    where f.id = new.folder_id
      and f.academy_id = new.academy_id
      and f.deleted_at is null
  ) then
    raise exception '사용할 수 없는 폴더예요.'
      using errcode = '23503';
  end if;

  -- 휴지통으로 옮길 때는 저장량이 늘지 않으므로 용량 검사를 반복하지 않는다.
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and not (old.deleted_at is not null and new.deleted_at is null)
  then
    return new;
  end if;

  -- 같은 학원에서 동시에 업로드해도 둘 다 한도를 통과하지 않게 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('drive:' || new.academy_id::text, 0));

  select a.drive_quota_bytes
    into v_quota
  from public.academies a
  where a.id = new.academy_id;

  select coalesce(sum(f.size_bytes), 0)
    into v_used
  from public.academy_drive_files f
  where f.academy_id = new.academy_id
    and f.id is distinct from new.id;

  if v_used + new.size_bytes > coalesce(v_quota, 1073741824) then
    raise exception '드라이브 저장 용량을 초과했어요.'
      using errcode = '54000';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_academy_drive_folder()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if tg_op = 'UPDATE' and (
    new.academy_id is distinct from old.academy_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception '폴더의 소속 정보는 변경할 수 없어요.'
      using errcode = '42501';
  end if;

  if new.deleted_at is null and new.parent_id is not null and not exists (
    select 1
    from public.academy_drive_folders parent
    where parent.id = new.parent_id
      and parent.academy_id = new.academy_id
      and parent.deleted_at is null
  ) then
    raise exception '상위 폴더를 먼저 복구해주세요.'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is not null
    and (
      exists (
        select 1
        from public.academy_drive_folders child
        where child.parent_id = old.id
          and child.deleted_at is null
      )
      or exists (
        select 1
        from public.academy_drive_files file
        where file.folder_id = old.id
          and file.deleted_at is null
      )
    )
  then
    raise exception '파일이나 하위 폴더를 먼저 비워주세요.'
      using errcode = '23503';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_canceled_class_session_completion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if old.status = 'canceled' and new.status = 'completed' then
    raise exception '휴강된 수업은 완료 처리할 수 없어요.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_canceled_class_session_record_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if new.class_session_id is not null and exists (
    select 1
    from public.class_sessions session
    where session.id = new.class_session_id
      and session.status = 'canceled'
  ) then
    raise exception '휴강된 수업에는 기록이나 출석을 저장할 수 없어요.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_extra_session_on_canceled_date()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if new.type = 'extra' and exists (
    select 1
    from public.class_session_exceptions cancellation
    where cancellation.academy_id = new.academy_id
      and cancellation.class_group_id = new.class_group_id
      and cancellation.session_date = new.session_date
      and cancellation.type = 'cancel'
      and cancellation.id is distinct from new.id
  ) then
    raise exception '휴강된 날짜에는 같은 반의 추가 수업을 만들 수 없어요. 다른 날짜를 선택해주세요.'
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_staff_attendance_review_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if public.is_academy_operations_manager(new.academy_id) then
    return new;
  end if;

  if new.staff_user_id <> auth.uid()
     or not public.is_member_of_academy(new.academy_id) then
    raise exception '본인의 근태 기록만 변경할 수 있어요.';
  end if;

  if tg_op = 'UPDATE' and old.status in ('approved', 'rejected') then
    raise exception '검토가 끝난 근태 기록은 직원이 변경할 수 없어요.';
  end if;

  if new.status not in ('pending', 'completed')
     or new.approved_by is not null
     or new.approved_at is not null then
    raise exception '근태 승인/거부는 원장 또는 운영 매니저만 할 수 있어요.';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_profile_upsert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  meta jsonb;
  next_account_type text;
  next_default_role text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  next_account_type := nullif(meta->>'account_type', '');
  if next_account_type not in ('tutor', 'owner', 'staff') then next_account_type := null; end if;
  next_default_role := nullif(meta->>'default_role', '');
  if next_default_role not in ('tutor', 'owner', 'teacher', 'assistant', 'manager') then
    next_default_role := case next_account_type
      when 'owner' then 'owner' when 'staff' then 'teacher' else 'tutor' end;
  end if;
  insert into public.profiles (id, email, display_name, phone, account_type, default_role)
  values (new.id, lower(new.email), nullif(meta->>'display_name', ''), nullif(meta->>'phone', ''), coalesce(next_account_type, 'tutor'), next_default_role)
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    account_type = coalesce(public.profiles.account_type, excluded.account_type),
    default_role = coalesce(public.profiles.default_role, excluded.default_role),
    updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.has_academy_permission (
  p_academy_id uuid,
  p_permission text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select auth.uid() is not null
    and public.academy_member_has_permission(p_academy_id, auth.uid(), p_permission);
$function$;

CREATE OR REPLACE FUNCTION public.is_academy_manager (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.academy_members m
    where m.academy_id = p_academy_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'manager'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_academy_operations_manager (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_owner_of_academy(p_academy_id)
    or exists (
      select 1
      from public.academy_members m
      where m.academy_id = p_academy_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role = 'manager'
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_class_group (
  p_academy_id     uuid,
  p_class_group_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.class_groups g
    where g.id = p_class_group_id
      and g.academy_id = p_academy_id
      and g.mode = 'academy'
      and g.teacher_user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_class_session (
  p_academy_id       uuid,
  p_class_session_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.class_sessions s
    left join public.class_groups g on g.id = s.class_group_id
    where s.id = p_class_session_id
      and s.academy_id = p_academy_id
      and s.mode = 'academy'
      and (
        s.teacher_user_id = auth.uid()
        or s.substitute_teacher_user_id = auth.uid()
        or g.teacher_user_id = auth.uid()
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_student (
  p_academy_id uuid,
  p_student_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    exists (
      select 1
      from public.class_groups g
      where g.academy_id = p_academy_id
        and g.mode = 'academy'
        and g.teacher_user_id = auth.uid()
        and coalesce(g.student_ids, '[]'::jsonb)
          @> jsonb_build_array(p_student_id::text)
    )
    or exists (
      select 1
      from public.class_sessions s
      left join public.class_groups g on g.id = s.class_group_id
      where s.academy_id = p_academy_id
        and s.mode = 'academy'
        and (
          s.teacher_user_id = auth.uid()
          or s.substitute_teacher_user_id = auth.uid()
          or g.teacher_user_id = auth.uid()
        )
        and coalesce(s.student_ids, '[]'::jsonb)
          @> jsonb_build_array(p_student_id::text)
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_current_app_developer()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select auth.uid() is not null and exists (
    select 1
    from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_member_of_academy (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academy_members
    where academy_id = p_academy_id
      and user_id    = auth.uid()
      and status     = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_member_of_academy_drive_object (
  p_object_name text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academies a
    where a.id::text = split_part(p_object_name, '/', 1)
      and public.is_member_of_academy(a.id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_operations_manager_of_academy_drive_object (
  p_object_name text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_academy_operations_manager(a.id)
  from public.academies a
  where a.id::text = split_part(p_object_name, '/', 1);
$function$;

CREATE OR REPLACE FUNCTION public.is_owner_member_of_academy (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academy_members
    where academy_id = p_academy_id
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_owner_of_academy (
  p_academy_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academies
    where id = p_academy_id
      and owner_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_owner_of_academy_drive_object (
  p_object_name text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.academies a
    where a.id::text = split_part(p_object_name, '/', 1)
      and a.owner_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.leave_academy (
  p_academy_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select public.leave_academy(
    p_academy_id,
    (now() at time zone 'Asia/Seoul')::date
  );
$function$;

CREATE OR REPLACE FUNCTION public.leave_academy (
  p_academy_id     uuid,
  p_last_work_date date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.academy_members%rowtype;
  v_profile public.academy_staff_profiles%rowtype;
  v_class_count integer := 0;
  v_payroll jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_user_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_last_work_date is null or p_last_work_date > v_today then
    raise exception '마지막 근무일을 오늘 또는 이전 날짜로 선택해주세요.' using errcode = '22023';
  end if;
  select * into v_membership from public.academy_members
  where academy_id = p_academy_id and user_id = v_user_id and status = 'active'
  for update;
  if not found then raise exception '현재 소속된 학원이 아니에요.'; end if;
  if v_membership.role = 'owner' or exists (
    select 1 from public.academies a where a.id = p_academy_id and a.owner_id = v_user_id
  ) then
    raise exception '원장은 학원을 나갈 수 없어요. 먼저 소유권을 이전해주세요.';
  end if;
  select * into v_profile from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = v_user_id;
  if found and v_profile.employment_started_on is not null
      and p_last_work_date < v_profile.employment_started_on then
    raise exception '마지막 근무일이 입사일보다 빠를 수 없어요.' using errcode = '22023';
  end if;
  select count(*) into v_class_count from public.class_groups g
  where g.academy_id = p_academy_id and g.teacher_user_id = v_user_id
    and coalesce(g.status, 'active') <> 'inactive';

  v_payroll := public.prepare_staff_exit_payroll(p_academy_id, v_user_id, p_last_work_date);

  update public.academy_members set status = 'inactive', updated_at = now()
  where id = v_membership.id;
  update public.academy_staff_profiles
  set status = 'inactive', employment_ended_on = p_last_work_date,
      exit_reason = 'left', updated_at = now()
  where academy_id = p_academy_id and user_id = v_user_id;
  update public.academy_staff_work_rules set is_active = false, updated_at = now()
  where academy_id = p_academy_id and staff_user_id = v_user_id and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id, 'user_id', v_user_id,
    'membership_status', 'inactive', 'last_work_date', p_last_work_date,
    'assigned_class_count', v_class_count, 'exit_payroll', v_payroll
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_chat_members (
  p_academy_id uuid
)
  RETURNS TABLE (
    user_id      uuid,
    display_name text,
    email        text,
    role         text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    p.id           as user_id,
    p.display_name,
    p.email,
    m.role
  from public.academy_members m
  join public.profiles p
    on p.id = m.user_id
  where m.academy_id = p_academy_id
    and m.status     = 'active'
    and public.is_member_of_academy(p_academy_id);
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_invitation_accounts (
  p_academy_id uuid
)
  RETURNS TABLE (
    email                  text,
    display_name           text,
    accepted_user_id       uuid,
    membership_status      text,
    last_role              text,
    last_job_title         text,
    last_invited_at        timestamp with time zone,
    last_accepted_at       timestamp with time zone,
    has_pending_invitation boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_academy_id is null or not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '초대 기록을 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  return query
  with ranked_accepted as (
    select
      invitation.*,
      row_number() over (
        partition by lower(btrim(invitation.email))
        order by invitation.updated_at desc, invitation.created_at desc, invitation.id desc
      ) as row_number
    from public.academy_invitations invitation
    where invitation.academy_id = p_academy_id
      and invitation.status = 'accepted'
  ),
  latest_accepted as (
    select * from ranked_accepted where row_number = 1
  )
  select
    accepted.email,
    nullif(btrim(profile.display_name), '') as display_name,
    accepted.accepted_user_id,
    member.status as membership_status,
    accepted.role as last_role,
    accepted.job_title as last_job_title,
    accepted.created_at as last_invited_at,
    accepted.updated_at as last_accepted_at,
    exists (
      select 1
      from public.academy_invitations pending
      where pending.academy_id = p_academy_id
        and lower(btrim(pending.email)) = lower(btrim(accepted.email))
        and pending.status = 'pending'
    ) as has_pending_invitation
  from latest_accepted accepted
  left join public.profiles profile on profile.id = accepted.accepted_user_id
  left join public.academy_members member
    on member.academy_id = p_academy_id
   and member.user_id = accepted.accepted_user_id
  order by accepted.updated_at desc, accepted.email;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_member_profiles (
  p_academy_id uuid
)
  RETURNS TABLE (
    user_id      uuid,
    display_name text,
    email        text,
    phone        text,
    account_type text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select p.id, p.display_name, p.email, p.phone, p.account_type
  from public.profiles p
  join public.academy_members m on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and public.is_academy_operations_manager(p_academy_id);
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_member_profiles_v2 (
  p_academy_id uuid
)
  RETURNS TABLE (
    user_id           uuid,
    display_name      text,
    email             text,
    phone             text,
    account_type      text,
    membership_role   text,
    membership_status text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select p.id, p.display_name, p.email, p.phone, p.account_type, m.role, m.status
  from public.profiles p
  join public.academy_members m on m.user_id = p.id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and (
      public.is_owner_of_academy(p_academy_id)
      or public.has_academy_permission(p_academy_id, 'canManageStaff')
      or public.has_academy_permission(p_academy_id, 'canManageStaffPermissions')
      or public.has_academy_permission(p_academy_id, 'canRemoveStaff')
    );
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_role_assignment_candidates (
  p_academy_id uuid
)
  RETURNS TABLE (
    member_id         uuid,
    user_id           uuid,
    display_name      text,
    email             text,
    phone             text,
    membership_status text,
    membership_role   text,
    accepted_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    m.id,
    m.user_id,
    p.display_name,
    p.email,
    p.phone,
    m.status,
    m.role,
    i.updated_at
  from public.academy_members m
  left join public.profiles p on p.id = m.user_id
  left join public.academy_invitations i
    on i.academy_id = m.academy_id
   and i.accepted_user_id = m.user_id
   and i.role = 'pending'
   and i.status = 'accepted'
  where m.academy_id = p_academy_id
    and m.role = 'pending'
    and m.status = 'invited'
    and public.is_academy_operations_manager(p_academy_id)
  order by i.updated_at desc nulls last, m.created_at asc;
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_staff_access_profiles (
  p_academy_id uuid
)
  RETURNS TABLE (
    academy_id  uuid,
    user_id     uuid,
    member_id   uuid,
    role        text,
    job_title   text,
    permissions jsonb,
    status      text,
    created_at  timestamp with time zone,
    updated_at  timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
    or public.has_academy_permission(p_academy_id, 'canManageStaffPermissions')
    or public.has_academy_permission(p_academy_id, 'canRemoveStaff')
  ) then
    raise exception '직원 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  return query
  select m.academy_id, m.user_id, m.id, m.role,
         coalesce(nullif(btrim(asp.job_title), ''),
           case when m.role = 'manager' then '운영 매니저' else '선생님' end),
         coalesce(asp.permissions, '{}'::jsonb),
         m.status,
         coalesce(asp.created_at, m.created_at),
         coalesce(asp.updated_at, m.updated_at)
  from public.academy_members m
  left join public.academy_staff_profiles asp
    on asp.academy_id = m.academy_id and asp.user_id = m.user_id
  where m.academy_id = p_academy_id
    and m.status = 'active'
    and m.role in ('teacher', 'assistant', 'manager')
  order by coalesce(asp.created_at, m.created_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_academy_students_secure (
  p_academy_id uuid
)
  RETURNS SETOF jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_can_view_contacts boolean := false;
  v_can_manage_contacts boolean := false;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not public.has_academy_permission(p_academy_id, 'canViewStudents')
     and not public.is_owner_of_academy(p_academy_id) then
    raise exception '학생 정보를 확인할 권한이 없어요.' using errcode = '42501';
  end if;

  v_can_view_contacts := public.can_view_student_contacts(p_academy_id);
  v_can_manage_contacts := public.can_manage_student_contacts(p_academy_id);

  return query
  select to_jsonb(s)
    || jsonb_build_object(
      'phone', case when v_can_view_contacts then s.phone else null end,
      'parent_phone', case when v_can_view_contacts then s.parent_phone else null end,
      'parent_name', case when v_can_view_contacts then s.parent_name else null end,
      'parent_title', case when v_can_view_contacts then s.parent_title else null end,
      'parent_title_custom', case when v_can_view_contacts then s.parent_title_custom else null end,
      'checkin_pin', case when v_can_manage_contacts then s.checkin_pin else null end
    )
  from public.students s
  where s.academy_id = p_academy_id
    and s.mode = 'academy'
  order by s.name, s.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_pending_academy_invitations()
  RETURNS TABLE (
    invitation_id    uuid,
    academy_id       uuid,
    academy_name     text,
    email            text,
    role             text,
    job_title        text,
    status           text,
    invited_by       uuid,
    accepted_user_id uuid,
    created_at       timestamp with time zone,
    updated_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    i.id,
    i.academy_id,
    a.name,
    i.email,
    i.role,
    i.job_title,
    i.status,
    i.invited_by,
    i.accepted_user_id,
    i.created_at,
    i.updated_at
  from public.academy_invitations i
  join public.academies a on a.id = i.academy_id
  where i.status = 'pending'
    and lower(i.email) = lower(coalesce(auth.email(), ''))
  order by i.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_private_students_secure()
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select to_jsonb(s)
  from public.students s
  where s.mode = 'private' and s.user_id = auth.uid()
  order by s.name, s.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_product_feedback_for_developer (
  p_status   text    DEFAULT NULL::text,
  p_category text    DEFAULT NULL::text,
  p_limit    integer DEFAULT 50,
  p_offset   integer DEFAULT 0
)
  RETURNS TABLE (
    id              uuid,
    academy_name    text,
    category        text,
    message         text,
    screenshot_path text,
    page_path       text,
    app_mode        text,
    reporter_role   text,
    context         jsonb,
    status          text,
    created_at      timestamp with time zone,
    updated_at      timestamp with time zone,
    total_count     bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('received', 'reviewing', 'planned', 'resolved', 'closed') then
    raise exception '의견 상태가 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('bug', 'improvement') then
    raise exception '의견 종류가 올바르지 않아요.' using errcode = '22023';
  end if;

  return query
  select
    feedback.id,
    academy.name,
    feedback.category,
    feedback.message,
    feedback.screenshot_path,
    feedback.page_path,
    feedback.app_mode,
    feedback.reporter_role,
    feedback.context,
    feedback.status,
    feedback.created_at,
    feedback.updated_at,
    count(*) over() as total_count
  from public.product_feedback feedback
  left join public.academies academy on academy.id = feedback.academy_id
  where (p_status is null or feedback.status = p_status)
    and (p_category is null or feedback.category = p_category)
  order by feedback.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_academy_staff_access (
  p_academy_id  uuid,
  p_user_id     uuid,
  p_job_title   text,
  p_permissions jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_is_owner boolean := false;
  v_member public.academy_members%rowtype;
  v_existing public.academy_staff_profiles%rowtype;
  v_policies jsonb := '{}'::jsonb;
  v_policy jsonb := '{}'::jsonb;
  v_role text;
  v_title text := nullif(btrim(p_job_title), '');
  v_permissions jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_enabled boolean;
  v_known_keys text[] := array[
    'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
    'canEditClinicRecords', 'canViewPayroll', 'canViewPayments',
    'canManageClasses', 'canManageStudents', 'canManagePayments',
    'canManageStaff', 'canManageStaffPermissions', 'canRemoveStaff',
    'canManageDrive'
  ];
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if v_title is null then raise exception '직책을 선택해주세요.'; end if;
  if char_length(v_title) > 40 then raise exception '직책은 40자 이내여야 해요.'; end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object' then
    raise exception '권한 형식이 올바르지 않아요.';
  end if;

  v_is_owner := public.is_owner_of_academy(p_academy_id);
  if not v_is_owner
     and not public.has_academy_permission(p_academy_id, 'canManageStaffPermissions') then
    raise exception '직책과 권한을 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인의 직책과 권한은 직접 변경할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_member
  from public.academy_members
  where academy_id = p_academy_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception '활성 상태인 직원을 찾을 수 없어요.'; end if;
  if v_member.role = 'owner' or exists (
    select 1 from public.academies a
    where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    raise exception '원장 권한은 변경할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_existing
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id;

  select coalesce(a.job_title_permissions, '{}'::jsonb)
  into v_policies from public.academies a where a.id = p_academy_id;
  v_policy := coalesce(v_policies -> v_title, '{}'::jsonb);
  if v_policy = '{}'::jsonb and v_title is distinct from v_existing.job_title then
    raise exception '학원 설정에 등록된 직책을 선택해주세요.';
  end if;
  v_role := case
    when v_policy ->> 'role' = 'manager' then 'manager'
    when v_policy <> '{}'::jsonb then 'teacher'
    when v_member.role = 'manager' then 'manager'
    else 'teacher'
  end;

  -- 알려진 boolean 권한만 개인 예외로 저장한다.
  foreach v_key in array v_known_keys loop
    v_value := coalesce(p_permissions, '{}'::jsonb) -> v_key;
    if jsonb_typeof(v_value) = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  if not v_is_owner then
    -- 위임 권한 보유자가 다른 접근 관리자를 강등하거나 복제하지 못하게 한다.
    if public.academy_member_has_permission(p_academy_id, p_user_id, 'canManageStaffPermissions')
       or public.academy_member_has_permission(p_academy_id, p_user_id, 'canRemoveStaff') then
      raise exception '접근 관리 권한이 있는 직원은 원장만 변경할 수 있어요.' using errcode = '42501';
    end if;
    if coalesce((v_policy -> 'permissions' ->> 'canManageStaffPermissions')::boolean, false)
       or coalesce((v_policy -> 'permissions' ->> 'canRemoveStaff')::boolean, false) then
      raise exception '고위험 관리 권한은 원장만 부여할 수 있어요.' using errcode = '42501';
    end if;

    -- 민감 권한의 기존 개인 예외값은 그대로 보존한다.
    v_permissions := v_permissions - 'canManageStaffPermissions' - 'canRemoveStaff';
    if jsonb_typeof(coalesce(v_existing.permissions, '{}'::jsonb) -> 'canManageStaffPermissions') = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(
        'canManageStaffPermissions', v_existing.permissions -> 'canManageStaffPermissions');
    end if;
    if jsonb_typeof(coalesce(v_existing.permissions, '{}'::jsonb) -> 'canRemoveStaff') = 'boolean' then
      v_permissions := v_permissions || jsonb_build_object(
        'canRemoveStaff', v_existing.permissions -> 'canRemoveStaff');
    end if;

    -- 자신에게 없는 일반 권한을 타인에게 새로 부여하지 못하게 한다.
    foreach v_key in array v_known_keys loop
      if v_key in ('canManageStaffPermissions', 'canRemoveStaff', 'canManageDrive') then
        continue;
      end if;
      v_enabled := case v_role
        when 'teacher' then v_key in (
          'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
          'canEditClinicRecords', 'canViewPayroll', 'canManageStudents')
        when 'manager' then v_key in (
          'canViewStudents', 'canEditLessonRecords', 'canEditAttendance',
          'canEditClinicRecords', 'canViewPayroll', 'canViewPayments',
          'canManageClasses', 'canManageStudents', 'canManagePayments', 'canManageStaff')
        else false
      end;
      v_value := v_policy -> 'permissions' -> v_key;
      if jsonb_typeof(v_value) = 'boolean' then v_enabled := (v_value #>> '{}')::boolean; end if;
      v_value := v_permissions -> v_key;
      if jsonb_typeof(v_value) = 'boolean' then v_enabled := (v_value #>> '{}')::boolean; end if;
      if v_enabled and not public.has_academy_permission(p_academy_id, v_key) then
        raise exception '보유하지 않은 권한은 다른 직원에게 부여할 수 없어요.' using errcode = '42501';
      end if;
    end loop;
  end if;

  update public.academy_members
  set role = v_role, updated_at = now()
  where id = v_member.id;

  insert into public.academy_staff_profiles as asp (
    academy_id, user_id, member_id, role, job_title, permissions,
    subjects, wage_type, hourly_wage, monthly_salary, status
  ) values (
    p_academy_id, p_user_id, v_member.id, v_role, v_title, v_permissions,
    '[]'::jsonb, 'hourly', 0, 0, 'active'
  )
  on conflict (academy_id, user_id) do update set
    member_id = excluded.member_id,
    role = excluded.role,
    job_title = excluded.job_title,
    permissions = excluded.permissions,
    status = 'active',
    updated_at = now();

  return jsonb_build_object(
    'academy_id', p_academy_id,
    'user_id', p_user_id,
    'member_id', v_member.id,
    'role', v_role,
    'job_title', v_title,
    'permissions', v_permissions,
    'status', 'active'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_staff_exit_payroll (
  p_academy_id     uuid,
  p_user_id        uuid,
  p_last_work_date date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_profile public.academy_staff_profiles%rowtype;
  v_month text := to_char(p_last_work_date, 'YYYY-MM');
  v_period_start date := date_trunc('month', p_last_work_date)::date;
  v_total_minutes numeric := 0;
  v_total_hours numeric := 0;
  v_open_count integer := 0;
  v_staff_type text;
  v_staff_id text;
  v_amount integer := 0;
  v_payroll public.payrolls%rowtype;
begin
  select * into v_profile
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('created', false, 'reason', 'staff_profile_missing');
  end if;

  v_period_start := greatest(
    v_period_start,
    coalesce(v_profile.employment_started_on, v_period_start)
  );
  v_staff_type := case
    when v_profile.role in ('teacher', 'assistant', 'manager') then v_profile.role
    else 'teacher'
  end;
  v_staff_id := v_staff_type || '_' || p_user_id::text;

  -- 예전 로컬 ID로 같은 달 명세가 이미 있으면 그 식별자를 보존한다.
  -- 퇴사 정산 때문에 같은 직원의 명세가 두 건 생기는 것을 막는다.
  select p.staff_type, p.staff_id
  into v_staff_type, v_staff_id
  from public.payrolls p
  where p.academy_id = p_academy_id
    and p.staff_user_id = p_user_id
    and p.month = v_month
  order by (p.status = 'completed') desc, p.updated_at desc nulls last, p.created_at desc
  limit 1;

  if not found then
    v_staff_type := case
      when v_profile.role in ('teacher', 'assistant', 'manager') then v_profile.role
      else 'teacher'
    end;
    v_staff_id := v_staff_type || '_' || p_user_id::text;
  end if;

  with parsed as (
    select
      (split_part(actual_start_time, ':', 1)::integer * 60
        + split_part(actual_start_time, ':', 2)::integer) as start_minute,
      (split_part(actual_end_time, ':', 1)::integer * 60
        + split_part(actual_end_time, ':', 2)::integer) as end_minute,
      greatest(0, coalesce(break_minutes, 0)) as break_minute
    from public.staff_attendance_logs
    where academy_id = p_academy_id
      and staff_user_id = p_user_id
      and work_date between v_period_start and p_last_work_date
      and is_void = false
      and status in ('completed', 'approved')
      and actual_start_time ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
      and actual_end_time ~ '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
  )
  select coalesce(sum(greatest(
    0,
    (case
      when end_minute >= start_minute then end_minute - start_minute
      else (24 * 60) - start_minute + end_minute
    end) - break_minute
  )), 0)
  into v_total_minutes
  from parsed;

  select count(*) into v_open_count
  from public.staff_attendance_logs
  where academy_id = p_academy_id
    and staff_user_id = p_user_id
    and work_date between v_period_start and p_last_work_date
    and is_void = false
    and actual_start_time is not null
    and actual_end_time is null
    and status <> 'rejected';

  v_total_hours := round((v_total_minutes / 60.0)::numeric, 2);
  v_amount := case
    when coalesce(v_profile.wage_type, 'hourly') = 'hourly'
      then round(v_total_hours * coalesce(v_profile.hourly_wage, 0))::integer
    else coalesce(v_profile.monthly_salary, 0)
  end;

  insert into public.payrolls as existing (
    academy_id, user_id, mode, staff_type, staff_id, staff_user_id, month,
    wage_type, hourly_wage, monthly_salary, total_hours, amount, status, memo,
    is_exit_settlement, requires_review, period_start, period_end,
    calculation_snapshot
  ) values (
    p_academy_id, auth.uid(), 'academy', v_staff_type, v_staff_id, p_user_id, v_month,
    coalesce(v_profile.wage_type, 'hourly'), coalesce(v_profile.hourly_wage, 0),
    coalesce(v_profile.monthly_salary, 0), v_total_hours, v_amount, 'hold',
    '퇴사 월 최종 급여 확인 필요', true, true, v_period_start, p_last_work_date,
    jsonb_build_object(
      'source', 'staff_attendance_logs',
      'payable_statuses', jsonb_build_array('completed', 'approved'),
      'open_log_count', v_open_count,
      'calculated_at', now(),
      'wage_type', coalesce(v_profile.wage_type, 'hourly'),
      'hourly_wage', coalesce(v_profile.hourly_wage, 0),
      'monthly_salary', coalesce(v_profile.monthly_salary, 0)
    )
  )
  on conflict (academy_id, staff_type, staff_id, month) do update set
    staff_user_id = excluded.staff_user_id,
    is_exit_settlement = true,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    calculation_snapshot = excluded.calculation_snapshot,
    requires_review = case when existing.status = 'completed' then false else true end,
    wage_type = case when existing.status = 'completed' then existing.wage_type else excluded.wage_type end,
    hourly_wage = case when existing.status = 'completed' then existing.hourly_wage else excluded.hourly_wage end,
    monthly_salary = case when existing.status = 'completed' then existing.monthly_salary else excluded.monthly_salary end,
    total_hours = case when existing.status = 'completed' then existing.total_hours else excluded.total_hours end,
    amount = case when existing.status = 'completed' then existing.amount else excluded.amount end,
    status = case when existing.status = 'completed' then existing.status else 'hold' end,
    memo = case when existing.status = 'completed' then existing.memo else excluded.memo end,
    updated_at = now()
  returning * into v_payroll;

  return jsonb_build_object(
    'created', true,
    'payroll_id', v_payroll.id,
    'month', v_month,
    'status', v_payroll.status,
    'total_hours', v_payroll.total_hours,
    'amount', v_payroll.amount,
    'open_log_count', v_open_count,
    'requires_review', v_payroll.requires_review
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.preserve_class_session_calendar_cancel_origin()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_new_is_calendar_cancel boolean := false;
  v_new_is_manual_cancel boolean := false;
begin
  if new.session_exception_id is not null then
    select exists (
      select 1 from public.class_session_exceptions exception
      where exception.id = new.session_exception_id
        and exception.type = 'cancel'
        and exception.calendar_event_id is not null
    ) into v_new_is_calendar_cancel;
    select exists (
      select 1 from public.class_session_exceptions exception
      where exception.id = new.session_exception_id
        and exception.type = 'cancel'
        and exception.calendar_event_id is null
    ) into v_new_is_manual_cancel;
  end if;

  -- 처음 학원 일정 휴강이 덮어쓸 때만 원래 상태를 보관한다. 여러 학원
  -- 일정이 겹쳐도 마지막 일정이 사라질 때까지 같은 원본을 유지한다.
  if v_new_is_calendar_cancel and new.status = 'canceled' then
    if old.calendar_cancel_original_status is null then
      new.calendar_cancel_original_status := old.status;
      new.calendar_cancel_original_by_exception := old.canceled_by_schedule_exception;
      new.calendar_cancel_original_exception_id := old.session_exception_id;
    end if;
    return new;
  end if;

  if old.calendar_cancel_original_status is not null then
    -- 학원 휴원 기간 중 사용자가 별도의 수동 휴강을 추가했다면 그 결정을
    -- 유지한다. 그렇지 않을 때만 휴원 이전 상태로 되돌린다.
    if not v_new_is_manual_cancel then
      new.status := old.calendar_cancel_original_status;
      new.canceled_by_schedule_exception := coalesce(
        old.calendar_cancel_original_by_exception,
        false
      );
      new.session_exception_id := old.calendar_cancel_original_exception_id;
    end if;
    new.calendar_cancel_original_status := null;
    new.calendar_cancel_original_by_exception := null;
    new.calendar_cancel_original_exception_id := null;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_student_contact_permission_assignment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_dedicated_write boolean :=
    current_setting('seenit.allow_student_contact_permission_write', true) = 'on';
begin
  if v_dedicated_write and public.is_owner_of_academy(new.academy_id) then
    if coalesce((new.permissions ->> 'canManageStudentContacts')::boolean, false) then
      new.permissions := coalesce(new.permissions, '{}'::jsonb)
        || jsonb_build_object('canViewStudentContacts', true);
    end if;
    return new;
  end if;

  new.permissions := coalesce(new.permissions, '{}'::jsonb)
    - 'canViewStudentContacts' - 'canManageStudentContacts';
  if tg_op = 'UPDATE' then
    if jsonb_typeof(coalesce(old.permissions, '{}'::jsonb) -> 'canViewStudentContacts') = 'boolean' then
      new.permissions := new.permissions || jsonb_build_object(
        'canViewStudentContacts', old.permissions -> 'canViewStudentContacts');
    end if;
    if jsonb_typeof(coalesce(old.permissions, '{}'::jsonb) -> 'canManageStudentContacts') = 'boolean' then
      new.permissions := new.permissions || jsonb_build_object(
        'canManageStudentContacts', old.permissions -> 'canManageStudentContacts');
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.public_student_checkin (
  p_academy_id uuid,
  p_qr_token   text,
  p_pin        text,
  p_expires_at bigint DEFAULT NULL::bigint
)
  RETURNS TABLE (
    ok           boolean,
    event_id     uuid,
    event_type   text,
    event_time   timestamp with time zone,
    student_id   uuid,
    student_name text,
    message      text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_token text;
  v_student record;
  v_match_count integer;
  v_latest_id uuid;
  v_latest_type text;
  v_latest_time timestamptz;
  v_latest_source text;
  v_today_start timestamptz;
  v_cutoff timestamptz;
  v_next_type text;
  v_event_id uuid;
  v_event_time timestamptz;
begin
  if p_academy_id is null then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_academy';
    return;
  end if;

  if p_qr_token is null or length(trim(p_qr_token)) = 0 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_qr';
    return;
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_pin';
    return;
  end if;

  if p_expires_at is not null and extract(epoch from now())::bigint > p_expires_at then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'expired_qr';
    return;
  end if;

  select attendance_qr_token
    into v_token
  from public.academies
  where id = p_academy_id;

  if v_token is null or v_token <> p_qr_token then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'invalid_qr';
    return;
  end if;

  select count(*)
    into v_match_count
  from public.students
  where academy_id = p_academy_id
    and mode = 'academy'
    and status = 'active'
    and checkin_pin = p_pin;

  if v_match_count = 0 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'pin_not_found';
    return;
  end if;

  if v_match_count > 1 then
    return query select false, null::uuid, null::text, null::timestamptz, null::uuid, null::text, 'duplicate_pin';
    return;
  end if;

  select id, name
    into v_student
  from public.students
  where academy_id = p_academy_id
    and mode = 'academy'
    and status = 'active'
    and checkin_pin = p_pin
  limit 1;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || v_student.id::text, 0)
  );

  v_today_start := (timezone('Asia/Seoul', now()))::date::timestamp at time zone 'Asia/Seoul';
  v_cutoff := ((timezone('Asia/Seoul', now()))::date + time '22:00') at time zone 'Asia/Seoul';

  select sce.id, sce.event_type, sce.event_time, sce.source
    into v_latest_id, v_latest_type, v_latest_time, v_latest_source
  from public.student_check_events sce
  where sce.academy_id = p_academy_id
    and sce.student_id = v_student.id
    and sce.event_time >= v_today_start
  order by sce.event_time desc, sce.created_at desc
  limit 1;

  if v_latest_id is not null and v_latest_time >= now() - interval '8 seconds' then
    return query select
      true, v_latest_id, v_latest_type, v_latest_time,
      v_student.id, v_student.name, 'duplicate';
    return;
  end if;

  if now() >= v_cutoff
     and v_latest_type = 'check_out'
     and v_latest_source = 'system_auto' then
    return query select
      true, v_latest_id, v_latest_type, v_latest_time,
      v_student.id, v_student.name, 'auto_checkout';
    return;
  end if;

  v_next_type := case when v_latest_type = 'check_in' then 'check_out' else 'check_in' end;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    created_by
  )
  values (
    p_academy_id,
    v_student.id,
    v_next_type,
    'qr',
    null
  )
  returning student_check_events.id, student_check_events.event_time
    into v_event_id, v_event_time;

  return query select
    true, v_event_id, v_next_type, v_event_time,
    v_student.id, v_student.name, 'ok';
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_staff_attendance (
  p_academy_id           uuid,
  p_staff_user_id        uuid,
  p_staff_role           text,
  p_work_date            date,
  p_action               text,
  p_time                 text,
  p_scheduled_start_time text    DEFAULT NULL::text,
  p_scheduled_end_time   text    DEFAULT NULL::text,
  p_break_minutes        integer DEFAULT 0,
  p_source               text    DEFAULT 'manual'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_log public.staff_attendance_logs%rowtype;
  v_is_self boolean := auth.uid() = p_staff_user_id;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_action text := p_action;
  v_staff_role text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  select case when m.role = 'assistant' then 'teacher' else m.role end
    into v_staff_role
    from public.academy_members m
   where m.academy_id = p_academy_id
     and m.user_id = p_staff_user_id
     and m.status = 'active'
     and m.role in ('teacher', 'assistant', 'manager')
   limit 1;
  if not found then
    raise exception '이 학원의 활성 직원을 찾을 수 없어요.' using errcode = '42501';
  end if;

  if not (
    v_is_self
    or public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '근퇴 기록 권한이 없어요.' using errcode = '42501';
  end if;
  if v_is_self and p_work_date is distinct from v_today then
    raise exception '본인은 오늘 근퇴만 기록할 수 있어요.' using errcode = '42501';
  end if;
  if p_action not in ('clock_in', 'clock_out', 'toggle') then
    raise exception '지원하지 않는 근퇴 동작이에요.' using errcode = '22023';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시간 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'qr') then
    raise exception '근퇴 기록 출처가 올바르지 않아요.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_academy_id::text || ':' || p_staff_user_id::text || ':' || p_work_date::text,
      0
    )
  );

  select * into v_log
  from public.staff_attendance_logs
  where academy_id = p_academy_id
    and staff_user_id = p_staff_user_id
    and work_date = p_work_date
    and is_void = false
  for update;

  if p_action = 'toggle' then
    if not found or v_log.actual_start_time is null then
      v_action := 'clock_in';
    elsif v_log.actual_end_time is null then
      if v_log.actual_start_time = p_time then
        return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'already_clocked_in');
      end if;
      v_action := 'clock_out';
    else
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
  end if;

  if v_action = 'clock_in' then
    if found and v_log.actual_start_time is not null then
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
    if found then
      update public.staff_attendance_logs
      set actual_start_time = p_time,
          scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
          scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
          break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
          staff_role = v_staff_role,
          source = p_source,
          status = 'pending',
          approved_by = null,
          approved_at = null,
          updated_at = now()
      where id = v_log.id
      returning * into v_log;
    else
      insert into public.staff_attendance_logs (
        academy_id, staff_user_id, staff_role, work_date,
        scheduled_start_time, scheduled_end_time,
        actual_start_time, break_minutes, status, source
      ) values (
        p_academy_id, p_staff_user_id, v_staff_role, p_work_date,
        p_scheduled_start_time, p_scheduled_end_time,
        p_time, greatest(0, coalesce(p_break_minutes, 0)), 'pending', p_source
      ) returning * into v_log;
    end if;
  else
    if not found or v_log.actual_start_time is null then
      raise exception '먼저 출근을 기록해주세요.' using errcode = '22023';
    end if;
    if v_log.actual_end_time is not null then
      return to_jsonb(v_log) || jsonb_build_object('_attendance_action', 'none');
    end if;
    update public.staff_attendance_logs
    set actual_end_time = p_time,
        scheduled_start_time = coalesce(scheduled_start_time, p_scheduled_start_time),
        scheduled_end_time = coalesce(scheduled_end_time, p_scheduled_end_time),
        break_minutes = greatest(0, coalesce(break_minutes, 0), coalesce(p_break_minutes, 0)),
        staff_role = v_staff_role,
        source = coalesce(source, p_source),
        status = 'completed',
        approved_by = null,
        approved_at = null,
        updated_at = now()
    where id = v_log.id
    returning * into v_log;
  end if;

  return to_jsonb(v_log) || jsonb_build_object('_attendance_action', v_action);
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_push_device (
  p_token    text,
  p_platform text,
  p_provider text
)
  RETURNS public.push_devices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  result public.push_devices;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception '지원하지 않는 플랫폼이에요.';
  end if;
  if p_provider not in ('fcm', 'apns', 'webpush') then
    raise exception '지원하지 않는 푸시 제공자예요.';
  end if;

  insert into public.push_devices (user_id, token, platform, provider, enabled, last_seen_at)
  values (auth.uid(), p_token, p_platform, p_provider, true, now())
  on conflict (provider, token) do update
  set user_id = auth.uid(),
      platform = excluded.platform,
      enabled = true,
      last_seen_at = now()
  returning * into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_academy_member (
  p_academy_id uuid,
  p_user_id    uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select public.remove_academy_member(
    p_academy_id,
    p_user_id,
    (now() at time zone 'Asia/Seoul')::date
  );
$function$;

CREATE OR REPLACE FUNCTION public.remove_academy_member (
  p_academy_id     uuid,
  p_user_id        uuid,
  p_last_work_date date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_is_owner boolean := false;
  v_membership public.academy_members%rowtype;
  v_profile public.academy_staff_profiles%rowtype;
  v_class_count integer := 0;
  v_work_rule_count integer := 0;
  v_payroll jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if p_last_work_date is null or p_last_work_date > v_today then
    raise exception '마지막 근무일을 오늘 또는 이전 날짜로 선택해주세요.' using errcode = '22023';
  end if;
  v_is_owner := public.is_owner_of_academy(p_academy_id);
  if not v_is_owner and not public.has_academy_permission(p_academy_id, 'canRemoveStaff') then
    raise exception '직원을 내보낼 권한이 없어요.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception '본인은 직원 내보내기로 처리할 수 없어요.' using errcode = '42501';
  end if;

  select * into v_membership
  from public.academy_members
  where academy_id = p_academy_id and user_id = p_user_id and status = 'active'
  for update;
  if not found then raise exception '활성 상태인 직원을 찾을 수 없어요.'; end if;
  if v_membership.role = 'owner' or exists (
    select 1 from public.academies a where a.id = p_academy_id and a.owner_id = p_user_id
  ) then
    raise exception '원장은 내보낼 수 없어요. 먼저 소유권 이전이 필요해요.';
  end if;
  if not v_is_owner and (
    public.academy_member_has_permission(p_academy_id, p_user_id, 'canManageStaffPermissions')
    or public.academy_member_has_permission(p_academy_id, p_user_id, 'canRemoveStaff')
  ) then
    raise exception '접근 관리 권한이 있는 직원은 원장만 내보낼 수 있어요.' using errcode = '42501';
  end if;

  select * into v_profile from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id;
  if found and v_profile.employment_started_on is not null
      and p_last_work_date < v_profile.employment_started_on then
    raise exception '마지막 근무일이 입사일보다 빠를 수 없어요.' using errcode = '22023';
  end if;

  select count(*) into v_class_count from public.class_groups g
  where g.academy_id = p_academy_id and g.teacher_user_id = p_user_id
    and coalesce(g.status, 'active') <> 'inactive';
  select count(*) into v_work_rule_count from public.academy_staff_work_rules r
  where r.academy_id = p_academy_id and r.staff_user_id = p_user_id and r.is_active = true;

  v_payroll := public.prepare_staff_exit_payroll(p_academy_id, p_user_id, p_last_work_date);

  update public.academy_members set status = 'inactive', updated_at = now()
  where id = v_membership.id;
  update public.academy_staff_profiles
  set status = 'inactive', employment_ended_on = p_last_work_date,
      exit_reason = 'removed', updated_at = now()
  where academy_id = p_academy_id and user_id = p_user_id;
  update public.academy_staff_work_rules set is_active = false, updated_at = now()
  where academy_id = p_academy_id and staff_user_id = p_user_id and is_active = true;

  return jsonb_build_object(
    'academy_id', p_academy_id, 'user_id', p_user_id,
    'membership_status', 'inactive', 'last_work_date', p_last_work_date,
    'assigned_class_count', v_class_count, 'stopped_work_rule_count', v_work_rule_count,
    'exit_payroll', v_payroll
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_academy_calendar_event (
  p_academy_id uuid,
  p_event      jsonb,
  p_event_id   uuid  DEFAULT NULL::uuid
)
  RETURNS public.academy_calendar_events
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_existing public.academy_calendar_events%rowtype;
  v_saved public.academy_calendar_events%rowtype;
  v_id uuid := coalesce(p_event_id, gen_random_uuid());
  v_category text := coalesce(nullif(btrim(p_event ->> 'category'), ''), 'other');
  v_title text := nullif(btrim(p_event ->> 'title'), '');
  v_start_date date := nullif(p_event ->> 'start_date', '')::date;
  v_end_date date := coalesce(nullif(p_event ->> 'end_date', '')::date, nullif(p_event ->> 'start_date', '')::date);
  v_all_day boolean := coalesce((p_event ->> 'all_day')::boolean, true);
  v_start_time time := case when coalesce((p_event ->> 'all_day')::boolean, true) then null else nullif(p_event ->> 'start_time', '')::time end;
  v_end_time time := case when coalesce((p_event ->> 'all_day')::boolean, true) then null else nullif(p_event ->> 'end_time', '')::time end;
  v_target_type text := coalesce(nullif(p_event ->> 'target_type', ''), 'all');
  v_school_names jsonb := '[]'::jsonb;
  v_grades jsonb := '[]'::jsonb;
  v_class_group_ids jsonb := '[]'::jsonb;
  v_student_ids jsonb := '[]'::jsonb;
  v_affects_classes boolean := coalesce((p_event ->> 'affects_classes')::boolean, false);
  v_impact_ids jsonb := '[]'::jsonb;
  v_old_from date;
  v_old_to date;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  if p_academy_id is null or not public.is_member_of_academy(p_academy_id) then
    raise exception '학원 일정을 등록할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_title is null then raise exception '일정 제목을 입력해주세요.'; end if;
  if v_start_date is null or v_end_date is null or v_end_date < v_start_date then
    raise exception '일정 날짜를 확인해주세요.';
  end if;
  if (v_end_date - v_start_date) > 366 then raise exception '일정은 최대 1년까지 등록할 수 있어요.'; end if;
  if v_affects_classes and (v_end_date - v_start_date) > 93 then
    raise exception '수업을 쉬는 일정은 한 번에 최대 94일까지 설정할 수 있어요.';
  end if;
  if v_affects_classes and not public.has_academy_permission(p_academy_id, 'canManageClasses') then
    raise exception '수업을 휴강 처리할 권한이 없어요.' using errcode = '42501';
  end if;
  if not v_all_day and (v_start_time is null or v_end_time is null or v_end_time <= v_start_time) then
    raise exception '종료 시간은 시작 시간보다 늦어야 해요.';
  end if;

  -- 배열의 순서나 중복 선택과 무관하게 같은 대상을 같은 값으로 저장한다.
  if v_target_type = 'school' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_school_names
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'school_names') = 'array'
          then p_event -> 'school_names' else '[]'::jsonb end
      )
    ) normalized;
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_grades
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'grades') = 'array'
          then p_event -> 'grades' else '[]'::jsonb end
      )
    ) normalized;
  elsif v_target_type = 'class' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_class_group_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'class_group_ids') = 'array'
          then p_event -> 'class_group_ids' else '[]'::jsonb end
      )
    ) normalized;
  elsif v_target_type = 'student' then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_student_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'student_ids') = 'array'
          then p_event -> 'student_ids' else '[]'::jsonb end
      )
    ) normalized;
  end if;

  if v_affects_classes then
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) into v_impact_ids
    from (
      select distinct value
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_event -> 'impact_class_group_ids') = 'array'
          then p_event -> 'impact_class_group_ids' else '[]'::jsonb end
      )
    ) normalized;
  end if;

  -- 같은 학원에서 두 기기가 동시에 저장해도 검사와 insert 사이에 끼어들지 못한다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  if exists (
    select 1
    from public.academy_calendar_events duplicate_event
    where duplicate_event.academy_id = p_academy_id
      and duplicate_event.deleted_at is null
      and duplicate_event.id <> v_id
      and duplicate_event.category = v_category
      and lower(regexp_replace(btrim(duplicate_event.title), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(v_title, '[[:space:]]+', ' ', 'g'))
      and duplicate_event.start_date = v_start_date
      and duplicate_event.end_date = v_end_date
      and duplicate_event.all_day = v_all_day
      and duplicate_event.start_time is not distinct from v_start_time
      and duplicate_event.end_time is not distinct from v_end_time
      and duplicate_event.target_type = v_target_type
      and (
        v_target_type = 'all'
        or (
          v_target_type = 'school'
          and duplicate_event.school_names @> v_school_names
          and v_school_names @> duplicate_event.school_names
          and duplicate_event.grades @> v_grades
          and v_grades @> duplicate_event.grades
        )
        or (
          v_target_type = 'class'
          and duplicate_event.class_group_ids @> v_class_group_ids
          and v_class_group_ids @> duplicate_event.class_group_ids
        )
        or (
          v_target_type = 'student'
          and duplicate_event.student_ids @> v_student_ids
          and v_student_ids @> duplicate_event.student_ids
        )
      )
  ) then
    raise exception '이미 같은 일정이 등록되어 있어요. 기존 일정을 확인해주세요.';
  end if;

  if p_event_id is not null then
    select * into v_existing
    from public.academy_calendar_events
    where id = p_event_id and academy_id = p_academy_id and deleted_at is null
    for update;
    if not found then raise exception '일정을 찾을 수 없어요.'; end if;
    if v_existing.created_by is distinct from auth.uid()
       and not public.has_academy_permission(p_academy_id, 'canManageClasses') then
      raise exception '다른 직원의 일정을 수정할 권한이 없어요.' using errcode = '42501';
    end if;
    v_old_from := v_existing.start_date;
    v_old_to := v_existing.end_date;

    -- 이 일정이 취소했던 실제 회차를 먼저 복구한 뒤 예외를 다시 만든다.
    update public.class_sessions cs
       set status = case
             when exists (
               select 1 from public.class_session_exceptions other_exception
               where other_exception.calendar_event_id is distinct from p_event_id
                 and other_exception.class_group_id = cs.class_group_id
                 and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
                 and other_exception.type = 'cancel'
             ) then 'canceled'
             when cs.status = 'canceled' then 'scheduled'
             else cs.status
           end,
           canceled_by_schedule_exception = exists (
             select 1 from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
           ),
           session_exception_id = (
             select other_exception.id
             from public.class_session_exceptions other_exception
             where other_exception.calendar_event_id is distinct from p_event_id
               and other_exception.class_group_id = cs.class_group_id
               and other_exception.session_date = coalesce(cs.occurrence_date, cs.date)
               and other_exception.type = 'cancel'
             order by other_exception.created_at desc
             limit 1
           ),
           updated_at = now()
      from public.class_session_exceptions e
     where e.calendar_event_id = p_event_id
       and cs.session_exception_id = e.id
       and cs.canceled_by_schedule_exception = true
       and cs.status <> 'completed';
    delete from public.class_session_exceptions where calendar_event_id = p_event_id;
  end if;

  insert into public.academy_calendar_events as event (
    id, academy_id, category, title, start_date, end_date, all_day, start_time, end_time,
    target_type, school_names, grades, class_group_ids, student_ids, memo, visibility,
    affects_classes, impact_class_group_ids, source, external_id, created_by, updated_by
  ) values (
    v_id, p_academy_id, v_category, v_title, v_start_date, v_end_date, v_all_day,
    v_start_time, v_end_time, v_target_type,
    v_school_names, v_grades, v_class_group_ids, v_student_ids,
    nullif(btrim(p_event ->> 'memo'), ''),
    coalesce(nullif(p_event ->> 'visibility', ''), 'internal'),
    v_affects_classes, v_impact_ids,
    coalesce(nullif(p_event ->> 'source', ''), 'manual'),
    nullif(p_event ->> 'external_id', ''),
    coalesce(v_existing.created_by, auth.uid()), auth.uid()
  )
  on conflict (id) do update set
    category = excluded.category,
    title = excluded.title,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    all_day = excluded.all_day,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    target_type = excluded.target_type,
    school_names = excluded.school_names,
    grades = excluded.grades,
    class_group_ids = excluded.class_group_ids,
    student_ids = excluded.student_ids,
    memo = excluded.memo,
    visibility = excluded.visibility,
    affects_classes = excluded.affects_classes,
    impact_class_group_ids = excluded.impact_class_group_ids,
    source = excluded.source,
    external_id = excluded.external_id,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_saved;

  if v_affects_classes then
    insert into public.class_session_exceptions (
      academy_id, class_group_id, session_date, type, reason, memo, calendar_event_id
    )
    select distinct
      p_academy_id,
      rule.class_group_id,
      generated.day::date,
      'cancel',
      '학원 일정: ' || v_title,
      nullif(btrim(p_event ->> 'memo'), ''),
      v_id
    from public.class_schedule_rules rule
    join public.class_groups class_group
      on class_group.id = rule.class_group_id and class_group.academy_id = p_academy_id
    cross join lateral generate_series(
      v_start_date::timestamp,
      v_end_date::timestamp,
      interval '1 day'
    ) generated(day)
    where rule.academy_id = p_academy_id
      and rule.is_active = true
      and class_group.status = 'active'
      and extract(dow from generated.day)::smallint = rule.day_of_week
      and (rule.effective_start_date is null or generated.day::date >= rule.effective_start_date)
      and (rule.effective_end_date is null or generated.day::date <= rule.effective_end_date)
      and (class_group.start_date is null or generated.day::date >= class_group.start_date)
      and (class_group.end_date is null or generated.day::date <= class_group.end_date)
      and (
        jsonb_array_length(v_impact_ids) = 0
        or v_impact_ids ? rule.class_group_id::text
      )
    on conflict (calendar_event_id, class_group_id, session_date)
      where calendar_event_id is not null and type = 'cancel'
    do nothing;

    -- 보강·특강처럼 정규 규칙 밖에서 이미 만들어진 회차도 같은 기간이면 빠짐없이
    -- 휴강한다. 반/날짜당 예외 하나가 그날 여러 회차를 함께 보호한다.
    insert into public.class_session_exceptions (
      academy_id, class_group_id, session_date, type, reason, memo, calendar_event_id
    )
    select distinct
      p_academy_id,
      cs.class_group_id,
      coalesce(cs.occurrence_date, cs.date),
      'cancel',
      '학원 일정: ' || v_title,
      nullif(btrim(p_event ->> 'memo'), ''),
      v_id
    from public.class_sessions cs
    where cs.academy_id = p_academy_id
      and coalesce(cs.occurrence_date, cs.date) between v_start_date and v_end_date
      and cs.status <> 'completed'
      and (
        jsonb_array_length(v_impact_ids) = 0
        or v_impact_ids ? cs.class_group_id::text
      )
    on conflict (calendar_event_id, class_group_id, session_date)
      where calendar_event_id is not null and type = 'cancel'
    do nothing;

    -- 이미 만들어진 정규/추가 회차도 같은 일정 예외에 연결해 즉시 휴강 처리한다.
    update public.class_sessions cs
       set status = case when cs.status = 'completed' then cs.status else 'canceled' end,
           canceled_by_schedule_exception = case when cs.status = 'completed' then cs.canceled_by_schedule_exception else true end,
           session_exception_id = case when cs.status = 'completed' then cs.session_exception_id else e.id end,
           updated_at = now()
      from public.class_session_exceptions e
     where e.calendar_event_id = v_id
       and e.class_group_id = cs.class_group_id
       and e.session_date = coalesce(cs.occurrence_date, cs.date)
       and cs.academy_id = p_academy_id;
  end if;

  if v_old_from is not null
     and public.has_academy_permission(p_academy_id, 'canManageClasses') then
    perform 1 from public.ensure_class_sessions_for_range(p_academy_id, v_old_from, v_old_to, null);
  end if;
  if v_affects_classes then
    perform 1 from public.ensure_class_sessions_for_range(p_academy_id, v_start_date, v_end_date, null);
  end if;

  return v_saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_academy_clinic_event (
  p_event_id       uuid,
  p_academy_id     uuid,
  p_name           text,
  p_event_date     date,
  p_start_time     time without time zone,
  p_end_time       time without time zone,
  p_subject        text,
  p_room           text,
  p_class_group_id uuid,
  p_memo           text,
  p_participants   jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_event_id uuid := coalesce(p_event_id, gen_random_uuid());
begin
  if not public.is_member_of_academy(p_academy_id)
     or not public.has_academy_permission(p_academy_id, 'canEditClinicRecords') then
    raise exception '클리닉 일정을 관리할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception '클리닉 일정 이름이 필요합니다.' using errcode = '22023';
  end if;
  if p_event_date is null then
    raise exception '클리닉 날짜가 필요합니다.' using errcode = '22023';
  end if;
  if p_start_time is not null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception '종료 시간은 시작 시간보다 늦어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_participants, '[]'::jsonb)) <> 'array' then
    raise exception '참여 학생 정보가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_class_group_id is not null and not exists (
    select 1 from public.class_groups group_row
    where group_row.id = p_class_group_id
      and group_row.academy_id = p_academy_id
  ) then
    raise exception '다른 학원의 반은 연결할 수 없습니다.' using errcode = '23503';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb)) participant
    left join public.students student
      on student.id = nullif(participant->>'student_id', '')::uuid
    where student.id is null
       or student.academy_id <> p_academy_id
       or student.mode <> 'academy'
  ) then
    raise exception '다른 학원의 학생은 추가할 수 없습니다.' using errcode = '23503';
  end if;

  insert into public.clinic_events (
    id, academy_id, name, event_date, start_time, end_time,
    subject, room, class_group_id, memo, created_by
  ) values (
    v_event_id, p_academy_id, btrim(p_name), p_event_date, p_start_time, p_end_time,
    nullif(btrim(coalesce(p_subject, '')), ''),
    nullif(btrim(coalesce(p_room, '')), ''),
    p_class_group_id,
    nullif(btrim(coalesce(p_memo, '')), ''),
    auth.uid()
  )
  on conflict (id) do update set
    name = excluded.name,
    event_date = excluded.event_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    subject = excluded.subject,
    room = excluded.room,
    class_group_id = excluded.class_group_id,
    memo = excluded.memo
  where clinic_events.academy_id = p_academy_id;

  if not exists (
    select 1 from public.clinic_events
    where id = v_event_id and academy_id = p_academy_id
  ) then
    raise exception '클리닉 일정을 찾지 못했습니다.' using errcode = 'P0002';
  end if;

  delete from public.clinic_event_students where clinic_event_id = v_event_id;
  insert into public.clinic_event_students (
    clinic_event_id, student_id, subject_override, sort_order
  )
  select distinct on (student_id)
    v_event_id,
    student_id,
    subject_override,
    sort_order
  from (
    select
      nullif(participant->>'student_id', '')::uuid as student_id,
      nullif(btrim(coalesce(participant->>'subject', '')), '') as subject_override,
      (ordinality - 1)::integer as sort_order
    from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
      with ordinality as rows(participant, ordinality)
  ) normalized
  where student_id is not null
  order by student_id, sort_order;

  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_attendance_records_guarded (
  p_academy_id uuid,
  p_records    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_record jsonb;
  v_saved public.attendance_records%rowtype;
  v_saved_rows jsonb := '[]'::jsonb;
  v_session_id uuid;
  v_student_id uuid;
  v_group_id uuid;
  v_expected_updated_at timestamptz;
  v_status text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '출석을 기록할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception '출석 기록 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  -- 같은 학원의 출석 저장끼리 직렬화해 새 행 INSERT 경쟁도 예측 가능하게 만든다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text || ':attendance', 0));

  for v_record in select value from jsonb_array_elements(p_records)
  loop
    begin
      v_session_id := (v_record->>'class_session_id')::uuid;
      v_student_id := (v_record->>'student_id')::uuid;
      v_group_id := nullif(v_record->>'class_group_id', '')::uuid;
      v_expected_updated_at := nullif(v_record->>'expected_updated_at', '')::timestamptz;
    exception when others then
      raise exception '출석 대상 정보가 올바르지 않아요.' using errcode = '22023';
    end;

    v_status := coalesce(nullif(v_record->>'status', ''), 'absent');
    if v_status not in ('present', 'late', 'absent', 'makeup', 'excused') then
      raise exception '지원하지 않는 출석 상태예요.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.class_sessions cs
       where cs.id = v_session_id and cs.academy_id = p_academy_id and cs.mode = 'academy'
    ) or not exists (
      select 1 from public.students s
       where s.id = v_student_id and s.academy_id = p_academy_id and s.mode = 'academy'
    ) then
      raise exception '다른 학원의 수업 또는 학생은 기록할 수 없어요.' using errcode = '42501';
    end if;

    if v_expected_updated_at is null then
      begin
        insert into public.attendance_records (
          academy_id, user_id, mode, class_group_id, class_session_id, student_id,
          date, status, memo, source, checked_at,
          confirmation_state, confirmed_at, confirmed_by
        ) values (
          p_academy_id, auth.uid(), 'academy', v_group_id, v_session_id, v_student_id,
          nullif(v_record->>'date', '')::date,
          v_status,
          nullif(v_record->>'memo', ''),
          nullif(v_record->>'source', ''),
          nullif(v_record->>'checked_at', '')::timestamptz,
          coalesce(nullif(v_record->>'confirmation_state', ''), 'teacher_confirmed'),
          nullif(v_record->>'confirmed_at', '')::timestamptz,
          nullif(v_record->>'confirmed_by', '')::uuid
        )
        returning * into v_saved;
      exception when unique_violation then
        raise exception '다른 기기에서 출석을 먼저 저장했어요.' using errcode = '40001';
      end;
    else
      update public.attendance_records
         set user_id = auth.uid(),
             class_group_id = v_group_id,
             date = nullif(v_record->>'date', '')::date,
             status = v_status,
             memo = nullif(v_record->>'memo', ''),
             source = nullif(v_record->>'source', ''),
             checked_at = nullif(v_record->>'checked_at', '')::timestamptz,
             confirmation_state = coalesce(
               nullif(v_record->>'confirmation_state', ''), 'teacher_confirmed'
             ),
             confirmed_at = nullif(v_record->>'confirmed_at', '')::timestamptz,
             confirmed_by = nullif(v_record->>'confirmed_by', '')::uuid
       where academy_id = p_academy_id
         and class_session_id = v_session_id
         and student_id = v_student_id
         and updated_at = v_expected_updated_at
      returning * into v_saved;

      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception '다른 기기에서 출석을 먼저 수정했어요.' using errcode = '40001';
      end if;
    end if;

    v_saved_rows := v_saved_rows || jsonb_build_array(to_jsonb(v_saved));
  end loop;

  return v_saved_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_profile_by_email (
  p_email text
)
  RETURNS TABLE (
    id           uuid,
    email        text,
    display_name text,
    phone        text,
    account_type text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  cleaned text;
begin
  -- 빈 값 / 너무 짧은 입력은 즉시 빈 결과.
  cleaned := lower(trim(coalesce(p_email, '')));
  if cleaned = '' or length(cleaned) < 3 then
    return;
  end if;

  return query
    select
      p.id,
      p.email,
      p.display_name,
      p.phone,
      p.account_type
    from public.profiles p
    where lower(p.email) = cleaned
    limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_profile_by_email (
  p_academy_id uuid,
  p_email      text
)
  RETURNS TABLE (
    id           uuid,
    email        text,
    display_name text,
    phone        text,
    account_type text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_cleaned text := lower(btrim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageStaff')
  ) then
    raise exception '직원을 검색할 권한이 없어요.' using errcode = '42501';
  end if;
  if v_cleaned = '' or length(v_cleaned) < 3 then return; end if;
  return query
  select p.id, p.email, p.display_name, p.phone, p.account_type
  from public.profiles p where lower(p.email) = v_cleaned limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_student_contact_permissions (
  p_academy_id uuid,
  p_user_id    uuid,
  p_can_view   boolean DEFAULT NULL::boolean,
  p_can_manage boolean DEFAULT NULL::boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_permissions jsonb;
begin
  if auth.uid() is null or not public.is_owner_of_academy(p_academy_id) then
    raise exception '학생 연락처 권한은 원장만 변경할 수 있어요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.academy_members m
    where m.academy_id = p_academy_id and m.user_id = p_user_id
      and m.status = 'active' and m.role <> 'owner'
  ) then
    raise exception '활성 상태인 직원을 찾을 수 없어요.';
  end if;

  select coalesce(permissions, '{}'::jsonb) into v_permissions
  from public.academy_staff_profiles
  where academy_id = p_academy_id and user_id = p_user_id
  for update;
  if not found then raise exception '직원 프로필을 찾을 수 없어요.'; end if;

  if p_can_view is null then
    v_permissions := v_permissions - 'canViewStudentContacts';
  else
    v_permissions := v_permissions || jsonb_build_object('canViewStudentContacts', p_can_view);
  end if;
  if p_can_manage is null then
    v_permissions := v_permissions - 'canManageStudentContacts';
  else
    v_permissions := v_permissions || jsonb_build_object('canManageStudentContacts', p_can_manage);
  end if;
  if p_can_manage is true then
    v_permissions := v_permissions || jsonb_build_object('canViewStudentContacts', true);
  end if;
  if p_can_view is false then
    v_permissions := v_permissions || jsonb_build_object('canManageStudentContacts', false);
  end if;

  perform set_config('seenit.allow_student_contact_permission_write', 'on', true);
  update public.academy_staff_profiles
     set permissions = v_permissions, updated_at = now()
   where academy_id = p_academy_id and user_id = p_user_id;
  perform set_config('seenit.allow_student_contact_permission_write', 'off', true);
  return v_permissions;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_completed_session_time_from_exception()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if new.type <> 'reschedule'
     or new.session_date <> (now() at time zone 'Asia/Seoul')::date
     or new.start_time is null
     or new.end_time is null then
    return new;
  end if;

  update public.class_sessions cs
     set start_time = new.start_time,
         end_time = new.end_time,
         session_exception_id = new.id,
         updated_at = now()
   where cs.academy_id = new.academy_id
     and cs.class_group_id = new.class_group_id
     and coalesce(cs.occurrence_date, cs.date) = new.session_date
     and cs.status = 'completed'
     and (
       cs.schedule_rule_id is not null
       or cs.session_exception_id = new.id
     );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_existing_checkins_to_class_session()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_session_date date;
begin
  if new.academy_id is null
     or new.id is null
     or new.status in ('canceled', 'cancelled') then
    return new;
  end if;

  v_session_date := coalesce(new.occurrence_date, new.date);
  if v_session_date is null then
    return new;
  end if;

  insert into public.attendance_records (
    academy_id,
    user_id,
    mode,
    class_group_id,
    class_session_id,
    student_id,
    date,
    status,
    source,
    checked_at,
    confirmation_state,
    confirmed_at,
    confirmed_by
  )
  select distinct on (event.student_id)
    new.academy_id,
    coalesce(event.created_by, new.user_id),
    'academy',
    new.class_group_id,
    new.id,
    event.student_id,
    v_session_date,
    'present',
    case when event.source = 'qr' then 'qr' else 'teacher_manual' end,
    event.event_time,
    'auto_inferred',
    null,
    null
  from public.student_check_events event
  where event.academy_id = new.academy_id
    and event.event_type = 'check_in'
    and (event.event_time at time zone 'Asia/Seoul')::date = v_session_date
    and coalesce(new.student_ids, '[]'::jsonb)
      @> jsonb_build_array(event.student_id::text)
  order by event.student_id, event.event_time
  on conflict (class_session_id, student_id)
  do update
     set status = 'present',
         source = excluded.source,
         checked_at = case
           when attendance_records.checked_at is null then excluded.checked_at
           else least(attendance_records.checked_at, excluded.checked_at)
         end,
         confirmation_state = 'auto_inferred',
         confirmed_at = null,
         confirmed_by = null,
         updated_at = now()
   where attendance_records.confirmation_state = 'auto_inferred';

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_member_roles_from_job_title_policies()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  update public.academy_members m
  set role = case
      when new.job_title_permissions -> asp.job_title ->> 'role' = 'manager'
        then 'manager'
      else 'teacher'
    end,
    updated_at = now()
  from public.academy_staff_profiles asp
  where asp.academy_id = new.id
    and m.academy_id = new.id
    and m.user_id = asp.user_id
    and m.role in ('teacher', 'assistant', 'manager')
    and m.status = 'active'
    and new.job_title_permissions ? asp.job_title
    and m.role is distinct from case
      when new.job_title_permissions -> asp.job_title ->> 'role' = 'manager'
        then 'manager'
      else 'teacher'
    end;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles
       set email = lower(new.email),
           updated_at = now()
     where id = new.id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_same_day_class_session_from_new_rule()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_group public.class_groups%rowtype;
begin
  if new.is_active is not true then
    return new;
  end if;

  if new.effective_start_date is not null
     and new.effective_start_date > v_today + 1 then
    return new;
  end if;

  select *
    into v_group
    from public.class_groups
   where id = new.class_group_id
     and academy_id = new.academy_id;

  if not found then
    return new;
  end if;

  update public.class_sessions cs
     set schedule_rule_id = new.id,
         occurrence_date = coalesce(cs.occurrence_date, cs.date),
         start_time = new.start_time,
         end_time = new.end_time,
         room = coalesce(new.room, v_group.room),
         teacher_id = v_group.teacher_id,
         teacher_type = v_group.teacher_type,
         teacher_user_id = coalesce(new.teacher_user_id, v_group.teacher_user_id),
         assistant_ids = coalesce(
           new.assistant_ids,
           v_group.assistant_ids,
           '[]'::jsonb
         ),
         student_ids = coalesce(v_group.student_ids, '[]'::jsonb),
         record_schema = coalesce(cs.record_schema, v_group.record_schema),
         activity_type = coalesce(cs.activity_type, v_group.activity_type),
         activity_name = coalesce(cs.activity_name, v_group.activity_name),
         updated_at = now()
   where cs.academy_id = new.academy_id
     and cs.class_group_id = new.class_group_id
     and coalesce(cs.occurrence_date, cs.date) = v_today
     and extract(dow from coalesce(cs.occurrence_date, cs.date))::smallint
       = new.day_of_week
     and cs.session_exception_id is null
     and cs.status in ('scheduled', 'rescheduled', 'completed')
     and cs.schedule_rule_id is distinct from new.id;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_staff_profile_from_academy_member()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if new.role in ('teacher', 'manager') and new.status = 'active' then
    insert into public.academy_staff_profiles as asp (
      academy_id, user_id, member_id, role, job_title, subjects, wage_type,
      hourly_wage, monthly_salary, status
    )
    values (
      new.academy_id,
      new.user_id,
      new.id,
      new.role,
      case new.role when 'manager' then '운영 매니저' else '선생님' end,
      '[]'::jsonb,
      'hourly',
      0,
      0,
      'active'
    )
    on conflict (academy_id, user_id) do update
      set member_id = excluded.member_id,
          role = excluded.role,
          job_title = coalesce(asp.job_title, excluded.job_title),
          status = 'active',
          updated_at = now();
  elsif new.role in ('teacher', 'manager') and new.status = 'inactive' then
    update public.academy_staff_profiles
    set status = 'inactive', updated_at = now()
    where academy_id = new.academy_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_student_checkin_to_class_attendance()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_event_date date;
begin
  if new.event_type <> 'check_in' then
    return new;
  end if;

  v_event_date := (new.event_time at time zone 'Asia/Seoul')::date;

  insert into public.attendance_records (
    academy_id,
    user_id,
    mode,
    class_group_id,
    class_session_id,
    student_id,
    date,
    status,
    source,
    checked_at,
    confirmation_state,
    confirmed_at,
    confirmed_by
  )
  select
    cs.academy_id,
    coalesce(new.created_by, cs.user_id),
    'academy',
    cs.class_group_id,
    cs.id,
    new.student_id,
    coalesce(cs.occurrence_date, cs.date),
    'present',
    case when new.source = 'qr' then 'qr' else 'teacher_manual' end,
    new.event_time,
    'auto_inferred',
    null,
    null
  from public.class_sessions cs
  where cs.academy_id = new.academy_id
    and coalesce(cs.occurrence_date, cs.date) = v_event_date
    and cs.status not in ('canceled', 'cancelled')
    and coalesce(cs.student_ids, '[]'::jsonb) @> jsonb_build_array(new.student_id::text)
  on conflict (class_session_id, student_id)
  do update
     set status = 'present',
         source = excluded.source,
         checked_at = case
           when attendance_records.checked_at is null then excluded.checked_at
           else least(attendance_records.checked_at, excluded.checked_at)
         end,
         confirmation_state = 'auto_inferred',
         confirmed_at = null,
         confirmed_by = null,
         updated_at = now()
   where attendance_records.confirmation_state = 'auto_inferred';

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_student_check_event (
  p_academy_id uuid,
  p_student_id uuid,
  p_source     text DEFAULT 'qr'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_latest public.student_check_events%rowtype;
  v_created public.student_check_events%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_today_start timestamptz;
  v_cutoff timestamptz;
  v_next_type text;
begin
  if p_academy_id is null or p_student_id is null then
    raise exception 'academy_id와 student_id가 필요합니다.';
  end if;

  if p_source not in ('qr', 'teacher_manual') then
    raise exception '지원하지 않는 등하원 기록 방식입니다.';
  end if;

  if not (
    public.is_member_of_academy(p_academy_id)
    and public.has_academy_permission(p_academy_id, 'canEditAttendance')
  ) then
    raise exception '등하원을 기록할 권한이 없습니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.students s
     where s.id = p_student_id
       and s.academy_id = p_academy_id
       and s.mode = 'academy'
       and (
         s.status = 'active'
         or (
           s.status = 'scheduled'
           and (s.enrollment_date is null or s.enrollment_date <= v_today)
         )
       )
  ) then
    raise exception '현재 등하원 처리할 수 있는 학생을 찾지 못했어요.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_academy_id::text || ':' || p_student_id::text, 0)
  );

  v_today_start := v_today::timestamp at time zone 'Asia/Seoul';
  v_cutoff := (v_today + time '22:00') at time zone 'Asia/Seoul';

  select sce.*
    into v_latest
    from public.student_check_events sce
   where sce.academy_id = p_academy_id
     and sce.student_id = p_student_id
     and sce.event_time >= v_today_start
   order by sce.event_time desc, sce.created_at desc
   limit 1;

  if v_latest.id is not null
     and v_latest.event_time >= now() - interval '8 seconds' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true
    );
  end if;

  if now() >= v_cutoff
     and v_latest.event_type = 'check_out'
     and v_latest.source = 'system_auto' then
    return jsonb_build_object(
      'event', to_jsonb(v_latest),
      'duplicate', true,
      'auto_checkout', true
    );
  end if;

  v_next_type := case
    when v_latest.event_type = 'check_in' then 'check_out'
    else 'check_in'
  end;

  insert into public.student_check_events (
    academy_id,
    student_id,
    event_type,
    source,
    created_by
  )
  values (
    p_academy_id,
    p_student_id,
    v_next_type,
    p_source,
    auth.uid()
  )
  returning * into v_created;

  return jsonb_build_object(
    'event', to_jsonb(v_created),
    'duplicate', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_chat_thread_on_message()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.academy_chat_threads
  set updated_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_class_group_with_rules (
  p_academy_id     uuid,
  p_class_group_id uuid,
  p_group_patch    jsonb,
  p_rules          jsonb,
  p_effective_from date  DEFAULT ((now() AT TIME ZONE 'Asia/Seoul'::text))::date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_group public.class_groups%rowtype;
  v_rule jsonb;
  v_old_rule_ids uuid[] := '{}'::uuid[];
  v_new_rule_ids uuid[] := '{}'::uuid[];
  v_new_rule_id uuid;
  v_rule_count integer;
  v_distinct_day_count integer;
  v_day_of_week smallint;
  v_start_time text;
  v_end_time text;
  v_effective_from date;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  if p_academy_id is null or p_class_group_id is null then
    raise exception '학원과 반 정보가 필요해요.' using errcode = '22023';
  end if;

  if not (
    public.is_owner_of_academy(p_academy_id)
    or public.has_academy_permission(p_academy_id, 'canManageClasses')
  ) then
    raise exception '반을 수정할 권한이 없어요.' using errcode = '42501';
  end if;

  if p_group_patch is null or jsonb_typeof(p_group_patch) <> 'object' then
    raise exception '반 수정 정보 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception '수업 규칙 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if p_effective_from is null then
    raise exception '규칙 적용 시작일이 필요해요.' using errcode = '22023';
  end if;

  -- SQL 046의 회차 실체화와 같은 잠금을 사용해, 규칙 교체 도중 이전 규칙으로
  -- 미래 회차가 뒤늦게 생성되는 경쟁 상태를 막는다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  select *
    into v_group
    from public.class_groups
   where id = p_class_group_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;

  if not found then
    raise exception '수정할 반을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  -- 과거 날짜로 규칙을 되돌리지 않는다. 또한 오늘 회차에 이미 수업·출석·클리닉
  -- 기록이 있다면 그 회차는 역사로 보존하고 새 규칙은 다음 날부터 적용한다.
  v_effective_from := greatest(
    p_effective_from,
    (now() at time zone 'Asia/Seoul')::date
  );

  if exists (
    select 1
      from public.class_sessions cs
     where cs.academy_id = p_academy_id
       and cs.class_group_id = p_class_group_id
       and coalesce(cs.occurrence_date, cs.date) = v_effective_from
       and (
         cs.status = 'completed'
         or exists (
           select 1 from public.lesson_records lr where lr.class_session_id = cs.id
         )
         or exists (
           select 1 from public.attendance_records ar where ar.class_session_id = cs.id
         )
         or exists (
           select 1 from public.clinic_records cr where cr.class_session_id = cs.id
         )
       )
  ) then
    v_effective_from := v_effective_from + 1;
  end if;

  if not (p_group_patch ? 'name')
     or nullif(btrim(p_group_patch->>'name'), '') is null then
    raise exception '반 이름이 필요해요.' using errcode = '22023';
  end if;

  select count(*), count(distinct (item->>'day_of_week'))
    into v_rule_count, v_distinct_day_count
    from jsonb_array_elements(p_rules) item;

  if v_rule_count = 0 then
    raise exception '수업 요일을 최소 1개 선택해주세요.' using errcode = '22023';
  end if;

  if v_rule_count <> v_distinct_day_count then
    raise exception '같은 요일의 수업 규칙이 중복되어 있어요.' using errcode = '22023';
  end if;

  -- 전체 규칙을 먼저 검증한다. 이 단계가 끝나기 전에는 어떤 데이터도 바꾸지 않는다.
  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    begin
      v_day_of_week := (v_rule->>'day_of_week')::smallint;
    exception when others then
      raise exception '수업 요일 값이 올바르지 않아요.' using errcode = '22023';
    end;
    v_start_time := nullif(btrim(v_rule->>'start_time'), '');
    v_end_time := nullif(btrim(v_rule->>'end_time'), '');

    if v_day_of_week not between 0 and 6 then
      raise exception '수업 요일 값은 0~6이어야 해요.' using errcode = '22023';
    end if;
    if v_start_time is null or v_end_time is null
       or v_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_start_time >= v_end_time then
      raise exception '수업 시작·종료 시간을 확인해주세요.' using errcode = '22023';
    end if;
  end loop;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_old_rule_ids
    from public.class_schedule_rules
   where academy_id = p_academy_id
     and class_group_id = p_class_group_id
     and is_active = true;

  update public.class_groups
     set name = p_group_patch->>'name',
         subject = case when p_group_patch ? 'subject'
           then nullif(p_group_patch->>'subject', '') else subject end,
         level = case when p_group_patch ? 'level'
           then nullif(p_group_patch->>'level', '') else level end,
         activity_type = case when p_group_patch ? 'activity_type'
           then coalesce(nullif(p_group_patch->>'activity_type', ''), activity_type)
           else activity_type end,
         activity_name = case when p_group_patch ? 'activity_name'
           then nullif(p_group_patch->>'activity_name', '') else activity_name end,
         record_blocks = case when p_group_patch ? 'record_blocks'
           then coalesce(p_group_patch->'record_blocks', '[]'::jsonb) else record_blocks end,
         record_schema = case when p_group_patch ? 'record_schema'
           then p_group_patch->'record_schema' else record_schema end,
         initial_homework = case when p_group_patch ? 'initial_homework'
           then nullif(p_group_patch->>'initial_homework', '') else initial_homework end,
         initial_next_plan = case when p_group_patch ? 'initial_next_plan'
           then nullif(p_group_patch->>'initial_next_plan', '') else initial_next_plan end,
         teacher_id = case when p_group_patch ? 'teacher_id'
           then nullif(p_group_patch->>'teacher_id', '') else teacher_id end,
         teacher_type = case when p_group_patch ? 'teacher_type'
           then coalesce(nullif(p_group_patch->>'teacher_type', ''), teacher_type)
           else teacher_type end,
         teacher_user_id = case when p_group_patch ? 'teacher_user_id'
           then nullif(p_group_patch->>'teacher_user_id', '')::uuid else teacher_user_id end,
         student_ids = case when p_group_patch ? 'student_ids'
           then coalesce(p_group_patch->'student_ids', '[]'::jsonb) else student_ids end,
         assistant_ids = case when p_group_patch ? 'assistant_ids'
           then coalesce(p_group_patch->'assistant_ids', '[]'::jsonb) else assistant_ids end,
         weekdays = case when p_group_patch ? 'weekdays'
           then coalesce(p_group_patch->'weekdays', '[]'::jsonb) else weekdays end,
         start_time = case when p_group_patch ? 'start_time'
           then nullif(p_group_patch->>'start_time', '') else start_time end,
         end_time = case when p_group_patch ? 'end_time'
           then nullif(p_group_patch->>'end_time', '') else end_time end,
         room = case when p_group_patch ? 'room'
           then nullif(p_group_patch->>'room', '') else room end,
         start_date = case when p_group_patch ? 'start_date'
           then nullif(p_group_patch->>'start_date', '')::date else start_date end,
         end_date = case when p_group_patch ? 'end_date'
           then nullif(p_group_patch->>'end_date', '')::date else end_date end,
         billing_mode = case when p_group_patch ? 'billing_mode'
           then coalesce(nullif(p_group_patch->>'billing_mode', ''), billing_mode)
           else billing_mode end,
         default_billing = case when p_group_patch ? 'default_billing'
           then coalesce(p_group_patch->'default_billing', '{}'::jsonb) else default_billing end,
         student_billings = case when p_group_patch ? 'student_billings'
           then coalesce(p_group_patch->'student_billings', '{}'::jsonb) else student_billings end,
         fee_policy = case when p_group_patch ? 'fee_policy'
           then coalesce(nullif(p_group_patch->>'fee_policy', ''), fee_policy)
           else fee_policy end,
         additional_fee_type = case when p_group_patch ? 'additional_fee_type'
           then coalesce(nullif(p_group_patch->>'additional_fee_type', ''), additional_fee_type)
           else additional_fee_type end,
         additional_fee_amount = case when p_group_patch ? 'additional_fee_amount'
           then coalesce((p_group_patch->>'additional_fee_amount')::integer, 0)
           else additional_fee_amount end,
         memo = case when p_group_patch ? 'memo'
           then nullif(p_group_patch->>'memo', '') else memo end,
         status = case when p_group_patch ? 'status'
           then coalesce(nullif(p_group_patch->>'status', ''), status) else status end,
         updated_at = now()
   where id = p_class_group_id
   returning * into v_group;

  if cardinality(v_old_rule_ids) > 0 then
    update public.class_schedule_rules
       set is_active = false,
           updated_at = now()
     where id = any(v_old_rule_ids);
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    insert into public.class_schedule_rules (
      academy_id,
      class_group_id,
      day_of_week,
      start_time,
      end_time,
      teacher_user_id,
      assistant_ids,
      room,
      is_active,
      effective_start_date,
      effective_end_date
    ) values (
      p_academy_id,
      p_class_group_id,
      (v_rule->>'day_of_week')::smallint,
      v_rule->>'start_time',
      v_rule->>'end_time',
      nullif(v_rule->>'teacher_user_id', '')::uuid,
      coalesce(v_rule->'assistant_ids', '[]'::jsonb),
      nullif(v_rule->>'room', ''),
      true,
      v_effective_from,
      null
    )
    returning id into v_new_rule_id;
    v_new_rule_ids := array_append(v_new_rule_ids, v_new_rule_id);
  end loop;

  if cardinality(v_old_rule_ids) > 0 then
    -- 같은 요일이 새 규칙에도 남아 있으면 기존 미래 회차 ID를 새 규칙으로
    -- 넘긴다. 시간·담당·강의실은 새 값으로 바꾸되 회차에 연결된 기록은 유지된다.
    -- 과거에 같은 요일 규칙이 중복된 경우에는 가장 최근 규칙 한 개만 승계한다.
    update public.class_sessions cs
       set schedule_rule_id = new_rule.id,
           occurrence_date = coalesce(cs.occurrence_date, cs.date),
           start_time = case when cs.session_exception_id is not null
             then cs.start_time else new_rule.start_time end,
           end_time = case when cs.session_exception_id is not null
             then cs.end_time else new_rule.end_time end,
           room = coalesce(new_rule.room, v_group.room),
           teacher_id = v_group.teacher_id,
           teacher_type = v_group.teacher_type,
           teacher_user_id = case when cs.session_exception_id is not null
             then cs.teacher_user_id
             else coalesce(new_rule.teacher_user_id, v_group.teacher_user_id) end,
           assistant_ids = case when cs.session_exception_id is not null
             then cs.assistant_ids
             else coalesce(new_rule.assistant_ids, v_group.assistant_ids, '[]'::jsonb) end,
           student_ids = coalesce(v_group.student_ids, '[]'::jsonb),
           record_schema = coalesce(cs.record_schema, v_group.record_schema),
           activity_type = coalesce(cs.activity_type, v_group.activity_type),
           activity_name = coalesce(cs.activity_name, v_group.activity_name),
           updated_at = now()
      from public.class_schedule_rules new_rule
     where new_rule.id = any(v_new_rule_ids)
       and cs.class_group_id = p_class_group_id
       and coalesce(cs.occurrence_date, cs.date) >= v_effective_from
       and cs.schedule_rule_id = (
         select old_rule.id
           from public.class_schedule_rules old_rule
          where old_rule.id = any(v_old_rule_ids)
            and old_rule.day_of_week = new_rule.day_of_week
          order by old_rule.created_at desc, old_rule.id
          limit 1
       )
       and (
         cs.status in ('scheduled', 'rescheduled')
         or (cs.status = 'canceled' and cs.canceled_by_schedule_exception = true)
       );

    -- 새 규칙에서 빠진 요일이나 과거 중복 규칙의 미래 회차는 삭제하지 않고
    -- 취소한다. 완료 회차와 과거 회차는 절대 변경하지 않는다.
    update public.class_sessions
       set status = 'canceled',
           canceled_by_schedule_exception = false,
           updated_at = now()
     where class_group_id = p_class_group_id
       and schedule_rule_id = any(v_old_rule_ids)
       and coalesce(occurrence_date, date) >= v_effective_from
       and status in ('scheduled', 'rescheduled');

    -- SQL 046 이전에 생성되어 규칙 ID가 없는 미래 회차는 이전 규칙 자연키와
    -- 일치하고, 같은 자연키의 새 규칙도 없고, 연결 기록도 없을 때만 취소한다.
    update public.class_sessions cs
       set status = 'canceled',
           updated_at = now()
     where cs.class_group_id = p_class_group_id
       and cs.schedule_rule_id is null
       and cs.date >= v_effective_from
       and cs.status in ('scheduled', 'rescheduled')
       and exists (
         select 1
           from public.class_schedule_rules old_rule
          where old_rule.id = any(v_old_rule_ids)
            and old_rule.day_of_week = extract(dow from cs.date)::smallint
            and left(old_rule.start_time, 5) = left(coalesce(cs.start_time, ''), 5)
       )
       and not exists (
         select 1
           from public.class_schedule_rules new_rule
          where new_rule.id = any(v_new_rule_ids)
            and new_rule.day_of_week = extract(dow from cs.date)::smallint
            and left(new_rule.start_time, 5) = left(coalesce(cs.start_time, ''), 5)
       )
       and not exists (
         select 1 from public.lesson_records lr where lr.class_session_id = cs.id
       )
       and not exists (
         select 1 from public.attendance_records ar where ar.class_session_id = cs.id
       )
       and not exists (
         select 1 from public.clinic_records cr where cr.class_session_id = cs.id
       );
  end if;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'rules', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.day_of_week)
        from public.class_schedule_rules r
       where r.id = any(v_new_rule_ids)
    ), '[]'::jsonb),
    'deactivated_rule_count', cardinality(v_old_rule_ids),
    'effective_from', v_effective_from
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_class_group_with_rules_guarded (
  p_academy_id          uuid,
  p_class_group_id      uuid,
  p_group_patch         jsonb,
  p_rules               jsonb,
  p_effective_from      date,
  p_expected_updated_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;

  -- 기존 SQL 047과 같은 학원 단위 잠금을 잡은 뒤 버전을 검사한다. 이후 호출하는
  -- 원자 수정 함수도 같은 잠금을 사용하므로 새 클라이언트끼리 검사-수정 사이에
  -- 다른 반 수정이 끼어들 수 없다.
  perform pg_advisory_xact_lock(hashtextextended(p_academy_id::text, 0));

  select updated_at
    into v_updated_at
    from public.class_groups
   where id = p_class_group_id
     and academy_id = p_academy_id
     and mode = 'academy'
   for update;

  if not found then
    raise exception '수정할 반을 찾을 수 없어요.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is null or v_updated_at is distinct from p_expected_updated_at then
    raise exception '다른 기기에서 이 반을 먼저 수정했어요.' using errcode = '40001';
  end if;

  return public.update_class_group_with_rules(
    p_academy_id,
    p_class_group_id,
    p_group_patch,
    p_rules,
    p_effective_from
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_product_feedback_status_for_developer (
  p_feedback_id uuid,
  p_status      text
)
  RETURNS TABLE (
    id         uuid,
    status     text,
    updated_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_previous_status text;
begin
  if not public.is_current_app_developer() then
    raise exception '개발자 워크스페이스 접근 권한이 없어요.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.app_developers developer
    where developer.user_id = auth.uid()
      and developer.is_active = true
      and developer.role in ('developer', 'support')
  ) then
    raise exception '의견 상태를 변경할 권한이 없어요.' using errcode = '42501';
  end if;
  if p_feedback_id is null then
    raise exception '의견 ID가 필요해요.' using errcode = '22023';
  end if;
  if p_status not in ('received', 'reviewing', 'planned', 'resolved', 'closed') then
    raise exception '의견 상태가 올바르지 않아요.' using errcode = '22023';
  end if;

  select feedback.status into v_previous_status
  from public.product_feedback feedback
  where feedback.id = p_feedback_id
  for update;

  if not found then
    raise exception '대상 의견을 찾을 수 없어요.' using errcode = 'P0002';
  end if;

  update public.product_feedback feedback
  set status = p_status,
      updated_at = now()
  where feedback.id = p_feedback_id;

  insert into public.developer_action_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    details
  ) values (
    auth.uid(),
    'feedback.status_changed',
    'product_feedback',
    p_feedback_id::text,
    jsonb_build_object('from', v_previous_status, 'to', p_status)
  );

  return query
  select feedback.id, feedback.status, feedback.updated_at
  from public.product_feedback feedback
  where feedback.id = p_feedback_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_account_data (
  p_user_id         uuid,
  p_withdrawn_email text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_memberships integer := 0;
  v_profiles integer := 0;
  v_rules integer := 0;
  v_devices integer := 0;
begin
  if p_user_id is null
     or p_withdrawn_email is null
     or p_withdrawn_email !~ '^withdrawn-[0-9a-f-]+@invalid[.]seenit[.]local$' then
    raise exception '탈퇴 대상 정보가 올바르지 않아요.' using errcode = '22023';
  end if;
  if exists (select 1 from public.academies a where a.owner_id = p_user_id) then
    raise exception '학원 소유권 이전 또는 학원 삭제가 먼저 필요해요.' using errcode = '42501';
  end if;

  update public.academy_members
     set status = 'inactive', updated_at = now()
   where user_id = p_user_id and status <> 'inactive';
  get diagnostics v_memberships = row_count;

  update public.academy_staff_profiles
     set status = 'inactive', updated_at = now()
   where user_id = p_user_id and status <> 'inactive';
  get diagnostics v_profiles = row_count;

  update public.academy_staff_work_rules
     set is_active = false, updated_at = now()
   where staff_user_id = p_user_id and is_active = true;
  get diagnostics v_rules = row_count;

  update public.push_devices
     set enabled = false, updated_at = now()
   where user_id = p_user_id and enabled = true;
  get diagnostics v_devices = row_count;

  update public.profiles
     set email = p_withdrawn_email,
         display_name = '탈퇴한 사용자',
         phone = null,
         withdrawn_at = now(),
         updated_at = now()
   where id = p_user_id;
  if not found then raise exception '탈퇴할 프로필을 찾을 수 없어요.'; end if;

  return jsonb_build_object(
    'memberships_deactivated', v_memberships,
    'staff_profiles_deactivated', v_profiles,
    'work_rules_stopped', v_rules,
    'push_devices_disabled', v_devices
  );
end;
$function$;

ALTER TABLE "public"."academies"
  ADD CONSTRAINT "academies_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_calendar_events"
  ADD CONSTRAINT "academy_calendar_events_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_calendar_events"
  ADD CONSTRAINT "academy_calendar_events_timed_class_impact_chk" CHECK ((all_day OR (NOT affects_classes))) NOT VALID;

ALTER TABLE "public"."academy_chat_messages"
  ADD CONSTRAINT "academy_chat_messages_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_messages"
  ADD CONSTRAINT "academy_chat_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_reads"
  ADD CONSTRAINT "academy_chat_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_thread_members"
  ADD CONSTRAINT "academy_chat_thread_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_threads"
  ADD CONSTRAINT "academy_chat_threads_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_threads"
  ADD CONSTRAINT "academy_chat_threads_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_chat_threads"
  ADD CONSTRAINT "academy_chat_threads_dm_user_a_fkey" FOREIGN KEY (dm_user_a) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_threads"
  ADD CONSTRAINT "academy_chat_threads_dm_user_b_fkey" FOREIGN KEY (dm_user_b) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_messages"
  ADD CONSTRAINT "academy_chat_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.academy_chat_threads(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_reads"
  ADD CONSTRAINT "academy_chat_reads_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.academy_chat_threads(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_chat_thread_members"
  ADD CONSTRAINT "academy_chat_thread_members_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES public.academy_chat_threads(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_drive_events"
  ADD CONSTRAINT "academy_drive_events_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_drive_events"
  ADD CONSTRAINT "academy_drive_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_drive_files"
  ADD CONSTRAINT "academy_drive_files_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_drive_files"
  ADD CONSTRAINT "academy_drive_files_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_drive_files"
  ADD CONSTRAINT "academy_drive_files_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_drive_folders"
  ADD CONSTRAINT "academy_drive_folders_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_drive_files"
  ADD CONSTRAINT "academy_drive_files_academy_folder_fk" FOREIGN KEY (academy_id, folder_id) REFERENCES public.academy_drive_folders(academy_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."academy_drive_folders"
  ADD CONSTRAINT "academy_drive_folders_academy_id_parent_id_fkey" FOREIGN KEY (academy_id, parent_id) REFERENCES public.academy_drive_folders(academy_id, id) ON DELETE RESTRICT;

ALTER TABLE "public"."academy_drive_folders"
  ADD CONSTRAINT "academy_drive_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_drive_folders"
  ADD CONSTRAINT "academy_drive_folders_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_invitations"
  ADD CONSTRAINT "academy_invitations_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_invitations"
  ADD CONSTRAINT "academy_invitations_accepted_user_id_fkey" FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_invitations"
  ADD CONSTRAINT "academy_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."academy_members"
  ADD CONSTRAINT "academy_members_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_members"
  ADD CONSTRAINT "academy_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_profiles"
  ADD CONSTRAINT "academy_staff_profiles_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_profiles"
  ADD CONSTRAINT "academy_staff_profiles_member_id_fkey" FOREIGN KEY (member_id) REFERENCES public.academy_members(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_profiles"
  ADD CONSTRAINT "academy_staff_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_shifts"
  ADD CONSTRAINT "academy_staff_shifts_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_shifts"
  ADD CONSTRAINT "academy_staff_shifts_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_work_exceptions"
  ADD CONSTRAINT "academy_staff_work_exceptions_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_work_exceptions"
  ADD CONSTRAINT "academy_staff_work_exceptions_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_work_rules"
  ADD CONSTRAINT "academy_staff_work_rules_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."academy_staff_work_rules"
  ADD CONSTRAINT "academy_staff_work_rules_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."app_developers"
  ADD CONSTRAINT "app_developers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."app_developers"
  ADD CONSTRAINT "app_developers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_groups"
  ADD CONSTRAINT "class_groups_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_groups"
  ADD CONSTRAINT "class_groups_teacher_user_id_fkey" FOREIGN KEY (teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_groups"
  ADD CONSTRAINT "class_groups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_schedule_rules"
  ADD CONSTRAINT "class_schedule_rules_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_schedule_rules"
  ADD CONSTRAINT "class_schedule_rules_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_schedule_rules"
  ADD CONSTRAINT "class_schedule_rules_teacher_user_id_fkey" FOREIGN KEY (teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_session_exceptions"
  ADD CONSTRAINT "class_session_exceptions_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_session_exceptions"
  ADD CONSTRAINT "class_session_exceptions_calendar_event_id_fkey" FOREIGN KEY (calendar_event_id) REFERENCES public.academy_calendar_events(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_session_exceptions"
  ADD CONSTRAINT "class_session_exceptions_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_session_exceptions"
  ADD CONSTRAINT "class_session_exceptions_substitute_teacher_user_id_fkey" FOREIGN KEY (substitute_teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_session_exceptions"
  ADD CONSTRAINT "class_session_exceptions_teacher_user_id_fkey" FOREIGN KEY (teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_calendar_cancel_original_exception_id_fkey" FOREIGN KEY (calendar_cancel_original_exception_id) REFERENCES public.class_session_exceptions(id)
    ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_class_session_id_fkey" FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_origin_session_id_fkey" FOREIGN KEY (origin_session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_schedule_rule_id_fkey" FOREIGN KEY (schedule_rule_id) REFERENCES public.class_schedule_rules(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_session_exception_id_fkey" FOREIGN KEY (session_exception_id) REFERENCES public.class_session_exceptions(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_substitute_teacher_user_id_fkey" FOREIGN KEY (substitute_teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_teacher_user_id_fkey" FOREIGN KEY (teacher_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."class_sessions"
  ADD CONSTRAINT "class_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_events"
  ADD CONSTRAINT "clinic_events_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_events"
  ADD CONSTRAINT "clinic_events_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE SET NULL;

ALTER TABLE "public"."clinic_event_students"
  ADD CONSTRAINT "clinic_event_students_clinic_event_id_fkey" FOREIGN KEY (clinic_event_id) REFERENCES public.clinic_events(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE SET NULL;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_class_session_id_fkey" FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_clinic_event_id_fkey" FOREIGN KEY (clinic_event_id) REFERENCES public.clinic_events(id) ON DELETE SET NULL;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."developer_action_logs"
  ADD CONSTRAINT "developer_action_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."exam_results"
  ADD CONSTRAINT "exam_results_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."exam_results"
  ADD CONSTRAINT "exam_results_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_records"
  ADD CONSTRAINT "lesson_records_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_records"
  ADD CONSTRAINT "lesson_records_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_records"
  ADD CONSTRAINT "lesson_records_class_session_id_fkey" FOREIGN KEY (class_session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_source_lesson_record_id_fkey" FOREIGN KEY (source_lesson_record_id) REFERENCES public.lesson_records(id) ON DELETE SET NULL;

ALTER TABLE "public"."lesson_records"
  ADD CONSTRAINT "lesson_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_class_group_id_fkey" FOREIGN KEY (class_group_id) REFERENCES public.class_groups(id) ON DELETE SET NULL;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."payrolls"
  ADD CONSTRAINT "payrolls_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."payrolls"
  ADD CONSTRAINT "payrolls_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."payrolls"
  ADD CONSTRAINT "payrolls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."product_feedback"
  ADD CONSTRAINT "product_feedback_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE SET NULL;

ALTER TABLE "public"."product_update_reads"
  ADD CONSTRAINT "product_update_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."push_devices"
  ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_attendance_logs"
  ADD CONSTRAINT "staff_attendance_logs_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_attendance_logs"
  ADD CONSTRAINT "staff_attendance_logs_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."staff_attendance_logs"
  ADD CONSTRAINT "staff_attendance_logs_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_check_events"
  ADD CONSTRAINT "student_check_events_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_check_events"
  ADD CONSTRAINT "student_check_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."student_check_events"
  ADD CONSTRAINT "student_check_events_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE SET NULL;

ALTER TABLE "public"."student_events"
  ADD CONSTRAINT "student_events_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_events"
  ADD CONSTRAINT "student_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."students"
  ADD CONSTRAINT "students_academy_id_fkey" FOREIGN KEY (academy_id) REFERENCES public.academies(id) ON DELETE CASCADE;

ALTER TABLE "public"."attendance_records"
  ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_event_students"
  ADD CONSTRAINT "clinic_event_students_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."clinic_records"
  ADD CONSTRAINT "clinic_records_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."exam_results"
  ADD CONSTRAINT "exam_results_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_check_events"
  ADD CONSTRAINT "student_check_events_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."student_events"
  ADD CONSTRAINT "student_events_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE "public"."students"
  ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX academies_owner_id_idx ON public.academies USING btree (owner_id);

CREATE INDEX academy_calendar_events_academy_range_idx ON public.academy_calendar_events USING btree (academy_id, start_date, end_date)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX academy_calendar_events_external_unique_idx ON public.academy_calendar_events USING btree (academy_id, source, external_id)
  WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));

CREATE INDEX academy_chat_messages_academy_idx ON public.academy_chat_messages USING btree (academy_id, created_at DESC);

CREATE INDEX academy_chat_messages_thread_idx ON public.academy_chat_messages USING btree (thread_id, created_at DESC);

CREATE INDEX academy_chat_thread_members_user_idx ON public.academy_chat_thread_members USING btree (user_id);

CREATE INDEX academy_chat_threads_academy_idx ON public.academy_chat_threads USING btree (academy_id);

CREATE INDEX academy_chat_threads_dm_a_idx ON public.academy_chat_threads USING btree (dm_user_a);

CREATE INDEX academy_chat_threads_dm_b_idx ON public.academy_chat_threads USING btree (dm_user_b);

CREATE UNIQUE INDEX academy_chat_threads_dm_uniq ON public.academy_chat_threads USING btree (academy_id, dm_user_a, dm_user_b)
  WHERE (kind = 'dm'::text);

CREATE UNIQUE INDEX academy_chat_threads_group_uniq ON public.academy_chat_threads USING btree (academy_id)
  WHERE ((kind = 'group'::text) AND (group_scope = 'academy'::text));

CREATE INDEX academy_drive_events_academy_created_idx ON public.academy_drive_events USING btree (academy_id, created_at DESC);

CREATE INDEX academy_drive_files_academy_created_idx ON public.academy_drive_files USING btree (academy_id, created_at DESC);

CREATE INDEX academy_drive_files_deleted_idx ON public.academy_drive_files USING btree (academy_id, deleted_at);

CREATE INDEX academy_drive_files_folder_idx ON public.academy_drive_files USING btree (academy_id, folder_id, created_at DESC);

CREATE INDEX academy_drive_folders_deleted_idx ON public.academy_drive_folders USING btree (academy_id, deleted_at);

CREATE INDEX academy_drive_folders_parent_idx ON public.academy_drive_folders USING btree (academy_id, parent_id, created_at);

CREATE UNIQUE INDEX academy_drive_folders_unique_name_idx ON public.academy_drive_folders
  USING btree (academy_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  WHERE (deleted_at IS NULL);

CREATE INDEX academy_invitations_academy_id_idx ON public.academy_invitations USING btree (academy_id);

CREATE INDEX academy_invitations_email_idx ON public.academy_invitations USING btree (email);

CREATE UNIQUE INDEX academy_invitations_one_pending_email_idx ON public.academy_invitations USING btree (academy_id, lower(btrim(email)))
  WHERE (status = 'pending'::text);

CREATE INDEX academy_invitations_status_idx ON public.academy_invitations USING btree (status);

CREATE INDEX academy_members_academy_id_idx ON public.academy_members USING btree (academy_id);

CREATE INDEX academy_members_role_idx ON public.academy_members USING btree (ROLE);

CREATE INDEX academy_members_user_id_idx ON public.academy_members USING btree (user_id);

CREATE INDEX academy_staff_profiles_academy_id_idx ON public.academy_staff_profiles USING btree (academy_id);

CREATE INDEX academy_staff_profiles_member_id_idx ON public.academy_staff_profiles USING btree (member_id);

CREATE INDEX academy_staff_profiles_user_id_idx ON public.academy_staff_profiles USING btree (user_id);

CREATE INDEX academy_staff_shifts_academy_id_date_idx ON public.academy_staff_shifts USING btree (academy_id, date);

CREATE INDEX academy_staff_shifts_staff_user_id_idx ON public.academy_staff_shifts USING btree (staff_user_id);

CREATE INDEX academy_staff_shifts_status_idx ON public.academy_staff_shifts USING btree (status);

CREATE INDEX academy_staff_work_exceptions_academy_date_idx ON public.academy_staff_work_exceptions USING btree (academy_id, date);

CREATE INDEX academy_staff_work_exceptions_user_date_idx ON public.academy_staff_work_exceptions USING btree (staff_user_id, date);

CREATE INDEX academy_staff_work_rules_academy_idx ON public.academy_staff_work_rules USING btree (academy_id);

CREATE INDEX academy_staff_work_rules_user_idx ON public.academy_staff_work_rules USING btree (staff_user_id);

CREATE INDEX attendance_records_academy_id_idx ON public.attendance_records USING btree (academy_id);

CREATE INDEX attendance_records_class_session_id_idx ON public.attendance_records USING btree (class_session_id);

CREATE INDEX attendance_records_date_idx ON public.attendance_records USING btree (date);

CREATE INDEX attendance_records_mode_idx ON public.attendance_records USING btree (mode);

CREATE INDEX attendance_records_session_confirmation_idx ON public.attendance_records USING btree (class_session_id, confirmation_state);

CREATE INDEX attendance_records_status_idx ON public.attendance_records USING btree (status);

CREATE INDEX attendance_records_student_id_idx ON public.attendance_records USING btree (student_id);

CREATE INDEX attendance_records_user_id_idx ON public.attendance_records USING btree (user_id);

CREATE INDEX class_groups_academy_id_idx ON public.class_groups USING btree (academy_id);

CREATE INDEX class_groups_mode_idx ON public.class_groups USING btree (mode);

CREATE INDEX class_groups_start_date_idx ON public.class_groups USING btree (start_date);

CREATE INDEX class_groups_status_idx ON public.class_groups USING btree (status);

CREATE INDEX class_groups_teacher_id_idx ON public.class_groups USING btree (teacher_id);

CREATE INDEX class_groups_teacher_user_id_idx ON public.class_groups USING btree (teacher_user_id);

CREATE INDEX class_groups_user_id_idx ON public.class_groups USING btree (user_id);

CREATE INDEX class_schedule_rules_academy_idx ON public.class_schedule_rules USING btree (academy_id);

CREATE INDEX class_schedule_rules_effective_range_idx ON public.class_schedule_rules USING btree (academy_id, class_group_id, effective_start_date, effective_end_date);

CREATE INDEX class_schedule_rules_group_idx ON public.class_schedule_rules USING btree (class_group_id);

CREATE INDEX class_session_exceptions_academy_date_idx ON public.class_session_exceptions USING btree (academy_id, session_date);

CREATE UNIQUE INDEX class_session_exceptions_calendar_cancel_unique_idx ON public.class_session_exceptions USING btree (calendar_event_id, class_group_id, session_date)
  WHERE ((calendar_event_id IS NOT NULL) AND (TYPE = 'cancel'::text));

CREATE INDEX class_session_exceptions_group_date_idx ON public.class_session_exceptions USING btree (class_group_id, session_date);

CREATE UNIQUE INDEX class_session_exceptions_manual_change_unique_idx ON public.class_session_exceptions USING btree (academy_id, class_group_id, session_date, TYPE)
  WHERE ((calendar_event_id IS NULL) AND (TYPE = ANY (ARRAY['cancel'::text, 'reschedule'::text])));

CREATE INDEX class_sessions_academy_id_idx ON public.class_sessions USING btree (academy_id);

CREATE INDEX class_sessions_academy_occurrence_idx ON public.class_sessions USING btree (academy_id, occurrence_date);

CREATE INDEX class_sessions_class_group_id_idx ON public.class_sessions USING btree (class_group_id);

CREATE INDEX class_sessions_date_idx ON public.class_sessions USING btree (date);

CREATE UNIQUE INDEX class_sessions_extra_exception_uidx ON public.class_sessions USING btree (session_exception_id)
  WHERE ((schedule_rule_id IS NULL) AND (session_exception_id IS NOT NULL));

CREATE INDEX class_sessions_mode_idx ON public.class_sessions USING btree (mode);

CREATE INDEX class_sessions_origin_session_id_idx ON public.class_sessions USING btree (origin_session_id);

CREATE UNIQUE INDEX class_sessions_schedule_occurrence_uidx ON public.class_sessions USING btree (schedule_rule_id, occurrence_date)
  WHERE ((schedule_rule_id IS NOT NULL) AND (occurrence_date IS NOT NULL));

CREATE INDEX class_sessions_status_idx ON public.class_sessions USING btree (status);

CREATE INDEX class_sessions_substitute_teacher_idx ON public.class_sessions USING btree (substitute_teacher_user_id);

CREATE INDEX class_sessions_teacher_id_idx ON public.class_sessions USING btree (teacher_id);

CREATE INDEX class_sessions_teacher_user_id_idx ON public.class_sessions USING btree (teacher_user_id);

CREATE INDEX class_sessions_user_id_idx ON public.class_sessions USING btree (user_id);

CREATE INDEX clinic_event_students_student_idx ON public.clinic_event_students USING btree (student_id, clinic_event_id);

CREATE INDEX clinic_events_academy_date_idx ON public.clinic_events USING btree (academy_id, event_date, start_time);

CREATE INDEX clinic_records_academy_id_idx ON public.clinic_records USING btree (academy_id);

CREATE INDEX clinic_records_assistant_id_idx ON public.clinic_records USING btree (assistant_id);

CREATE INDEX clinic_records_class_group_id_idx ON public.clinic_records USING btree (class_group_id);

CREATE INDEX clinic_records_class_session_id_idx ON public.clinic_records USING btree (class_session_id);

CREATE INDEX clinic_records_clinic_event_idx ON public.clinic_records USING btree (clinic_event_id, student_id);

CREATE INDEX clinic_records_date_idx ON public.clinic_records USING btree (date);

CREATE UNIQUE INDEX clinic_records_event_student_unique_idx ON public.clinic_records USING btree (clinic_event_id, student_id)
  WHERE (clinic_event_id IS NOT NULL);

CREATE INDEX clinic_records_mode_idx ON public.clinic_records USING btree (mode);

CREATE INDEX clinic_records_student_id_idx ON public.clinic_records USING btree (student_id);

CREATE INDEX clinic_records_subject_idx ON public.clinic_records USING btree (subject);

CREATE INDEX clinic_records_user_id_idx ON public.clinic_records USING btree (user_id);

CREATE INDEX developer_action_logs_created_idx ON public.developer_action_logs USING btree (created_at DESC);

CREATE INDEX exam_results_academy_id_idx ON public.exam_results USING btree (academy_id);

CREATE INDEX exam_results_exam_date_idx ON public.exam_results USING btree (exam_date);

CREATE INDEX exam_results_exam_type_idx ON public.exam_results USING btree (exam_type);

CREATE INDEX exam_results_mode_idx ON public.exam_results USING btree (mode);

CREATE INDEX exam_results_student_id_idx ON public.exam_results USING btree (student_id);

CREATE INDEX exam_results_subject_idx ON public.exam_results USING btree (subject);

CREATE INDEX exam_results_user_id_idx ON public.exam_results USING btree (user_id);

CREATE INDEX lesson_records_academy_id_idx ON public.lesson_records USING btree (academy_id);

CREATE INDEX lesson_records_class_group_id_idx ON public.lesson_records USING btree (class_group_id);

CREATE INDEX lesson_records_class_session_id_idx ON public.lesson_records USING btree (class_session_id);

CREATE INDEX lesson_records_date_idx ON public.lesson_records USING btree (date);

CREATE INDEX lesson_records_mode_idx ON public.lesson_records USING btree (mode);

CREATE INDEX lesson_records_teacher_id_idx ON public.lesson_records USING btree (teacher_id);

CREATE INDEX lesson_records_user_id_idx ON public.lesson_records USING btree (user_id);

CREATE INDEX payments_academy_id_idx ON public.payments USING btree (academy_id);

CREATE INDEX payments_class_group_id_idx ON public.payments USING btree (class_group_id);

CREATE INDEX payments_mode_idx ON public.payments USING btree (mode);

CREATE INDEX payments_month_idx ON public.payments USING btree (month);

CREATE INDEX payments_status_idx ON public.payments USING btree (status);

CREATE INDEX payments_student_id_idx ON public.payments USING btree (student_id);

CREATE UNIQUE INDEX payments_student_monthly_unique_idx ON public.payments USING btree (academy_id, student_id, month)
  WHERE (payment_kind = 'student_monthly'::text);

CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);

CREATE INDEX payrolls_academy_id_idx ON public.payrolls USING btree (academy_id);

CREATE INDEX payrolls_mode_idx ON public.payrolls USING btree (mode);

CREATE INDEX payrolls_month_idx ON public.payrolls USING btree (month);

CREATE INDEX payrolls_staff_id_idx ON public.payrolls USING btree (staff_id);

CREATE INDEX payrolls_staff_type_idx ON public.payrolls USING btree (staff_type);

CREATE INDEX payrolls_staff_user_id_idx ON public.payrolls USING btree (staff_user_id);

CREATE INDEX payrolls_status_idx ON public.payrolls USING btree (status);

CREATE INDEX payrolls_user_id_idx ON public.payrolls USING btree (user_id);

CREATE INDEX product_feedback_academy_created_idx ON public.product_feedback USING btree (academy_id, created_at DESC)
  WHERE (academy_id IS NOT NULL);

CREATE INDEX product_feedback_created_idx ON public.product_feedback USING btree (created_at DESC);

CREATE INDEX product_feedback_status_created_idx ON public.product_feedback USING btree (status, created_at DESC);

CREATE INDEX profiles_id_idx ON public.profiles USING btree (id);

CREATE INDEX push_devices_user_id_idx ON public.push_devices USING btree (user_id);

CREATE INDEX staff_attendance_logs_academy_date_idx ON public.staff_attendance_logs USING btree (academy_id, work_date DESC);

CREATE UNIQUE INDEX staff_attendance_logs_one_active_day_uidx ON public.staff_attendance_logs USING btree (academy_id, staff_user_id, work_date)
  WHERE (is_void = false);

CREATE INDEX staff_attendance_logs_user_date_idx ON public.staff_attendance_logs USING btree (staff_user_id, work_date DESC);

CREATE INDEX student_check_events_academy_id_event_time_idx ON public.student_check_events USING btree (academy_id, event_time DESC);

CREATE UNIQUE INDEX student_check_events_auto_checkout_unique_idx ON public.student_check_events USING btree (academy_id, student_id, event_time)
  WHERE ((event_type = 'check_out'::text) AND (source = 'system_auto'::text));

CREATE INDEX student_check_events_session_id_idx ON public.student_check_events USING btree (session_id);

CREATE INDEX student_check_events_student_id_idx ON public.student_check_events USING btree (student_id);

CREATE INDEX student_events_academy_id_idx ON public.student_events USING btree (academy_id);

CREATE INDEX student_events_date_idx ON public.student_events USING btree (date);

CREATE INDEX student_events_event_type_idx ON public.student_events USING btree (event_type);

CREATE INDEX student_events_mode_idx ON public.student_events USING btree (mode);

CREATE INDEX student_events_student_id_idx ON public.student_events USING btree (student_id);

CREATE INDEX student_events_user_id_idx ON public.student_events USING btree (user_id);

CREATE INDEX students_academy_checkin_pin_idx ON public.students USING btree (academy_id, checkin_pin)
  WHERE ((mode = 'academy'::text) AND (status = 'active'::text) AND (checkin_pin IS NOT NULL));

CREATE INDEX students_academy_id_idx ON public.students USING btree (academy_id);

CREATE INDEX students_mode_idx ON public.students USING btree (mode);

CREATE INDEX students_school_name_idx ON public.students USING btree (school_name);

CREATE INDEX students_status_idx ON public.students USING btree (status);

CREATE INDEX students_user_id_idx ON public.students USING btree (user_id);

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_profile_upsert();

CREATE TRIGGER on_auth_user_email_updated_profile
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

CREATE TRIGGER set_academies_updated_at
  BEFORE UPDATE ON public.academies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sync_member_roles_from_job_title_policies
  AFTER UPDATE OF job_title_permissions ON public.academies
  FOR EACH ROW
  WHEN ((old.job_title_permissions IS DISTINCT FROM new.job_title_permissions))
  EXECUTE FUNCTION public.sync_member_roles_from_job_title_policies();

CREATE TRIGGER set_academy_calendar_events_updated_at
  BEFORE UPDATE ON public.academy_calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER touch_academy_chat_thread_on_message
  AFTER INSERT ON public.academy_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_chat_thread_on_message();

CREATE TRIGGER set_academy_chat_threads_updated_at
  BEFORE UPDATE ON public.academy_chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_academy_drive_files
  AFTER INSERT OR DELETE OR UPDATE ON public.academy_drive_files
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_academy_drive_change();

CREATE TRIGGER guard_academy_drive_file
  BEFORE INSERT OR UPDATE ON public.academy_drive_files
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_academy_drive_file();

CREATE TRIGGER set_academy_drive_files_updated_at
  BEFORE UPDATE ON public.academy_drive_files
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_academy_drive_folders
  AFTER INSERT OR DELETE OR UPDATE ON public.academy_drive_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_academy_drive_change();

CREATE TRIGGER guard_academy_drive_folder
  BEFORE INSERT OR UPDATE ON public.academy_drive_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_academy_drive_folder();

CREATE TRIGGER set_academy_drive_folders_updated_at
  BEFORE UPDATE ON public.academy_drive_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_academy_invitations_updated_at
  BEFORE UPDATE ON public.academy_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cancel_future_shifts_for_inactive_member
  AFTER UPDATE OF status ON public.academy_members
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_future_shifts_for_inactive_member();

CREATE TRIGGER set_academy_members_updated_at
  BEFORE UPDATE ON public.academy_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sync_staff_profile_from_academy_member
  AFTER INSERT OR UPDATE OF ROLE, status ON public.academy_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_staff_profile_from_academy_member();

CREATE TRIGGER protect_student_contact_permission_assignment
  BEFORE INSERT OR UPDATE OF permissions ON public.academy_staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_student_contact_permission_assignment();

CREATE TRIGGER set_academy_staff_profiles_updated_at
  BEFORE UPDATE ON public.academy_staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_academy_staff_shifts_updated_at
  BEFORE UPDATE ON public.academy_staff_shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_app_developers_updated_at
  BEFORE UPDATE ON public.app_developers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_canceled_attendance_record_write
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_canceled_class_session_record_write();

CREATE TRIGGER set_attendance_records_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_class_groups_updated_at
  BEFORE UPDATE ON public.class_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sync_same_day_class_session_from_new_rule
  AFTER INSERT ON public.class_schedule_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_same_day_class_session_from_new_rule();

CREATE TRIGGER guard_extra_session_on_canceled_date
  BEFORE INSERT OR UPDATE ON public.class_session_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_extra_session_on_canceled_date();

CREATE TRIGGER sync_completed_session_time_from_exception
  AFTER INSERT OR UPDATE OF TYPE, session_date, start_time, end_time ON public.class_session_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_completed_session_time_from_exception();

CREATE TRIGGER a_preserve_class_session_calendar_cancel_origin
  BEFORE UPDATE OF status, canceled_by_schedule_exception, session_exception_id ON public.class_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_class_session_calendar_cancel_origin();

CREATE TRIGGER set_class_sessions_updated_at
  BEFORE UPDATE ON public.class_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sync_existing_checkins_to_class_session
  AFTER INSERT OR UPDATE OF student_ids, date, occurrence_date, status ON public.class_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_existing_checkins_to_class_session();

CREATE TRIGGER z_guard_canceled_class_session_completion
  BEFORE UPDATE OF status ON public.class_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_canceled_class_session_completion();

CREATE TRIGGER set_clinic_events_updated_at
  BEFORE UPDATE ON public.clinic_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_clinic_records_updated_at
  BEFORE UPDATE ON public.clinic_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_exam_results_updated_at
  BEFORE UPDATE ON public.exam_results
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_canceled_lesson_record_write
  BEFORE INSERT OR UPDATE ON public.lesson_records
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_canceled_class_session_record_write();

CREATE TRIGGER set_lesson_records_updated_at
  BEFORE UPDATE ON public.lesson_records
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_payrolls_updated_at
  BEFORE UPDATE ON public.payrolls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_product_feedback_updated_at
  BEFORE UPDATE ON public.product_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_push_devices_updated_at
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER guard_staff_attendance_review_fields
  BEFORE INSERT OR UPDATE ON public.staff_attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_staff_attendance_review_fields();

CREATE TRIGGER sync_student_checkin_to_class_attendance
  AFTER INSERT ON public.student_check_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_checkin_to_class_attendance();

CREATE TRIGGER set_student_events_updated_at
  BEFORE UPDATE ON public.student_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enforce_student_contact_write_permission
  BEFORE INSERT OR UPDATE OF phone, parent_phone, parent_name, parent_title, parent_title_custom, checkin_pin ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_contact_write_permission();

CREATE TRIGGER set_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER zz_assign_random_student_checkin_pin
  BEFORE INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_random_student_checkin_pin();

CREATE POLICY "academies delete by owner" ON "public"."academies"
  FOR DELETE
  TO PUBLIC
  USING ((owner_id = auth.uid()));

CREATE POLICY "academies insert as owner" ON "public"."academies"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "academies select owner or member" ON "public"."academies"
  FOR SELECT
  TO PUBLIC
  USING (((owner_id = auth.uid()) OR public.is_member_of_academy(id)));

CREATE POLICY "academies update by owner" ON "public"."academies"
  FOR UPDATE
  TO PUBLIC
  USING (((owner_id = auth.uid()) OR public.is_owner_member_of_academy(id)))
  WITH CHECK (((owner_id = auth.uid()) OR public.is_owner_member_of_academy(id)));

CREATE POLICY "academy_calendar_events_select_members" ON "public"."academy_calendar_events"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id));

CREATE POLICY "chat_messages_delete_own" ON "public"."academy_chat_messages"
  FOR DELETE
  TO PUBLIC
  USING ((sender_id = auth.uid()));

CREATE POLICY "chat_messages_insert" ON "public"."academy_chat_messages"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((sender_id = auth.uid()) AND public.is_member_of_academy(academy_id) AND public.can_access_chat_thread(thread_id) AND (EXISTS ( SELECT 1
   FROM public.academy_chat_threads t
  WHERE ((t.id = academy_chat_messages.thread_id) AND (t.academy_id = t.academy_id))))));

CREATE POLICY "chat_messages_select" ON "public"."academy_chat_messages"
  FOR SELECT
  TO PUBLIC
  USING (public.can_access_chat_thread(thread_id));

CREATE POLICY "chat_reads_all_self" ON "public"."academy_chat_reads"
  FOR ALL
  TO PUBLIC
  USING (((user_id = auth.uid()) AND public.can_access_chat_thread(thread_id)))
  WITH CHECK (((user_id = auth.uid()) AND public.can_access_chat_thread(thread_id)));

CREATE POLICY "chat_thread_members_select" ON "public"."academy_chat_thread_members"
  FOR SELECT
  TO PUBLIC
  USING (public.can_access_chat_thread(thread_id));

CREATE POLICY "chat_threads_delete_owner" ON "public"."academy_chat_threads"
  FOR DELETE
  TO PUBLIC
  USING (public.is_owner_of_academy(academy_id));

CREATE POLICY "chat_threads_insert" ON "public"."academy_chat_threads"
  FOR INSERT
  TO PUBLIC
  WITH
    CHECK
    ((public.is_member_of_academy(academy_id) AND (created_by = auth.uid()) AND (((kind = 'group'::text) AND (group_scope = 'academy'::text)) OR ((kind = 'dm'::text) AND
    ((auth.uid() = dm_user_a) OR (auth.uid() = dm_user_b))))));

CREATE POLICY "chat_threads_select" ON "public"."academy_chat_threads"
  FOR SELECT
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND public.can_access_chat_thread(id)));

CREATE POLICY "academy_drive_events select active member" ON "public"."academy_drive_events"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id));

CREATE POLICY "academy_drive_files delete trashed member" ON "public"."academy_drive_files"
  FOR DELETE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND (deleted_at IS NOT NULL)));

CREATE POLICY "academy_drive_files insert active member" ON "public"."academy_drive_files"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_member_of_academy(academy_id) AND (created_by = auth.uid()) AND (storage_path ~~ ((academy_id)::text || '/%'::text))));

CREATE POLICY "academy_drive_files select active member" ON "public"."academy_drive_files"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id));

CREATE POLICY "academy_drive_files update active member" ON "public"."academy_drive_files"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id))
  WITH CHECK ((public.is_member_of_academy(academy_id) AND (storage_path ~~ ((academy_id)::text || '/%'::text))));

CREATE POLICY "academy_drive_folders delete trashed member" ON "public"."academy_drive_folders"
  FOR DELETE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND (deleted_at IS NOT NULL)));

CREATE POLICY "academy_drive_folders insert active member" ON "public"."academy_drive_folders"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_member_of_academy(academy_id) AND (created_by = auth.uid())));

CREATE POLICY "academy_drive_folders select active member" ON "public"."academy_drive_folders"
  FOR SELECT
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id));

CREATE POLICY "academy_drive_folders update active member" ON "public"."academy_drive_folders"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_member_of_academy(academy_id))
  WITH CHECK (public.is_member_of_academy(academy_id));

CREATE POLICY "academy_invitations insert by operations" ON "public"."academy_invitations"
  FOR INSERT
  TO PUBLIC
  WITH
    CHECK
    (((invited_by = auth.uid()) AND (public.is_owner_of_academy(academy_id) OR (public.has_academy_permission(academy_id, 'canManageStaff'::text) AND (role = ANY
    (ARRAY['teacher'::text, 'pending'::text]))))));

CREATE POLICY "academy_invitations select operations or invitee" ON "public"."academy_invitations"
  FOR SELECT
  TO PUBLIC
  USING ((public.is_academy_operations_manager(academy_id) OR (lower(email) = lower(COALESCE(auth.email(), ''::text)))));

CREATE POLICY "academy_invitations update by operations" ON "public"."academy_invitations"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStaff'::text)))
  WITH
    CHECK
    ((public.is_owner_of_academy(academy_id) OR (public.has_academy_permission(academy_id, 'canManageStaff'::text) AND (role = ANY (ARRAY['teacher'::text, 'pending'::text])))));

CREATE POLICY "academy_members delete by owner" ON "public"."academy_members"
  FOR DELETE
  TO PUBLIC
  USING (public.is_owner_of_academy(academy_id));

CREATE POLICY "academy_members insert by owner" ON "public"."academy_members"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.is_owner_of_academy(academy_id));

CREATE POLICY "academy_members select self or owner" ON "public"."academy_members"
  FOR SELECT
  TO PUBLIC
  USING (((user_id = auth.uid()) OR public.is_owner_of_academy(academy_id)));

CREATE POLICY "academy_members update by owner" ON "public"."academy_members"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_owner_of_academy(academy_id))
  WITH CHECK (public.is_owner_of_academy(academy_id));

CREATE POLICY "academy_staff_profiles insert by owner" ON "public"."academy_staff_profiles"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.is_owner_of_academy(academy_id));

CREATE POLICY "academy_staff_profiles select owner or self" ON "public"."academy_staff_profiles"
  FOR SELECT
  TO PUBLIC
  USING ((public.is_owner_of_academy(academy_id) OR (user_id = auth.uid())));

CREATE POLICY "academy_staff_profiles update by owner" ON "public"."academy_staff_profiles"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_owner_of_academy(academy_id))
  WITH CHECK (public.is_owner_of_academy(academy_id));

CREATE POLICY "academy_staff_shifts delete by manager" ON "public"."academy_staff_shifts"
  FOR DELETE
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canManageStaff'::text));

CREATE POLICY "academy_staff_shifts insert by manager" ON "public"."academy_staff_shifts"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.has_academy_permission(academy_id, 'canManageStaff'::text));

CREATE POLICY "academy_staff_shifts select manager or self" ON "public"."academy_staff_shifts"
  FOR SELECT
  TO PUBLIC
  USING ((public.has_academy_permission(academy_id, 'canManageStaff'::text) OR (staff_user_id = auth.uid())));

CREATE POLICY "academy_staff_shifts update by manager or self" ON "public"."academy_staff_shifts"
  FOR UPDATE
  TO PUBLIC
  USING ((public.has_academy_permission(academy_id, 'canManageStaff'::text) OR (staff_user_id = auth.uid())))
  WITH CHECK ((public.has_academy_permission(academy_id, 'canManageStaff'::text) OR (staff_user_id = auth.uid())));

CREATE POLICY "asw_exc delete operations" ON "public"."academy_staff_work_exceptions"
  FOR DELETE
  TO PUBLIC
  USING (public.is_academy_operations_manager(academy_id));

CREATE POLICY "asw_exc insert operations" ON "public"."academy_staff_work_exceptions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.is_academy_operations_manager(academy_id));

CREATE POLICY "asw_exc select manager or self" ON "public"."academy_staff_work_exceptions"
  FOR SELECT
  TO PUBLIC
  USING ((public.has_academy_permission(academy_id, 'canManageStaff'::text) OR (staff_user_id = auth.uid())));

CREATE POLICY "asw_exc update operations" ON "public"."academy_staff_work_exceptions"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_academy_operations_manager(academy_id))
  WITH CHECK (public.is_academy_operations_manager(academy_id));

CREATE POLICY "asw_rules delete operations" ON "public"."academy_staff_work_rules"
  FOR DELETE
  TO PUBLIC
  USING (public.is_academy_operations_manager(academy_id));

CREATE POLICY "asw_rules insert operations" ON "public"."academy_staff_work_rules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.is_academy_operations_manager(academy_id));

CREATE POLICY "asw_rules select manager or self" ON "public"."academy_staff_work_rules"
  FOR SELECT
  TO PUBLIC
  USING ((public.has_academy_permission(academy_id, 'canManageStaff'::text) OR (staff_user_id = auth.uid())));

CREATE POLICY "asw_rules update operations" ON "public"."academy_staff_work_rules"
  FOR UPDATE
  TO PUBLIC
  USING (public.is_academy_operations_manager(academy_id))
  WITH CHECK (public.is_academy_operations_manager(academy_id));

CREATE POLICY "attendance_records_delete_by_permission" ON "public"."attendance_records"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'private'::text) AND (user_id = auth.uid())) OR ((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageClasses'::text)))));

CREATE POLICY "attendance_records_insert_by_permission" ON "public"."attendance_records"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditAttendance'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "attendance_records_select_members" ON "public"."attendance_records"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND (((class_session_id IS
    NOT NULL) AND public.can_access_academy_class_session(academy_id, class_session_id)) OR public.can_access_academy_student(academy_id, student_id))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "attendance_records_update_by_permission" ON "public"."attendance_records"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditAttendance'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditAttendance'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_groups_delete_by_permission" ON "public"."class_groups"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_groups_insert_by_permission" ON "public"."class_groups"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_groups_select_members" ON "public"."class_groups"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.can_access_academy_class_group(academy_id, id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_groups_update_by_permission" ON "public"."class_groups"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "csr delete operations" ON "public"."class_schedule_rules"
  FOR DELETE
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "csr insert operations" ON "public"."class_schedule_rules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "csr select members" ON "public"."class_schedule_rules"
  FOR SELECT
  TO PUBLIC
  USING (public.can_access_academy_class_group(academy_id, class_group_id));

CREATE POLICY "csr update operations" ON "public"."class_schedule_rules"
  FOR UPDATE
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canManageClasses'::text))
  WITH CHECK (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "cse delete operations" ON "public"."class_session_exceptions"
  FOR DELETE
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "cse insert operations" ON "public"."class_session_exceptions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "cse select members" ON "public"."class_session_exceptions"
  FOR SELECT
  TO PUBLIC
  USING (public.can_access_academy_class_group(academy_id, class_group_id));

CREATE POLICY "cse update operations" ON "public"."class_session_exceptions"
  FOR UPDATE
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canManageClasses'::text))
  WITH CHECK (public.has_academy_permission(academy_id, 'canManageClasses'::text));

CREATE POLICY "class_sessions_delete_by_permission" ON "public"."class_sessions"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_sessions_insert_by_permission" ON "public"."class_sessions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_sessions_select_members" ON "public"."class_sessions"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.can_access_academy_class_session(academy_id, id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "class_sessions_update_by_permission" ON "public"."class_sessions"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageClasses'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "clinic_event_students_delete_by_permission" ON "public"."clinic_event_students"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clinic_events EVENT
  WHERE ((event.id = clinic_event_students.clinic_event_id) AND public.has_academy_permission(event.academy_id, 'canEditClinicRecords'::text)))));

CREATE POLICY "clinic_event_students_insert_by_permission" ON "public"."clinic_event_students"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.clinic_events event
  WHERE ((event.id = clinic_event_students.clinic_event_id) AND public.has_academy_permission(event.academy_id, 'canEditClinicRecords'::text)))));

CREATE POLICY "clinic_event_students_select_by_permission" ON "public"."clinic_event_students"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clinic_events EVENT
  WHERE ((event.id = clinic_event_students.clinic_event_id) AND public.has_academy_permission(event.academy_id, 'canEditClinicRecords'::text)))));

CREATE POLICY "clinic_event_students_update_by_permission" ON "public"."clinic_event_students"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.clinic_events EVENT
  WHERE ((event.id = clinic_event_students.clinic_event_id) AND public.has_academy_permission(event.academy_id, 'canEditClinicRecords'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.clinic_events event
  WHERE ((event.id = clinic_event_students.clinic_event_id) AND public.has_academy_permission(event.academy_id, 'canEditClinicRecords'::text)))));

CREATE POLICY "clinic_events_delete_by_permission" ON "public"."clinic_events"
  FOR DELETE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text)));

CREATE POLICY "clinic_events_insert_by_permission" ON "public"."clinic_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_member_of_academy(academy_id) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text)));

CREATE POLICY "clinic_events_select_by_permission" ON "public"."clinic_events"
  FOR SELECT
  TO PUBLIC
  USING (public.has_academy_permission(academy_id, 'canEditClinicRecords'::text));

CREATE POLICY "clinic_events_update_by_permission" ON "public"."clinic_events"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text)))
  WITH CHECK ((public.is_member_of_academy(academy_id) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text)));

CREATE POLICY "clinic_records_delete_by_permission" ON "public"."clinic_records"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'private'::text) AND (user_id = auth.uid())) OR ((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text)))));

CREATE POLICY "clinic_records_insert_by_permission" ON "public"."clinic_records"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageStudents'::text) OR public.is_assigned_to_student(academy_id, student_id))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "clinic_records_select_members" ON "public"."clinic_records"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND (((class_session_id IS
    NOT NULL) AND public.can_access_academy_class_session(academy_id, class_session_id)) OR ((class_group_id IS
    NOT NULL) AND public.can_access_academy_class_group(academy_id, class_group_id)) OR public.can_access_academy_student(academy_id, student_id))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "clinic_records_update_by_permission" ON "public"."clinic_records"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageStudents'::text) OR public.is_assigned_to_student(academy_id, student_id))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditClinicRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageStudents'::text) OR public.is_assigned_to_student(academy_id, student_id))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "exam_results_select_by_permission" ON "public"."exam_results"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.can_access_academy_student(academy_id, student_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "exam_results_write_by_permission" ON "public"."exam_results"
  FOR ALL
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageStudents'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageStudents'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "lesson_records_delete_by_permission" ON "public"."lesson_records"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'private'::text) AND (user_id = auth.uid())) OR ((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageClasses'::text)))));

CREATE POLICY "lesson_records_insert_by_permission" ON "public"."lesson_records"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditLessonRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "lesson_records_select_members" ON "public"."lesson_records"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND (((class_session_id IS
    NOT NULL) AND public.can_access_academy_class_session(academy_id, class_session_id)) OR ((class_session_id IS NULL) AND (class_group_id IS
    NOT NULL) AND public.can_access_academy_class_group(academy_id, class_group_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "lesson_records_update_by_permission" ON "public"."lesson_records"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditLessonRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canEditLessonRecords'::text) AND
    (public.has_academy_permission(academy_id, 'canManageClasses'::text) OR ((class_session_id IS
    NOT NULL) AND public.is_assigned_to_class_session(academy_id, class_session_id)))) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payments_delete_by_permission" ON "public"."payments"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManagePayments'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payments_insert_by_permission" ON "public"."payments"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManagePayments'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payments_select_by_permission" ON "public"."payments"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canViewPayments'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payments_update_by_permission" ON "public"."payments"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManagePayments'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManagePayments'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payrolls_delete_owner" ON "public"."payrolls"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND public.is_owner_of_academy(academy_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payrolls_insert_owner" ON "public"."payrolls"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND public.is_owner_of_academy(academy_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payrolls_select_owner_or_self" ON "public"."payrolls"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR ((staff_user_id = auth.uid()) AND public.has_academy_permission(academy_id, 'canViewPayroll'::text)))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "payrolls_update_owner" ON "public"."payrolls"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND public.is_owner_of_academy(academy_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS NOT NULL) AND public.is_owner_of_academy(academy_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "product_update_reads_insert_own" ON "public"."product_update_reads"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "product_update_reads_select_own" ON "public"."product_update_reads"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

CREATE POLICY "product_update_reads_update_own" ON "public"."product_update_reads"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "profiles insert own" ON "public"."profiles"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "profiles select own" ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = id));

CREATE POLICY "profiles update own" ON "public"."profiles"
  FOR UPDATE
  TO PUBLIC
  USING ((auth.uid() = id))
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "push_devices_delete_own" ON "public"."push_devices"
  FOR DELETE
  TO PUBLIC
  USING ((user_id = auth.uid()));

CREATE POLICY "push_devices_insert_own" ON "public"."push_devices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "push_devices_select_own" ON "public"."push_devices"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

CREATE POLICY "push_devices_update_own" ON "public"."push_devices"
  FOR UPDATE
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "saLog delete operations" ON "public"."staff_attendance_logs"
  FOR DELETE
  TO PUBLIC
  USING (public.is_academy_operations_manager(academy_id));

CREATE POLICY "saLog insert self or operations" ON "public"."staff_attendance_logs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_academy_operations_manager(academy_id) OR ((staff_user_id = auth.uid()) AND public.is_member_of_academy(academy_id))));

CREATE POLICY "saLog select operations or self" ON "public"."staff_attendance_logs"
  FOR SELECT
  TO PUBLIC
  USING ((public.is_academy_operations_manager(academy_id) OR ((staff_user_id = auth.uid()) AND public.is_member_of_academy(academy_id))));

CREATE POLICY "saLog update self or operations" ON "public"."staff_attendance_logs"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_academy_operations_manager(academy_id) OR ((staff_user_id = auth.uid()) AND public.is_member_of_academy(academy_id))))
  WITH CHECK ((public.is_academy_operations_manager(academy_id) OR ((staff_user_id = auth.uid()) AND public.is_member_of_academy(academy_id))));

CREATE POLICY "student_check_events delete owner" ON "public"."student_check_events"
  FOR DELETE
  TO PUBLIC
  USING ((public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text)));

CREATE POLICY "student_check_events insert members" ON "public"."student_check_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_member_of_academy(academy_id) AND public.has_academy_permission(academy_id, 'canEditAttendance'::text)));

CREATE POLICY "student_check_events select members" ON "public"."student_check_events"
  FOR SELECT
  TO PUBLIC
  USING
    ((public.is_member_of_academy(academy_id) AND (public.has_academy_permission(academy_id, 'canViewStudents'::text) OR public.has_academy_permission(academy_id,
    'canEditAttendance'::text))));

CREATE POLICY "student_check_events update owner" ON "public"."student_check_events"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text)))
  WITH CHECK ((public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text)));

CREATE POLICY "student_events_select_by_permission" ON "public"."student_events"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.can_access_academy_student(academy_id, student_id)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "student_events_write_by_permission" ON "public"."student_events"
  FOR ALL
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageStudents'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canManageStudents'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "students_delete_by_permission" ON "public"."students"
  FOR DELETE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "students_insert_by_permission" ON "public"."students"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "students_select_by_permission" ON "public"."students"
  FOR SELECT
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND public.has_academy_permission(academy_id, 'canViewStudents'::text)) OR ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "students_update_by_permission" ON "public"."students"
  FOR UPDATE
  TO PUBLIC
  USING ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))))
  WITH CHECK ((((mode = 'academy'::text) AND (academy_id IS
    NOT NULL) AND (public.is_owner_of_academy(academy_id) OR public.has_academy_permission(academy_id, 'canManageStudents'::text))) OR
    ((mode = 'private'::text) AND (user_id = auth.uid()))));

CREATE POLICY "academy_drive objects insert active member" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'academy-drive'::text) AND public.can_upload_academy_drive_object(name)));

CREATE POLICY "academy_drive objects select owner" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'academy-drive'::text) AND public.is_owner_of_academy_drive_object(name)));

CREATE POLICY "feedback attachments delete own" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'feedback-attachments'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));

CREATE POLICY "feedback attachments insert own" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'feedback-attachments'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));

CREATE POLICY "feedback attachments select developer" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'feedback-attachments'::text) AND public.is_current_app_developer()));

CREATE POLICY "feedback attachments select own" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'feedback-attachments'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academies";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_calendar_events";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_chat_messages";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_chat_reads";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_chat_thread_members";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_chat_threads";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_invitations";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_members";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_staff_profiles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_staff_shifts";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_staff_work_exceptions";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."academy_staff_work_rules";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."attendance_records";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."class_groups";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."class_schedule_rules";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."class_session_exceptions";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."class_sessions";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."clinic_event_students";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."clinic_events";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."clinic_records";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."exam_results";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."lesson_records";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."payments";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."payrolls";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."profiles";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."staff_attendance_logs";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."student_check_events";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."students";

COMMENT ON COLUMN "public"."academies"."job_title_permissions" IS '직책별 담당 범위(role)와 기본 기능 권한. 직원별 예외는 academy_staff_profiles.permissions에 저장한다.';

COMMENT ON COLUMN "public"."academy_staff_profiles"."job_title" IS '직원의 직책. academies.job_title_permissions 기본 권한을 연결하는 키다.';

COMMENT ON COLUMN "public"."academy_staff_profiles"."permissions" IS '직책 기본 권한 위에 덮어쓰는 직원별 boolean 예외값.';

COMMENT ON COLUMN "public"."academy_staff_work_rules"."repeat_interval_weeks" IS '반복 주기: 1=매주, 2=격주. effective_start_date가 포함된 주가 첫 근무 주';

COMMENT ON COLUMN "public"."academy_staff_work_rules"."rotation_week_index" IS '2주 교대 근무 패턴 위치: 0=A주, 1=B주';

COMMENT ON COLUMN "public"."attendance_records"."checked_at" IS '등원 또는 출석 판단에 사용된 원본 시각';

COMMENT ON COLUMN "public"."attendance_records"."confirmation_state" IS 'auto_inferred=등원 기록 기반 참고값, teacher_confirmed=선생님 확정, legacy_confirmed=기존 확정 기록';

COMMENT ON COLUMN "public"."attendance_records"."confirmed_at" IS '선생님이 수업 출석 상태를 확정한 시각';

COMMENT ON COLUMN "public"."students"."grade_reference_year" IS 'grade 컬럼의 학년이 적용된 학년도. 매년 3월 수강료 단계 자동 계산에 사용한다.';

COMMENT ON EXTENSION "pg_cron" IS 'Job scheduler for PostgreSQL';

COMMENT ON FUNCTION "public"."auto_checkout_students_at_22_kst"() IS '한국 시간 22시까지 하원하지 않은 당일 등원 학생을 22:00 자동 하원 처리한다.';

COMMENT ON FUNCTION "public"."can_access_academy_student"(uuid, uuid) IS '학생 조회 권한이 있는 활성 직원에게 학원 전체 학생 관련 읽기 범위를 제공한다.';

COMMENT ON FUNCTION "public"."create_class_group_with_rules"(uuid, uuid, jsonb, jsonb) IS '반과 반복 수업 규칙을 클라이언트 UUID 기준으로 원자적·멱등 생성한다.';

COMMENT ON FUNCTION "public"."ensure_class_sessions_for_range_internal"(uuid, date, date, uuid) IS '반복 수업 규칙과 예외를 실제 class_sessions로 중복 없이 준비한다.';

COMMENT ON FUNCTION "public"."has_academy_permission"(uuid, text) IS '활성 학원 멤버의 유효 권한. 학생/연락처 관리 권한은 각각 대응 조회 권한을 포함한다.';

COMMENT ON FUNCTION "public"."set_student_contact_permissions"(uuid, uuid, boolean, boolean) IS '원장 전용 학생/보호자 연락처 권한 변경 경로. 일반 프로필 저장과 분리한다.';

COMMENT ON FUNCTION "public"."sync_completed_session_time_from_exception"() IS '오늘 완료 회차의 일회성 시간 정정을 기록 연결을 유지한 채 반영한다.';

COMMENT ON FUNCTION "public"."sync_existing_checkins_to_class_session"() IS '수업 회차보다 먼저 저장된 당일 등원을 늦게 생성·갱신된 회차의 자동 출석으로 보완한다.';

COMMENT ON FUNCTION "public"."sync_same_day_class_session_from_new_rule"() IS '당일 반 규칙 수정 시 완료 여부와 관계없이 실제 회차 시간을 최신 규칙으로 정정한다.';

COMMENT ON FUNCTION "public"."toggle_student_check_event"(uuid, uuid, text) IS '등하원 편집 권한이 있는 학원 직원이 전체 학생의 당일 등하원을 원자적으로 기록한다.';

COMMENT ON FUNCTION "public"."update_class_group_with_rules"(uuid, uuid, jsonb, jsonb, date) IS '반 정보, 반복 규칙 교체, 이전 미래 회차 취소를 한 트랜잭션으로 처리한다.';

COMMENT ON POLICY "students_select_by_permission" ON "public"."students" IS 'canViewStudents 권한이 있는 활성 직원은 학원 전체 학생 기본 정보를 조회한다. 수정 권한과 학생별 기록 RLS는 별도다.';

REVOKE ALL ON FUNCTION "public"."academy_member_has_permission"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."academy_member_has_permission"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."accept_academy_invitation"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."accept_academy_invitation"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."assign_academy_member_role"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."assign_academy_member_role"(uuid, uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."assign_random_student_checkin_pin"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."assign_random_student_checkin_pin"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."assign_student_to_class_groups_guarded"(uuid, uuid, uuid[], date, jsonb, integer, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."assign_student_to_class_groups_guarded"(uuid, uuid, uuid[], date, jsonb, integer, timestamp WITH time zone) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."audit_academy_drive_change"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."audit_academy_drive_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."auto_checkout_students_at_22_kst"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."auto_checkout_students_at_22_kst"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."can_access_academy_class_group"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_access_academy_class_group"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."can_access_academy_class_session"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_access_academy_class_session"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."can_access_academy_student"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_access_academy_student"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."can_access_chat_thread"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_access_chat_thread"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."can_manage_student_contacts"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_manage_student_contacts"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."can_upload_academy_drive_object"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_upload_academy_drive_object"(text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."can_view_student_contacts"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_view_student_contacts"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."cancel_future_shifts_for_inactive_member"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cancel_future_shifts_for_inactive_member"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."complete_assigned_class_session"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."complete_assigned_class_session"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_academy_invitation_guarded"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_academy_invitation_guarded"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_class_group_with_rules"(uuid, uuid, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_class_group_with_rules"(uuid, uuid, jsonb, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_group_chat_thread"(uuid, text, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_group_chat_thread"(uuid, text, uuid[]) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."delete_academy_calendar_event"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_academy_calendar_event"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_student_contact_write_permission"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."enforce_student_contact_write_permission"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."ensure_class_sessions_for_range"(uuid, date, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."ensure_class_sessions_for_range"(uuid, date, date, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."ensure_class_sessions_for_range_internal"(uuid, date, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."ensure_class_sessions_for_range_internal"(uuid, date, date, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_academy_drive_usage"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_academy_drive_usage"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_developer_dashboard_stats"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_developer_dashboard_stats"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_my_developer_access"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_developer_access"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_or_create_dm_thread"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_or_create_dm_thread"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_or_create_group_thread"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_or_create_group_thread"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_student_secure"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_student_secure"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."guard_academy_drive_file"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."guard_academy_drive_file"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."guard_academy_drive_folder"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."guard_academy_drive_folder"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_canceled_class_session_completion"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_canceled_class_session_record_write"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_extra_session_on_canceled_date"() TO PUBLIC, "postgres";

REVOKE ALL ON FUNCTION "public"."guard_staff_attendance_review_fields"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."guard_staff_attendance_review_fields"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."handle_auth_user_profile_upsert"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."handle_auth_user_profile_upsert"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."has_academy_permission"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."has_academy_permission"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_academy_manager"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_academy_manager"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_academy_operations_manager"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_academy_operations_manager"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_assigned_to_class_group"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_assigned_to_class_group"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_assigned_to_class_session"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_assigned_to_class_session"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_assigned_to_student"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_assigned_to_student"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_current_app_developer"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_current_app_developer"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."is_member_of_academy"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_member_of_academy"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_member_of_academy_drive_object"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_member_of_academy_drive_object"(text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_operations_manager_of_academy_drive_object"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_operations_manager_of_academy_drive_object"(text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_owner_member_of_academy"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_owner_member_of_academy"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_owner_of_academy"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_owner_of_academy"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_owner_of_academy_drive_object"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_owner_of_academy_drive_object"(text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."leave_academy"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."leave_academy"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."leave_academy"(uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."leave_academy"(uuid, date) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_chat_members"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_chat_members"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_invitation_accounts"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_invitation_accounts"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_member_profiles"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_member_profiles"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_member_profiles_v2"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_member_profiles_v2"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_role_assignment_candidates"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_role_assignment_candidates"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_staff_access_profiles"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_staff_access_profiles"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_academy_students_secure"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_academy_students_secure"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_my_pending_academy_invitations"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_my_pending_academy_invitations"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_my_private_students_secure"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_my_private_students_secure"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."list_product_feedback_for_developer"(text, text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_product_feedback_for_developer"(text, text, integer, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."manage_academy_staff_access"(uuid, uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."manage_academy_staff_access"(uuid, uuid, text, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."prepare_staff_exit_payroll"(uuid, uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."prepare_staff_exit_payroll"(uuid, uuid, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preserve_class_session_calendar_cancel_origin"() TO PUBLIC, "postgres";

REVOKE ALL ON FUNCTION "public"."protect_student_contact_permission_assignment"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."protect_student_contact_permission_assignment"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."public_student_checkin"(uuid, text, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."public_student_checkin"(uuid, text, text, bigint) TO "anon", "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."record_staff_attendance"(uuid, uuid, text, date, text, text, text, text, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."record_staff_attendance"(uuid, uuid, text, date, text, text, text, text, integer, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."register_push_device"(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."register_push_device"(text, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."remove_academy_member"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."remove_academy_member"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."remove_academy_member"(uuid, uuid, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."remove_academy_member"(uuid, uuid, date) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_academy_calendar_event"(uuid, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_academy_calendar_event"(uuid, jsonb, uuid) TO "authenticated", "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."save_academy_clinic_event"(uuid, uuid, text, date, time WITHOUT time zone, time WITHOUT time zone, text, text, uuid, text, jsonb)
  TO PUBLIC, "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."save_attendance_records_guarded"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_attendance_records_guarded"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."search_profile_by_email"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."search_profile_by_email"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_profile_by_email"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."search_profile_by_email"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."set_student_contact_permissions"(uuid, uuid, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_student_contact_permissions"(uuid, uuid, boolean, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_completed_session_time_from_exception"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_completed_session_time_from_exception"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_existing_checkins_to_class_session"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_existing_checkins_to_class_session"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_member_roles_from_job_title_policies"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_member_roles_from_job_title_policies"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_profile_email_from_auth"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_profile_email_from_auth"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_same_day_class_session_from_new_rule"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_same_day_class_session_from_new_rule"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_staff_profile_from_academy_member"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_staff_profile_from_academy_member"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_student_checkin_to_class_attendance"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."sync_student_checkin_to_class_attendance"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."toggle_student_check_event"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."toggle_student_check_event"(uuid, uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."touch_chat_thread_on_message"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."touch_chat_thread_on_message"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_class_group_with_rules"(uuid, uuid, jsonb, jsonb, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_class_group_with_rules"(uuid, uuid, jsonb, jsonb, date) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_class_group_with_rules_guarded"(uuid, uuid, jsonb, jsonb, date, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_class_group_with_rules_guarded"(uuid, uuid, jsonb, jsonb, date, timestamp WITH time zone) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_product_feedback_status_for_developer"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_product_feedback_status_for_developer"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."withdraw_account_data"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."withdraw_account_data"(uuid, text) TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academies" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academies" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academies" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academies" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_calendar_events" TO "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_calendar_events" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_calendar_events" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_calendar_events" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_messages" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_chat_messages" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_messages" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_reads" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_chat_reads" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_reads" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_thread_members" TO "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_thread_members" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_chat_thread_members" TO "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_thread_members" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_threads" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_chat_threads" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_chat_threads" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_events" TO "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_events" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_drive_events" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_events" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_files" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_drive_files" TO "authenticated", "postgres";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_files" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_folders" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_drive_folders" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_drive_folders" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_invitations" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_invitations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_invitations" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_invitations" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_members" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_members" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."academy_members" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_profiles" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_staff_profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_staff_profiles" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_profiles" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_shifts" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_staff_shifts" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_shifts" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_work_exceptions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_staff_work_exceptions" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_work_exceptions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_work_rules" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."academy_staff_work_rules" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."academy_staff_work_rules" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."app_developers" TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."attendance_records" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."attendance_records" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."attendance_records" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_groups" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_groups" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_groups" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_schedule_rules" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_schedule_rules" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_schedule_rules" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_session_exceptions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_session_exceptions" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_session_exceptions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_sessions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_sessions" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."class_sessions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_event_students" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clinic_event_students" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_event_students" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_events" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clinic_events" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_events" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_records" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clinic_records" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."clinic_records" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."developer_action_logs" TO "postgres";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."developer_action_logs" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exam_results" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exam_results" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exam_results" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."lesson_records" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_records" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."lesson_records" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payments" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payments" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payrolls" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payrolls" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."payrolls" TO "service_role";

REVOKE ALL ON TABLE "public"."product_feedback" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."product_feedback" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_feedback" TO "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_feedback" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."product_update_reads" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_update_reads" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_update_reads" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."product_update_reads" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."push_devices" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_devices" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_devices" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."staff_attendance_logs" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_attendance_logs" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."staff_attendance_logs" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."student_check_events" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_check_events" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."student_check_events" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."student_events" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_events" TO "authenticated", "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."student_events" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."students" TO "anon";

REVOKE ALL ("academy_id") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("academy_id") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("base_tuition") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("base_tuition") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("class_group_ids") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("class_group_ids") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("clinic_default_activity_type") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("clinic_default_activity_type") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("clinic_default_items") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("clinic_default_items") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("clinic_record_fields") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("clinic_record_fields") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("created_at") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("enrollment_date") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("enrollment_date") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("grade_reference_year") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("grade_reference_year") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("grade") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("grade") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("id") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("memo") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("memo") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("mode") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("mode") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("name") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("name") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("school_name") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("school_name") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("school_type") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("school_type") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("status") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("tuition_effective_from") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("tuition_effective_from") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("tuition_effective_to") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("tuition_effective_to") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("tuition_source") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("tuition_source") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("tuition_subjects") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("tuition_subjects") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."students" TO "authenticated";

REVOKE ALL ("user_id") ON TABLE "public"."students" FROM "authenticated";

GRANT SELECT ("user_id") ON TABLE "public"."students" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."students" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."students" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."students" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

SELECT cron.schedule_in_database('seenit-auto-student-checkout-kst', '*/5 13 * * *', 'select public.auto_checkout_students_at_22_kst();', 'postgres', NULL, true);

ALTER TABLE "public"."academy_calendar_events"
  ADD CONSTRAINT "academy_calendar_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX academy_calendar_events_creator_idx ON public.academy_calendar_events USING btree (academy_id, created_by, created_at DESC);

CREATE POLICY "academy_calendar_events_delete_owner_or_creator" ON "public"."academy_calendar_events"
  FOR DELETE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND ((created_by = auth.uid()) OR public.has_academy_permission(academy_id, 'canManageClasses'::text))));

CREATE POLICY "academy_calendar_events_insert_members" ON "public"."academy_calendar_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((public.is_member_of_academy(academy_id) AND (created_by = auth.uid())));

CREATE POLICY "academy_calendar_events_update_owner_or_creator" ON "public"."academy_calendar_events"
  FOR UPDATE
  TO PUBLIC
  USING ((public.is_member_of_academy(academy_id) AND ((created_by = auth.uid()) OR public.has_academy_permission(academy_id, 'canManageClasses'::text))))
  WITH CHECK ((public.is_member_of_academy(academy_id) AND ((created_by = auth.uid()) OR public.has_academy_permission(academy_id, 'canManageClasses'::text))));

ALTER TABLE "public"."academy_calendar_events"
  ADD CONSTRAINT "academy_calendar_events_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."clinic_events"
  ADD CONSTRAINT "clinic_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."product_feedback"
  ADD CONSTRAINT "product_feedback_reporter_user_id_fkey" FOREIGN KEY (reporter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "product_feedback insert own" ON "public"."product_feedback"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((reporter_user_id = auth.uid()) AND ((academy_id IS NULL) OR public.is_member_of_academy(academy_id)) AND ((screenshot_path IS NULL) OR (screenshot_path ~~
    ((auth.uid())::text || '/%'::text)))));

CREATE POLICY "product_feedback select own" ON "public"."product_feedback"
  FOR SELECT
  TO "authenticated"
  USING ((reporter_user_id = auth.uid()));

