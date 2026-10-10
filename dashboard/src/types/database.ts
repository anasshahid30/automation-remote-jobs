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
          evidence_urls: string[];
          factors: NonNullable<Json>;
          id: string;
          job_id: string;
          match_score: number;
          pakistan_eligibility: string;
          reasons: string[];
          remote_check: string;
          salary_check: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string;
          confidence: number;
          decision: string;
          evaluation_version: string;
          evidence_urls?: string[];
          factors?: NonNullable<Json>;
          id?: string;
          job_id: string;
          match_score: number;
          pakistan_eligibility: string;
          reasons: string[];
          remote_check: string;
          salary_check: string;
          user_id?: string;
        };
        Update: {
          checked_at?: string;
          confidence?: number;
          decision?: string;
          evaluation_version?: string;
          evidence_urls?: string[];
          factors?: NonNullable<Json>;
          id?: string;
          job_id?: string;
          match_score?: number;
          pakistan_eligibility?: string;
          reasons?: string[];
          remote_check?: string;
          salary_check?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eligibility_checks_job_id_user_id_fkey";
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
          eligible_countries: string[];
          employment_type: string | null;
          expires_at: string | null;
          external_job_id: string | null;
          id: string;
          job_title: string;
          last_checked_at: string | null;
          listing_status: string;
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
          eligible_countries?: string[];
          employment_type?: string | null;
          expires_at?: string | null;
          external_job_id?: string | null;
          id?: string;
          job_title: string;
          last_checked_at?: string | null;
          listing_status?: string;
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
          eligible_countries?: string[];
          employment_type?: string | null;
          expires_at?: string | null;
          external_job_id?: string | null;
          id?: string;
          job_title?: string;
          last_checked_at?: string | null;
          listing_status?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      consume_action_budget: { Args: { p_action: string }; Returns: boolean };
      dashboard_metrics: { Args: Record<PropertyKey, never>; Returns: Json };
      database_health: { Args: Record<PropertyKey, never>; Returns: string };
      local_time_to_utc: { Args: { p_value: string }; Returns: string };
      select_resume_master: {
        Args: { p_resume_id: string };
        Returns: undefined;
      };
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
