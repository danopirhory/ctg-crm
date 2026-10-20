// Hand-written database types mirroring supabase/migrations/0001_initial_schema.sql.
// When the schema changes, update both. Later we can swap this for output of
// `supabase gen types typescript --linked > src/lib/db/types.ts`.

export type CandidateStatus =
  | "New"
  | "Resume Sent"
  | "Contacted"
  | "Screened"
  | "Qualified"
  | "Submitted"
  | "Interviewing"
  | "Offer"
  | "Placed"
  | "Passed Over"
  | "Not Fit"
  | "Archived";

export type CompanyStatus =
  | "Prospect"
  | "Contacted"
  | "Discovery Call"
  | "Agreement Sent"
  | "Active Client"
  | "Inactive"
  | "Do Not Contact";

export type JobStatus = "Open" | "Paused" | "Filled" | "Closed";

export type TaskStatus = "Open" | "In Progress" | "Complete" | "Archived";

// Three company-level narrative panels rendered at the head and foot
// of the review document. The AI drafts these from the underlying
// per-(candidate, job) reviews; recruiter edit support is planned but
// not yet wired through the UI.
export type CompanyReviewNarrative = {
  key_takeaways: string[];
  next_steps: string[];
  notes: string[];
  generated_at: string | null;
  ai_model: string | null;
};

// Frozen JSON payload of a /reviews snapshot. Shape mirrors the live
// review document at the moment the snapshot was taken so it renders
// standalone regardless of later changes.
export type ReviewSnapshotPayload = {
  company: {
    id: string;
    company_name: string;
    industry: string | null;
    location: string | null;
  };
  narrative: CompanyReviewNarrative;
  jobs: {
    id: string;
    title: string;
    location: string | null;
    rubric: { criterion: string; weight: number }[];
  }[];
  candidates: {
    id: string;
    first_name: string;
    last_name: string;
    location: string | null;
    rank: string | null;
    military_branch: string | null;
    reviews: {
      job_id: string;
      state: "pending-resume" | "ready" | "manual";
      background: string[];
      strengths: string[];
      areas_to_validate: string[];
      interview_focus: string[];
      role_fit_score: number | null;
      rubric_scores: { criterion: string; score: number; weight: number }[];
    }[];
  }[];
  rankings: Record<string, string[]>; // job_id → ordered candidate_ids
  ai_model: string | null;
  taken_at: string;
};

export type RoleRubricEntry = { criterion: string; weight: number };

export type MatchStatus =
  | "Potential Match"
  | "Submitted"
  | "Interview Requested"
  | "Interviewing"
  | "Offer"
  | "Placed"
  | "Rejected"
  | "Withdrawn";

export type InvoiceStatus =
  | "Not Invoiced"
  | "Invoiced"
  | "Paid"
  | "Past Due"
  | "Refunded";

export type EmployeeRole = "Admin" | "Recruiter" | "Viewer";

type Iso = string; // ISO timestamp / date

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          auth_user_id: string;
          first_name: string;
          last_name: string;
          email: string;
          role: EmployeeRole;
          active: boolean;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Omit<
          Database["public"]["Tables"]["employees"]["Row"],
          "id" | "created_at" | "updated_at" | "active"
        > & { id?: string; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["employees"]["Row"]>;
        Relationships: [];
      };
      candidates: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          military_branch: string | null;
          rank: string | null;
          mos_or_specialty: string | null;
          clearance: string | null;
          years_of_service: number | null;
          target_industry: string | null;
          target_location: string | null;
          resume_url: string | null;
          linkedin: string | null;
          status: CandidateStatus;
          source: string | null;
          tags: string[];
          marketing_consent: boolean;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["candidates"]["Row"]> & {
          first_name: string;
          last_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Row"]>;
        Relationships: [];
      };
      companies: {
        Row: {
          id: string;
          company_name: string;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          industry: string | null;
          location: string | null;
          hiring_needs: string | null;
          status: CompanyStatus;
          notes: string | null;
          compensation_type: "Flat" | "Percent";
          compensation_flat_fee: number;
          compensation_fee_percentage: number;
          review_key_takeaways: string[];
          review_next_steps: string[];
          review_notes: string[];
          review_narrative_generated_at: Iso | null;
          review_narrative_ai_model: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["companies"]["Row"]> & {
          company_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["companies"]["Row"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          location: string | null;
          salary_min: number | null;
          salary_max: number | null;
          job_type: string | null;
          description: string | null;
          requirements: string | null;
          status: JobStatus;
          role_rubric: RoleRubricEntry[] | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["jobs"]["Row"]> & {
          company_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_notes: {
        Row: {
          id: string;
          candidate_id: string | null;
          prospect_id: string | null;
          employee_id: string | null;
          note: string;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["candidate_notes"]["Row"]
        > & { note: string };
        Update: Partial<Database["public"]["Tables"]["candidate_notes"]["Row"]>;
        Relationships: [];
      };
      company_notes: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string | null;
          note: string;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["company_notes"]["Row"]
        > & { company_id: string; note: string };
        Update: Partial<Database["public"]["Tables"]["company_notes"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          due_date: Iso | null;
          status: TaskStatus;
          related_candidate_id: string | null;
          related_company_id: string | null;
          assigned_to: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & {
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          verb: string;
          summary: string;
          actor_employee_id: string | null;
          candidate_id: string | null;
          company_id: string | null;
          prospect_id: string | null;
          job_id: string | null;
          metadata: Record<string, unknown>;
          created_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["activities"]["Row"]> & {
          verb: string;
          summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["activities"]["Row"]>;
        Relationships: [];
      };
      email_templates: {
        Row: {
          id: string;
          name: string;
          subject: string;
          body: string;
          created_by: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["email_templates"]["Row"]
        > & { name: string; subject: string; body: string };
        Update: Partial<Database["public"]["Tables"]["email_templates"]["Row"]>;
        Relationships: [];
      };
      email_campaigns: {
        Row: {
          id: string;
          name: string;
          list_id: string | null;
          subject: string;
          body: string;
          from_name: string;
          reply_to: string | null;
          status: "Draft" | "Sending" | "Sent" | "Failed";
          recipient_prospect_ids: string[] | null;
          kind: "campaign" | "quick";
          attachments: { path: string; filename: string; size: number }[];
          total_recipients: number;
          sent_count: number;
          failed_count: number;
          created_by: string | null;
          sent_at: Iso | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["email_campaigns"]["Row"]
        > & { name: string };
        Update: Partial<Database["public"]["Tables"]["email_campaigns"]["Row"]>;
        Relationships: [];
      };
      email_sends: {
        Row: {
          id: string;
          campaign_id: string;
          prospect_id: string | null;
          email: string;
          resend_id: string | null;
          status:
            | "queued"
            | "sent"
            | "delivered"
            | "opened"
            | "clicked"
            | "bounced"
            | "complained"
            | "failed"
            | "unsubscribed";
          error: string | null;
          unsubscribe_token: string;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["email_sends"]["Row"]> & {
          campaign_id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_sends"]["Row"]>;
        Relationships: [];
      };
      email_suppressions: {
        Row: {
          email: string;
          reason: "unsubscribed" | "bounced" | "complained" | "manual";
          source_campaign_id: string | null;
          created_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["email_suppressions"]["Row"]
        > & {
          email: string;
          reason: "unsubscribed" | "bounced" | "complained" | "manual";
        };
        Update: Partial<
          Database["public"]["Tables"]["email_suppressions"]["Row"]
        >;
        Relationships: [];
      };
      candidate_job_matches: {
        Row: {
          id: string;
          candidate_id: string;
          job_id: string;
          match_status: MatchStatus;
          submitted_at: Iso | null;
          interview_date: Iso | null;
          offer_date: Iso | null;
          placement_date: Iso | null;
          notes: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["candidate_job_matches"]["Row"]
        > & { candidate_id: string; job_id: string };
        Update: Partial<
          Database["public"]["Tables"]["candidate_job_matches"]["Row"]
        >;
        Relationships: [];
      };
      placements: {
        Row: {
          id: string;
          candidate_id: string;
          company_id: string;
          job_id: string;
          placement_date: Iso;
          starting_salary: number | null;
          fee_percentage: number | null;
          flat_fee: number | null;
          invoice_status: InvoiceStatus;
          guarantee_end_date: Iso | null;
          job_status_before: string | null;
          candidate_status_before: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["placements"]["Row"]> & {
          candidate_id: string;
          company_id: string;
          job_id: string;
          placement_date: Iso;
        };
        Update: Partial<Database["public"]["Tables"]["placements"]["Row"]>;
        Relationships: [];
      };
      candidate_job_review: {
        Row: {
          id: string;
          candidate_id: string;
          job_id: string;
          background: string[];
          strengths: string[];
          areas_to_validate: string[];
          interview_focus: string[];
          role_fit_score: number | null;
          rubric_scores:
            | { criterion: string; score: number; weight: number }[]
            | null;
          ai_model: string | null;
          ai_generated_at: Iso | null;
          edited_at: Iso | null;
          edited_by: string | null;
          state: "pending-resume" | "ready" | "manual";
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["candidate_job_review"]["Row"]
        > & {
          candidate_id: string;
          job_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["candidate_job_review"]["Row"]
        >;
        Relationships: [];
      };
      candidate_review_snapshot: {
        Row: {
          id: string;
          company_id: string;
          label: string | null;
          payload: ReviewSnapshotPayload;
          ai_model: string | null;
          taken_by: string | null;
          created_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["candidate_review_snapshot"]["Row"]
        > & {
          company_id: string;
          payload: ReviewSnapshotPayload;
        };
        Update: Partial<
          Database["public"]["Tables"]["candidate_review_snapshot"]["Row"]
        >;
        Relationships: [];
      };
      prospect_lists: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          source: string | null;
          consent_confirmed_at: Iso | null;
          kind: "Candidate" | "Company";
          sort_order: number | null;
          assigned_to: "Recruiter A" | "Recruiter B" | "Recruiter C" | "Team" | null;
          parent_list_id: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<
          Database["public"]["Tables"]["prospect_lists"]["Row"]
        > & { name: string };
        Update: Partial<Database["public"]["Tables"]["prospect_lists"]["Row"]>;
        Relationships: [];
      };
      prospects: {
        Row: {
          id: string;
          list_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          company_name: string | null;
          industry: string | null;
          hiring_needs: string | null;
          location: string | null;
          notes: string | null;
          marketing_consent: boolean;
          converted_to_candidate_id: string | null;
          converted_to_company_id: string | null;
          resume_url: string | null;
          linkedin: string | null;
          military_branch: string | null;
          rank: string | null;
          mos_or_specialty: string | null;
          clearance: string | null;
          years_of_service: number | null;
          tags: string[];
          source: string | null;
          pipeline_stage: "Prospect" | "Candidate" | "Company";
          previous_pipeline_stage: "Prospect" | "Candidate" | "Company" | null;
          snapshot_candidate_status: string | null;
          snapshot_company_status: string | null;
          created_at: Iso;
          updated_at: Iso;
        };
        Insert: Partial<Database["public"]["Tables"]["prospects"]["Row"]> & {
          list_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["prospects"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "prospects_list_id_fkey";
            columns: ["list_id"];
            referencedRelation: "prospect_lists";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_active_employee: { Args: Record<string, never>; Returns: boolean };
      current_employee_role: { Args: Record<string, never>; Returns: string };
    };
    Enums: Record<string, never>;
  };
};

// Convenience row aliases.
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
