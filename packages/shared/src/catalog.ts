import type { CategorySummary, SkillResource, SkillSummary } from "./types";

export const badmintonCategory: CategorySummary = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "badminton",
  name: "Badminton",
  description:
    "A focused library of technique, movement, strategy, and equipment resources for badminton learners.",
};

const badmintonSkillRows: Array<[string, string, string]> = [
  ["Forehand clear", "forehand-clear", "Send the shuttle deep from the rear court with a relaxed overhead action."],
  ["Backhand clear", "backhand-clear", "Recover from pressure with a compact backhand clear toward the rear court."],
  ["Forehand smash", "forehand-smash", "Generate steep power from rotation, timing, contact point, and follow-through."],
  ["Backhand smash", "backhand-smash", "Use a short backhand action to attack from awkward rear-court positions."],
  ["Drop shot", "drop-shot", "Disguise soft overhead shots that pull opponents into the front court."],
  ["Net shot", "net-shot", "Control tight spinning replies close to the tape."],
  ["Drive", "drive", "Play fast flat exchanges through the mid-court with compact preparation."],
  ["Lift", "lift", "Lift from the front court to reset rallies or move opponents backward."],
  ["Push", "push", "Push the shuttle into open mid-court spaces with quick racket preparation."],
  ["Serve (high)", "serve-high", "Use a high serve to start singles rallies with depth and height."],
  ["Serve (low)", "serve-low", "Keep low serves tight and legal for doubles and singles pressure."],
  ["Footwork (front court)", "footwork-front-court", "Move efficiently into lunges and recover from front-court shots."],
  ["Footwork (rear court)", "footwork-rear-court", "Reach rear-court corners with chasse, scissor, and recovery steps."],
  ["Footwork (split step)", "footwork-split-step", "Time the split step to react explosively to the opponent's hit."],
  ["Defense (block)", "defense-block", "Absorb smashes and guide controlled blocks into the front court."],
  ["Defense (lift)", "defense-lift", "Defend hard attacks by lifting high and deep under pressure."],
  ["Singles strategy", "singles-strategy", "Construct rallies with space, patience, tempo, and recovery position."],
  ["Doubles rotation", "doubles-rotation", "Coordinate attack, defense, and side-by-side rotations with a partner."],
  ["Grip technique", "grip-technique", "Switch between forehand, backhand, bevel, and panhandle grips cleanly."],
  ["Wrist rotation", "wrist-rotation", "Use forearm and wrist rotation for deception, speed, and control."],
  ["Stringing and tension", "stringing-and-tension", "Understand string choice and tension tradeoffs for feel, control, and power."],
];

export const badmintonSkills: SkillSummary[] = badmintonSkillRows.map(([name, slug, description], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 101).padStart(12, "0")}`,
  category_id: badmintonCategory.id,
  category_slug: badmintonCategory.slug,
  name,
  slug,
  description,
  resource_count: 0,
}));

export const fallbackResources: Record<string, SkillResource[]> = {
  "forehand-smash": [
    {
      id: "demo-relation-forehand-smash-1",
      public_note: "Clear demonstration of rotation, contact height, and recovery after the smash.",
      skill_level: "intermediate",
      upvote_count: 8,
      link: {
        id: "demo-link-forehand-smash-1",
        url: "https://www.youtube.com/results?search_query=badminton+forehand+smash+tutorial",
        canonical_url: "https://www.youtube.com/results?search_query=badminton+forehand+smash+tutorial",
        domain: "youtube.com",
        title: "Badminton forehand smash tutorials",
        description: "Search-backed demo placeholder until the ingestion pipeline is run.",
        thumbnail_url: null,
        content_type: "video",
      },
    },
  ],
};
