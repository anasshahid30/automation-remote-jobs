import { profileContext } from "@/lib/workspace/auth";
import { JobForm } from "@/components/job-form";
export default async function NewJob() {
  const { profile } = await profileContext();
  return (
    <>
      <h1 className="page-title">Save a real listing</h1>
      <p className="my-5 text-slate-600">
        Enter the published details. This stores a record; it does not screen
        the role or submit an application.
      </p>
      <section className="panel">
        <JobForm timezone={profile?.timezone ?? "Asia/Karachi"} />
      </section>
    </>
  );
}
