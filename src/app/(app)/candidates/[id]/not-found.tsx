import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../_components/page-header";

export default function CandidateNotFound() {
  return (
    <>
      <PageHeader title="Candidate not found" />
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-8">
          <p className="text-sm text-muted-foreground">
            This candidate doesn&apos;t exist, was deleted, or you don&apos;t
            have permission to view it.
          </p>
          <Button asChild variant="outline">
            <Link href="/candidates">Back to candidates</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
