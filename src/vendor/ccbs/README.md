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

## Her head: hairstyles, hair colours, face shapes (added 2026-11-15, builder commit `6e0b67b`, v0.9.27)

From `src/sarahlab/`, unchanged: `headLook.ts`, `hairStyles.ts`, `hairColours.ts`, `hairMaterial.ts`, `faceLook.ts`,
`faceShapes.ts`, `faceShapeFields.ts`, and `faceRig.ts` re-copied at this commit (it gained the chosen lip colour).

The DEV Room (`src/devRoom.ts`) uses the hairstyles' LIGHT files, the hair colour ramp and the seven face types.
Not used yet: `faceLook.ts` (eye, brow and lip colours need the builder's face layer, `faceRig.ts`, on her skin's
material, which the room's stand-in painted outfit does not carry) and the builder's sixteen painted tops
(`topCut.ts`, `topDetails.ts`, `paintTemplates.ts`, `fabricMaterial.ts`: not copied; the room still paints its own
stand-in tee and leggings).

## The crowd in the airport (2026-11-17, compared against builder commit `764f7c7`, v0.9.40)

`src/devRoom.ts` can now run inside a game's own scene (`startDevRoom({ scene, camera, renderer })`: its `Crowd`):
the airport's female passengers are its people (`src/tycoon/passengers.ts`). Her body and hairstyles still load from
the builder's own site, so they are always its latest; the hair, hair colour and face files copied here were compared
with v0.9.40 and are unchanged since `6e0b67b`. Not re-copied: `softBody.ts`, `bodyRegions.ts`, `garmentCloth.ts`
(small changes in the builder since) and the builder's newer garments (its cloth shirt, tunic and brief, its sixteen
painted tops and the drawn bottoms): the airport's women wear the one cloth tee the DEV Room has, frozen once dressed,
or its painted tee, over painted leggings.

## His body, his hair and his face's frame (2026-11-22, builder commit `1b53eae`, v0.9.72)

Re-copied unchanged from `src/sarahlab/`: `faceRig.ts`, `faceShapeFields.ts`, `hairStyles.ts` (it gained
`MALE_HAIR_STYLES`), `hairMaterial.ts`, `headLook.ts`, `faceLook.ts`; added `maleFace.ts` (his face's frame,
`MALE_FACE`). The posing code (`humanRig.ts`, `humanPose.ts`, `humanSkeleton.ts`, `walkWeight.ts`, `HumanRig.ts`)
was compared and is the same: it finds bones by role, so it poses him as it poses her.

The crowd (`src/devRoom.ts`) loads the builder's `male-base.glb` and his twelve hairstyles' light files
(`models/hair/male/`) once her body is in, and the airport's men are his from then on. His file stores its points
interleaved; the crowd unpacks it as it is read (`deinterleave`). His clothes are the room's stand-in paint, laid
by his own fit (`FIT_HIM`).
