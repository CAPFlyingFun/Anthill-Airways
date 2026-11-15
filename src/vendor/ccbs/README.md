# Copied from the Custom Character Builder System

These five files are an unchanged copy (one import path aside) of the builder's own posing code, taken from
`CAPFlyingFun/Custom-Character-Builder-System` at commit `46f95d3` (2026-11-14):

- `src/actor/humanRig.ts`, `humanPose.ts`, `humanSkeleton.ts`, `walkWeight.ts`
- `src/view/HumanRig.ts` (here `HumanRigView.ts`)

`bellyMotion.ts` is different: an excerpt of the builder's `src/sarahlab/sarahLabTool.ts` (the belly's and bust's
springs and motion weights), not a whole file.

They make the builder body stand, breathe and walk in the DEV Room (`src/devRoom.ts`). The builder repo is
the source of truth: do not edit them here, re-copy them when the builder changes.

## The cloth tee (added 2026-11-14, same commit)

`sarahlab/` holds the builder's procedural cloth tee, for the DEV Room's CLOTH TEE test (`src/devRoomCloth.ts`):
`sarahlab/garment/*`, and from `src/sarahlab/` `clothSim.ts`, `clothSkin.ts`, `clothTypes.ts`, `clothDetail.ts`,
`detailSpots.ts`, `bodyRegions.ts`, `softBody.ts`, `breathSkin.ts`, `navelSoft.ts`, `navelPiece.ts` and `faceRig.ts`,
all unchanged but for one thing: `navelSoft.ts` has three type casts written `as unknown as Float32Array` (this
project's three.js types are stricter; nothing runs differently).

`sarahlab/sarahLabTool.ts` is an excerpt (the cloth's dials only) and `actor/humanRig.ts` a one-line pointer to the
copy above, so the copied files' own import paths still resolve.
