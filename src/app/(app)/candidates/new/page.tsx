import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../_components/page-header";
import { CandidateForm } from "../_components/candidate-form";

export default function NewCandidatePage() {
  return (
    <>
      <PageHeader
        title="New candidate"
        description="Add a candidate to your pipeline."
      />
      <Card>
        <CardContent className="pt-6">
          <CandidateForm mode="create" />
        </CardContent>
      </Card>
    </>
  );
}
