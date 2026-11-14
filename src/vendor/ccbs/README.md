# Copied from the Custom Character Builder System

These five files are an unchanged copy (one import path aside) of the builder's own posing code, taken from
`CAPFlyingFun/Custom-Character-Builder-System` at commit `46f95d3` (2026-11-14):

- `src/actor/humanRig.ts`, `humanPose.ts`, `humanSkeleton.ts`, `walkWeight.ts`
- `src/view/HumanRig.ts` (here `HumanRigView.ts`)

`bellyMotion.ts` is different: an excerpt of the builder's `src/sarahlab/sarahLabTool.ts` (the belly's and bust's
springs and motion weights), not a whole file.

They make the builder body stand, breathe and walk in the DEV Room (`src/devRoom.ts`). The builder repo is
the source of truth: do not edit them here, re-copy them when the builder changes.
