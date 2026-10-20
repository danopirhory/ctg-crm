import { Badge } from "@/components/ui/badge";

// Maps every status string from the schema to one of shadcn's badge variants
// so the table renders consistently colored pills across pages.
const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  // Candidate
  New: "secondary",
  Contacted: "secondary",
  Screened: "secondary",
  Qualified: "default",
  Submitted: "default",
  Interviewing: "default",
  Offer: "default",
  Placed: "default",
  "Passed Over": "destructive",
  "Not Fit": "outline",
  Archived: "outline",

  // Company
  Prospect: "secondary",
  "Discovery Call": "secondary",
  "Agreement Sent": "default",
  "Active Client": "default",
  Inactive: "outline",
  "Do Not Contact": "destructive",

  // Job
  Open: "default",
  Paused: "secondary",
  Filled: "outline",
  Closed: "outline",

  // Match (some overlap with candidate; defined again to be explicit)
  "Potential Match": "secondary",
  "Interview Requested": "default",
  Rejected: "destructive",
  Withdrawn: "outline",

  // Invoice
  "Not Invoiced": "secondary",
  Invoiced: "default",
  Paid: "default",
  "Past Due": "destructive",
  Refunded: "outline",
};

export function StatusBadge({ value }: { value: string }) {
  const variant = VARIANT[value] ?? "secondary";
  // With red as the brand/primary color, positive statuses render as
  // black pills instead of bg-primary so red keeps its alert meaning.
  if (variant === "default") {
    return (
      <Badge className="border-transparent bg-foreground text-background">
        {value}
      </Badge>
    );
  }
  return <Badge variant={variant}>{value}</Badge>;
}
