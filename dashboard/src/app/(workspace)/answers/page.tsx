import { profileContext } from "@/lib/workspace/auth";
import { categories } from "@/lib/preparation/engine";
import { FormPanel } from "@/components/form-panel";
import { TextArea, SelectField } from "@/components/fields";
import { saveAnswer } from "./actions";

function AnswerFields({
  answer,
}: {
  answer?: { id: string; question_pattern: string; answer_text: string; category: string };
}) {
  return (
    <>
      <TextArea
        name="question"
        id={answer ? `${answer.id}-question` : undefined}
        label="Exact employer question"
        value={answer?.question_pattern}
        maxLength={500}
        required
        help="Punctuation and capitalization are normalized. Similar or partial questions do not reuse this answer."
      />
      <TextArea
        name="answer"
        id={answer ? `${answer.id}-answer` : undefined}
        label="Your factual answer"
        value={answer?.answer_text}
        maxLength={5000}
        required
      />
      <SelectField
        name="category"
        id={answer ? `${answer.id}-category` : undefined}
        label="Question category"
        value={answer?.category ?? "routine"}
        options={categories.map((c) => [c, c])}
      />
      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="requires_review"
          value="yes"
          defaultChecked
        />
        Require review for each application
      </label>
      <label className="flex gap-3 text-sm">
        <input type="checkbox" name="verified" value="yes" required />I have
        verified this answer against my actual circumstances.
      </label>
    </>
  );
}
export default async function Answers() {
  const { client, user } = await profileContext();
  const { data: answers, error } = await client
    .from("answer_library")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Answers could not be loaded.");
  return (
    <>
      <h1 className="page-title">Verified answer library</h1>
      <p className="mt-3 mb-6 text-slate-600">
        Save exact, factual answers. Sponsorship, legal declarations,
        assessments, commitments and salary questions always require
        application-specific review.
      </p>
      <section className="panel">
        <h2 className="mb-5 text-xl font-semibold">Add a verified answer</h2>
        <FormPanel
          action={saveAnswer}
          id="answer-add"
          label="Save verified answer"
        >
          <AnswerFields />
        </FormPanel>
      </section>
      <h2 className="mt-8 mb-4 text-xl font-semibold">Saved answers</h2>
      {!answers.length && (
        <p className="panel">
          No verified answers yet. Unresolved questions will remain unanswered.
        </p>
      )}
      {answers.map((answer) => (
        <details className="panel mb-4" key={answer.id}>
          <summary className="cursor-pointer font-semibold">
            {answer.question_pattern}
          </summary>
          <div className="mt-5">
            <FormPanel
              action={saveAnswer}
              id={`answer-${answer.id}`}
              label="Update verified answer"
            >
              <input type="hidden" name="id" value={answer.id} />
              <input
                type="hidden"
                name="updated_at"
                value={answer.updated_at}
              />
              <AnswerFields answer={answer} />
            </FormPanel>
          </div>
        </details>
      ))}
      <p className="mt-4 text-sm text-slate-600">
        Most recent 100 answers. Editing an answer makes existing application
        packages stale.
      </p>
    </>
  );
}
