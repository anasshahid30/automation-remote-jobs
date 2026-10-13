export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      action_limits: {
        Row: {
          action: string;
          request_count: number;
          user_id: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          request_count: number;
          user_id: string;
          window_start: string;
        };
        Update: {
          action?: string;
          request_count?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      answer_library: {
        Row: {
          answer_text: string;
          category: string;
          id: string;
          question_key: string;
          question_pattern: string;
          requires_review: boolean;
          updated_at: string;
          user_id: string;
          verified_at: string | null;
          verified_by_candidate: boolean;
        };
        ComputedFields: never;
        Insert: {
          answer_text: string;
          category: string;
          id?: string;
          question_key: string;
          question_pattern: string;
          requires_review?: boolean;
          updated_at?: string;
          user_id?: string;
          verified_at?: string | null;
          verified_by_candidate?: boolean;
        };
        Update: {
          answer_text?: string;
          category?: string;
          id?: string;
          question_key?: string;
          question_pattern?: string;
          requires_review?: boolean;
          updated_at?: string;
          user_id?: string;
          verified_at?: string | null;
          verified_by_candidate?: boolean;
        };
        Relationships: [];
      };
      application_events: {
        Row: {
          application_id: string;
          details: NonNullable<Json>;
          event_type: string;
          id: string;
          occurred_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          application_id: string;
          details?: NonNullable<Json>;
          event_type: string;
          id?: string;
          occurred_at?: string;
          user_id?: string;
        };
        Update: {
          application_id?: string;
          details?: NonNullable<Json>;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_user_id_fkey";
            columns: ["application_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      application_packages: {
        Row: {
          answer_snapshot: NonNullable<Json>;
          application_id: string;
          content: NonNullable<Json>;
          created_at: string;
          facts_updated_at: string;
          id: string;
          job_updated_at: string;
          profile_updated_at: string;
          request_id: string;
          resume_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answer_snapshot: NonNullable<Json>;
          application_id: string;
          content: NonNullable<Json>;
          created_at?: string;
          facts_updated_at: string;
          id?: string;
          job_updated_at: string;
          profile_updated_at: string;
          request_id: string;
          resume_id: string;
          user_id: string;
        };
        Update: {
          answer_snapshot?: NonNullable<Json>;
          application_id?: string;
          content?: NonNullable<Json>;
          created_at?: string;
          facts_updated_at?: string;
          id?: string;
          job_updated_at?: string;
          profile_updated_at?: string;
          request_id?: string;
          resume_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_packages_application_id_user_id_fkey";
            columns: ["application_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "application_packages_resume_id_user_id_fkey";
            columns: ["resume_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      applications: {
        Row: {
          answers: NonNullable<Json>;
          applied_at: string | null;
          confirmation_evidence: Json | null;
          cover_letter: string | null;
          created_at: string;
          follow_up_at: string | null;
          id: string;
          job_id: string;
          last_error: string | null;
          notes: string;
          resume_id: string | null;
          source_account_id: string | null;
          status: string;
          submission_method: string;
          submission_reference: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          applied_at?: string | null;
          confirmation_evidence?: Json | null;
          cover_letter?: string | null;
          created_at?: string;
          follow_up_at?: string | null;
          id?: string;
          job_id: string;
          last_error?: string | null;
          notes?: string;
          resume_id?: string | null;
          source_account_id?: string | null;
          status?: string;
          submission_method?: string;
          submission_reference?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          applied_at?: string | null;
          confirmation_evidence?: Json | null;
          cover_letter?: string | null;
          created_at?: string;
          follow_up_at?: string | null;
          id?: string;
          job_id?: string;
          last_error?: string | null;
          notes?: string;
          resume_id?: string | null;
          source_account_id?: string | null;
          status?: string;
          submission_method?: string;
          submission_reference?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "job_screening_summary";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "applications_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "applications_resume_id_user_id_fkey";
            columns: ["resume_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "applications_source_account_id_user_id_fkey";
            columns: ["source_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "source_accounts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      candidate_profiles: {
        Row: {
          automation_enabled: boolean;
          availability_notes: string | null;
          city: string | null;
          country: string;
          created_at: string;
          daily_target: number;
          email: string;
          employment_types: string[];
          full_name: string;
          id: string;
          phone: string | null;
          remote_only: boolean;
          salary_currency: string;
          salary_min_monthly: number;
          salary_unknown_policy: string;
          scoring_weights: NonNullable<Json>;
          sponsorship_preferences: string | null;
          target_regions: string[];
          target_roles: string[];
          target_seniority: string[];
          timezone: string;
          updated_at: string;
          user_id: string;
          work_authorization_notes: string | null;
        };
        ComputedFields: never;
        Insert: {
          automation_enabled?: boolean;
          availability_notes?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          daily_target?: number;
          email: string;
          employment_types?: string[];
          full_name: string;
          id?: string;
          phone?: string | null;
          remote_only?: boolean;
          salary_currency?: string;
          salary_min_monthly?: number;
          salary_unknown_policy?: string;
          scoring_weights?: NonNullable<Json>;
          sponsorship_preferences?: string | null;
          target_regions?: string[];
          target_roles?: string[];
          target_seniority?: string[];
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          work_authorization_notes?: string | null;
        };
        Update: {
          automation_enabled?: boolean;
          availability_notes?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          daily_target?: number;
          email?: string;
          employment_types?: string[];
          full_name?: string;
          id?: string;
          phone?: string | null;
          remote_only?: boolean;
          salary_currency?: string;
          salary_min_monthly?: number;
          salary_unknown_policy?: string;
          scoring_weights?: NonNullable<Json>;
          sponsorship_preferences?: string | null;
          target_regions?: string[];
          target_roles?: string[];
          target_seniority?: string[];
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          work_authorization_notes?: string | null;
        };
        Relationships: [];
      };
      eligibility_checks: {
        Row: {
          checked_at: string;
          confidence: number;
          decision: string;
          evaluation_version: string;
          evidence_snapshot: NonNullable<Json>;
          evidence_urls: string[];
          factors: NonNullable<Json>;
          id: string;
          is_current: boolean;
          job_id: string;
          job_updated_at: string | null;
          match_score: number;
          pakistan_eligibility: string;
          profile_updated_at: string | null;
          reasons: string[];
          remote_check: string;
          resume_snapshot: NonNullable<Json>;
          salary_check: string;
          user_id: string;
          valid_until: string | null;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string;
          confidence: number;
          decision: string;
          evaluation_version: string;
          evidence_snapshot?: NonNullable<Json>;
          evidence_urls?: string[];
          factors?: NonNullable<Json>;
          id?: string;
          is_current?: boolean;
          job_id: string;
          job_updated_at?: string | null;
          match_score: number;
          pakistan_eligibility: string;
          profile_updated_at?: string | null;
          reasons: string[];
          remote_check: string;
          resume_snapshot?: NonNullable<Json>;
          salary_check: string;
          user_id?: string;
          valid_until?: string | null;
        };
        Update: {
          checked_at?: string;
          confidence?: number;
          decision?: string;
          evaluation_version?: string;
          evidence_snapshot?: NonNullable<Json>;
          evidence_urls?: string[];
          factors?: NonNullable<Json>;
          id?: string;
          is_current?: boolean;
          job_id?: string;
          job_updated_at?: string | null;
          match_score?: number;
          pakistan_eligibility?: string;
          profile_updated_at?: string | null;
          reasons?: string[];
          remote_check?: string;
          resume_snapshot?: NonNullable<Json>;
          salary_check?: string;
          user_id?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "eligibility_checks_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "job_screening_summary";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "eligibility_checks_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      job_classifications: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          job_updated_at: string;
          model: string;
          provider: string;
          suggestion: NonNullable<Json>;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          job_updated_at: string;
          model: string;
          provider: string;
          suggestion: NonNullable<Json>;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          job_updated_at?: string;
          model?: string;
          provider?: string;
          suggestion?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_classifications_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "job_screening_summary";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "job_classifications_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      job_reviews: {
        Row: {
          id: string;
          job_id: string;
          review: NonNullable<Json>;
          reviewed_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          job_id: string;
          review: NonNullable<Json>;
          reviewed_at?: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          review?: NonNullable<Json>;
          reviewed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_reviews_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "job_screening_summary";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "job_reviews_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      jobs: {
        Row: {
          canonical_url: string;
          company_name: string;
          created_at: string;
          description: string;
          discovered_at: string;
          disposition: string;
          duplicate_key: string | null;
          eligible_countries: string[];
          employer_region: string;
          employment_type: string | null;
          expires_at: string | null;
          external_job_id: string | null;
          id: string;
          job_title: string;
          last_checked_at: string | null;
          listing_status: string;
          normalized_url: string;
          original_url: string | null;
          posted_at: string | null;
          raw_metadata: NonNullable<Json>;
          remote_scope: string;
          restricted_countries: string[];
          role_category: string | null;
          salary_currency: string | null;
          salary_max_annual: number | null;
          salary_max_original: number | null;
          salary_min_annual: number | null;
          salary_min_original: number | null;
          salary_period: string;
          seniority: string | null;
          source_platform: string;
          updated_at: string;
          user_id: string;
          workplace_type: string;
        };
        ComputedFields: never;
        Insert: {
          canonical_url: string;
          company_name: string;
          created_at?: string;
          description: string;
          discovered_at?: string;
          disposition?: string;
          duplicate_key?: never;
          eligible_countries?: string[];
          employer_region?: string;
          employment_type?: string | null;
          expires_at?: string | null;
          external_job_id?: string | null;
          id?: string;
          job_title: string;
          last_checked_at?: string | null;
          listing_status?: string;
          normalized_url?: string;
          original_url?: string | null;
          posted_at?: string | null;
          raw_metadata?: NonNullable<Json>;
          remote_scope?: string;
          restricted_countries?: string[];
          role_category?: string | null;
          salary_currency?: string | null;
          salary_max_annual?: number | null;
          salary_max_original?: number | null;
          salary_min_annual?: number | null;
          salary_min_original?: number | null;
          salary_period?: string;
          seniority?: string | null;
          source_platform: string;
          updated_at?: string;
          user_id?: string;
          workplace_type?: string;
        };
        Update: {
          canonical_url?: string;
          company_name?: string;
          created_at?: string;
          description?: string;
          discovered_at?: string;
          disposition?: string;
          duplicate_key?: never;
          eligible_countries?: string[];
          employer_region?: string;
          employment_type?: string | null;
          expires_at?: string | null;
          external_job_id?: string | null;
          id?: string;
          job_title?: string;
          last_checked_at?: string | null;
          listing_status?: string;
          normalized_url?: string;
          original_url?: string | null;
          posted_at?: string | null;
          raw_metadata?: NonNullable<Json>;
          remote_scope?: string;
          restricted_countries?: string[];
          role_category?: string | null;
          salary_currency?: string | null;
          salary_max_annual?: number | null;
          salary_max_original?: number | null;
          salary_min_annual?: number | null;
          salary_min_original?: number | null;
          salary_period?: string;
          seniority?: string | null;
          source_platform?: string;
          updated_at?: string;
          user_id?: string;
          workplace_type?: string;
        };
        Relationships: [];
      };
      package_reviews: {
        Row: {
          id: string;
          package_id: string;
          reviewed_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          package_id: string;
          reviewed_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          package_id?: string;
          reviewed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "package_reviews_package_id_user_id_fkey";
            columns: ["package_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "application_packages";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      resume_facts: {
        Row: {
          resume_id: string;
          text_content: string;
          updated_at: string;
          user_id: string;
          verified_at: string | null;
          verified_by_candidate: boolean;
        };
        ComputedFields: never;
        Insert: {
          resume_id: string;
          text_content: string;
          updated_at?: string;
          user_id: string;
          verified_at?: string | null;
          verified_by_candidate?: boolean;
        };
        Update: {
          resume_id?: string;
          text_content?: string;
          updated_at?: string;
          user_id?: string;
          verified_at?: string | null;
          verified_by_candidate?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "resume_facts_resume_id_user_id_fkey";
            columns: ["resume_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      resumes: {
        Row: {
          created_at: string;
          experience_summary: string | null;
          file_size: number | null;
          id: string;
          is_master: boolean;
          mime_type: string | null;
          original_filename: string | null;
          parent_resume_id: string | null;
          profile_id: string;
          role_category: string;
          sha256: string | null;
          skills: string[];
          storage_path: string;
          updated_at: string;
          user_id: string;
          version_name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          experience_summary?: string | null;
          file_size?: number | null;
          id?: string;
          is_master?: boolean;
          mime_type?: string | null;
          original_filename?: string | null;
          parent_resume_id?: string | null;
          profile_id: string;
          role_category: string;
          sha256?: string | null;
          skills?: string[];
          storage_path: string;
          updated_at?: string;
          user_id?: string;
          version_name: string;
        };
        Update: {
          created_at?: string;
          experience_summary?: string | null;
          file_size?: number | null;
          id?: string;
          is_master?: boolean;
          mime_type?: string | null;
          original_filename?: string | null;
          parent_resume_id?: string | null;
          profile_id?: string;
          role_category?: string;
          sha256?: string | null;
          skills?: string[];
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
          version_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resumes_parent_resume_id_user_id_fkey";
            columns: ["parent_resume_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "resumes_profile_id_user_id_fkey";
            columns: ["profile_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "candidate_profiles";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      source_accounts: {
        Row: {
          account_email_hint: string | null;
          account_label: string;
          created_at: string;
          id: string;
          integration_method: string;
          last_checked_at: string | null;
          notes: string | null;
          platform: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          account_email_hint?: string | null;
          account_label: string;
          created_at?: string;
          id?: string;
          integration_method?: string;
          last_checked_at?: string | null;
          notes?: string | null;
          platform: string;
          status?: string;
          user_id?: string;
        };
        Update: {
          account_email_hint?: string | null;
          account_label?: string;
          created_at?: string;
          id?: string;
          integration_method?: string;
          last_checked_at?: string | null;
          notes?: string | null;
          platform?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      submission_controls: {
        Row: {
          paused: boolean;
          scope: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          paused?: boolean;
          scope: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          paused?: boolean;
          scope?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      submission_runs: {
        Row: {
          application_id: string;
          created_at: string;
          id: string;
          input_snapshot: NonNullable<Json>;
          mode: string;
          outcome_at: string | null;
          outcome_note: string | null;
          package_id: string;
          report: NonNullable<Json>;
          request_id: string;
          source_platform: string;
          source_url: string;
          state: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          application_id: string;
          created_at?: string;
          id?: string;
          input_snapshot: NonNullable<Json>;
          mode: string;
          outcome_at?: string | null;
          outcome_note?: string | null;
          package_id: string;
          report: NonNullable<Json>;
          request_id: string;
          source_platform: string;
          source_url: string;
          state: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          id?: string;
          input_snapshot?: NonNullable<Json>;
          mode?: string;
          outcome_at?: string | null;
          outcome_note?: string | null;
          package_id?: string;
          report?: NonNullable<Json>;
          request_id?: string;
          source_platform?: string;
          source_url?: string;
          state?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submission_runs_application_id_user_id_fkey";
            columns: ["application_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "submission_runs_package_id_user_id_fkey";
            columns: ["package_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "application_packages";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      job_screening_summary: {
        Row: {
          canonical_url: string | null;
          check_id: string | null;
          checked_at: string | null;
          company_name: string | null;
          created_at: string | null;
          description: string | null;
          discovered_at: string | null;
          disposition: string | null;
          duplicate_key: string | null;
          effective_decision: string | null;
          eligible_countries: string[] | null;
          employer_region: string | null;
          employment_type: string | null;
          expires_at: string | null;
          external_job_id: string | null;
          id: string | null;
          job_title: string | null;
          last_checked_at: string | null;
          listing_status: string | null;
          match_score: number | null;
          monthly_min_candidate: number | null;
          normalized_url: string | null;
          original_url: string | null;
          possible_duplicates: number | null;
          posted_at: string | null;
          raw_metadata: Json | null;
          reasons: string[] | null;
          remote_scope: string | null;
          restricted_countries: string[] | null;
          role_category: string | null;
          salary_currency: string | null;
          salary_max_annual: number | null;
          salary_max_original: number | null;
          salary_min_annual: number | null;
          salary_min_original: number | null;
          salary_period: string | null;
          screening_currency: string | null;
          screening_stale: boolean | null;
          seniority: string | null;
          source_platform: string | null;
          updated_at: string | null;
          user_id: string | null;
          workplace_type: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
    };
    Functions: {
      answer_version_snapshot: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      consume_action_budget: { Args: { p_action: string }; Returns: boolean };
      dashboard_metrics: { Args: Record<PropertyKey, never>; Returns: Json };
      database_health: { Args: Record<PropertyKey, never>; Returns: string };
      finish_submission_handoff: {
        Args: {
          p_applied_at?: string;
          p_note: string;
          p_outcome: string;
          p_run_id: string;
        };
        Returns: undefined;
      };
      import_jobs: { Args: { p_jobs: Json }; Returns: Json };
      local_time_to_utc: { Args: { p_value: string }; Returns: string };
      normalize_job_url: { Args: { p_url: string }; Returns: string };
      record_application_package: {
        Args: {
          p_answer_snapshot: Json;
          p_application_id: string;
          p_application_updated_at: string;
          p_content: Json;
          p_facts_updated_at: string;
          p_job_updated_at: string;
          p_profile_updated_at: string;
          p_request_id: string;
          p_resume_id: string;
        };
        Returns: string;
      };
      record_job_screening: {
        Args: {
          p_job_id: string;
          p_job_updated_at: string;
          p_profile_updated_at: string;
          p_result: Json;
          p_resume_snapshot: Json;
          p_review: Json;
        };
        Returns: string;
      };
      record_submission_run: {
        Args: {
          p_application_id: string;
          p_mode: string;
          p_package_id: string;
          p_report: Json;
          p_request_id: string;
          p_snapshot: Json;
        };
        Returns: string;
      };
      review_application_package: {
        Args: { p_application_updated_at: string; p_package_id: string };
        Returns: undefined;
      };
      select_resume_master: {
        Args: { p_resume_id: string };
        Returns: undefined;
      };
      submission_snapshot: {
        Args: { p_application_id: string; p_package_id: string };
        Returns: Json;
      };
      valid_scoring_weights: { Args: { p_weights: Json }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
