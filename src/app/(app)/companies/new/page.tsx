import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../../_components/page-header";
import { CompanyForm } from "../_components/company-form";

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader
        title="New company"
        description="Add a client company to the CRM."
      />
      <Card>
        <CardContent className="pt-6">
          <CompanyForm mode="create" />
        </CardContent>
      </Card>
    </>
  );
}
