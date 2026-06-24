import { redirect } from "next/navigation";
import { AccountDeleteForm } from "@/components/AccountDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { getAuthSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Delete account",
};

export default async function DeleteAccountPage() {
  const supabase = await getAuthSupabase();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) redirect("/sign-in?next=/account/delete");

  return (
    <div className="pb-20">
      <PageHeader
        title="Delete account"
        subtitle="Remove your Subskills account and private account state."
        backHref="/"
      />
      <section className="mx-auto max-w-5xl px-4">
        <AccountDeleteForm />
      </section>
    </div>
  );
}
