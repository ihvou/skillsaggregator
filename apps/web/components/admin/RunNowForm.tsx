import { Play } from "lucide-react";
import type { SkillSummary } from "@skillsaggregator/shared";
import { runLinkSearcher } from "@/app/admin/actions";

interface RunNowFormProps {
  skills: SkillSummary[];
}

export function RunNowForm({ skills }: RunNowFormProps) {
  return (
    <form action={runLinkSearcher} className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-white p-4 shadow-sm sm:flex-row">
      <label className="sr-only" htmlFor="skill_id">
        Skill
      </label>
      <select
        id="skill_id"
        name="skill_id"
        className="focus-ring min-h-11 flex-1 rounded-md border border-ink/15 bg-white px-3 text-sm"
        defaultValue={skills[0]?.id}
      >
        {skills.map((skill) => (
          <option key={skill.id} value={skill.id}>
            {skill.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-court px-4 text-sm font-semibold text-white hover:bg-ink"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        Run now
      </button>
    </form>
  );
}
