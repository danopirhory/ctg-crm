import type {
  CandidateStatus,
  CompanyStatus,
  InvoiceStatus,
  JobStatus,
  MatchStatus,
  TaskStatus,
} from "./types";

export const INVOICE_STATUSES = [
  "Not Invoiced",
  "Invoiced",
  "Paid",
  "Past Due",
  "Refunded",
] as const satisfies readonly InvoiceStatus[];

export const MATCH_STATUSES = [
  "Potential Match",
  "Submitted",
  "Interview Requested",
  "Interviewing",
  "Offer",
  "Placed",
  "Rejected",
  "Withdrawn",
] as const satisfies readonly MatchStatus[];

export const JOB_STATUSES = [
  "Open",
  "Paused",
  "Filled",
  "Closed",
] as const satisfies readonly JobStatus[];

export const TASK_STATUSES = [
  "Open",
  "In Progress",
  "Complete",
  "Archived",
] as const satisfies readonly TaskStatus[];

export const PROSPECT_LIST_KINDS = ["Candidate", "Company"] as const;
export type ProspectListKind = (typeof PROSPECT_LIST_KINDS)[number];

// Who a lead list is assigned to ("Team" = the whole team). Must match
// the check constraint on prospect_lists.assigned_to.
export const LEAD_LIST_ASSIGNEES = [
  "Recruiter A",
  "Recruiter B",
  "Recruiter C",
  "Team",
] as const;
export type LeadListAssignee = (typeof LEAD_LIST_ASSIGNEES)[number];

export const COMPANY_STATUSES = [
  "Prospect",
  "Contacted",
  "Discovery Call",
  "Agreement Sent",
  "Active Client",
  "Inactive",
  "Do Not Contact",
] as const satisfies readonly CompanyStatus[];

export const CANDIDATE_STATUSES = [
  "New",
  "Resume Sent",
  "Contacted",
  "Screened",
  "Qualified",
  "Submitted",
  "Interviewing",
  "Offer",
  "Placed",
  "Passed Over",
  "Not Fit",
  "Archived",
] as const satisfies readonly CandidateStatus[];

export const MILITARY_BRANCHES = [
  "Army",
  "Navy",
  "Air Force",
  "Marines",
  "Coast Guard",
  "Space Force",
] as const;
export type MilitaryBranch = (typeof MILITARY_BRANCHES)[number];

export const CLEARANCE_LEVELS = [
  "None",
  "Public Trust",
  "Confidential",
  "Secret",
  "Top Secret",
  "TS/SCI",
] as const;
export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[number];
