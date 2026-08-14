import type { ModelGroupRecord, ModelRecord } from "./api";

// xLights' Layout Previews (manual: Layout tab > Layout Preview). A named preview is a view of
// *some* of the models - a way to work on the roofline without the mega tree in the way, or to
// show one section of a big yard at a time.
//
// A model belongs to a preview through an attribute on the model, or through a group that has
// one: "the Preview attribute against the model definition has been set to 'Default'", or "the
// Model is part of a Model Group where the Preview attribute has been set to 'Default'".
//
// Three previews are built in and are not stored anywhere - they are computed from what the
// models say about themselves, which is why creating one is nothing more than typing a name onto
// a model.

export const ALL_MODELS = "All Models";
export const UNASSIGNED = "Unassigned";
export const DEFAULT_PREVIEW = "Default";

/** The preview a model names for itself, if any. */
export function previewOf(model: ModelRecord): string {
  return (model.raw_attrs?.["Preview"] ?? "").trim();
}

/**
 * The preview a model is shown in, taking its groups into account.
 *
 * A model's own attribute wins. A group's is what puts a model in a preview without touching the
 * model - which is how a whole section of a yard is moved into one in a single edit.
 */
export function effectivePreview(model: ModelRecord, groups: ModelGroupRecord[]): string {
  const own = previewOf(model);
  if (own) return own;
  for (const group of groups) {
    const groupPreview = (group.params?.["Preview"] as string | undefined)?.trim();
    if (groupPreview && group.members.some((m) => m.id === model.id)) return groupPreview;
  }
  return "";
}

/**
 * Every preview that can be chosen, built-ins first.
 *
 * The named ones come from the models themselves rather than from a stored list: a preview with
 * no models in it has nothing to show, and one that existed only in a list would linger after the
 * last model left it.
 */
export function previewNames(models: ModelRecord[], groups: ModelGroupRecord[]): string[] {
  const named = new Set<string>();
  for (const model of models) {
    const preview = effectivePreview(model, groups);
    if (preview && preview !== DEFAULT_PREVIEW) named.add(preview);
  }
  return [ALL_MODELS, DEFAULT_PREVIEW, ...[...named].sort((a, b) => a.localeCompare(b)), UNASSIGNED];
}

/**
 * The models a preview shows.
 *
 * "All Models" is everything; "Unassigned" is the ones no preview claims, which is what makes a
 * model that was missed findable rather than invisible.
 */
export function modelsInPreview(models: ModelRecord[], groups: ModelGroupRecord[], preview: string): ModelRecord[] {
  if (preview === ALL_MODELS) return models;
  if (preview === UNASSIGNED) return models.filter((m) => !effectivePreview(m, groups));
  return models.filter((m) => effectivePreview(m, groups) === preview);
}
