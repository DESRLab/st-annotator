/**
 * TypeDoc plugin that filters warnings originating from dependency declaration
 * files (e.g. the type declarations of `three`), which cannot be suppressed
 * through configuration alone.
 */

/**
 * The "At most one \@remarks/\@returns tag" warnings raised for comments in
 * declaration files. TypeDoc emits these from a code path that bypasses the
 * `suppressCommentWarningsInDeclarationFiles` option.
 */
const DTS_COMMENT_WARNING =
  /^At most one @\w+ tag is expected in a comment, ignoring all but the first in comment at .+\.d\.ts:\d+$/;

/**
 * Unresolvable links in the Object3D comments of `@types/three` (0.159),
 * which name symbols that do not exist upstream (`Spotlight` is a typo of
 * `SpotLight`; the `Object3D<X>` names were never declarations). The comments
 * are inherited by the editor's scene classes and cannot be edited here.
 */
const THREE_BROKEN_LINK_WARNING =
  /^Failed to resolve link to "THREE\.(?:Spotlight \| Spotlight|Object3DPointLight \| PointLight|Object3DGroup \| Group|Object3DCamera \| Camera)" in comment for /;

/**
 * Links to method parameters in the Object3D comments of `@types/three`,
 * e.g. `{@link distance}` in `translateX`. The comments are inherited by the
 * editor's scene classes; since parameters have no anchors, TypeDoc already
 * rewrites each link to the parent method, which is the intended target.
 */
const THREE_PARAM_LINK_REWRITE =
  /^"(?:sta(?:\/app\/routes\/editor|\.app\/editor)|app\/editor)\.[\w$]+" links to "(?:sta(?:\/app\/routes\/editor|\.app\/editor)|app\/editor)\.DraggableBase\.(?:getObjectById\.id|setRotationFromAxisAngle\.(?:axis|angle)|setRotationFromEuler\.euler|setRotationFromMatrix\.m|translate[XYZ]\.distance|updateMatrixWorld\.force)" with text "[\w$]+" which exists but does not have a link in the documentation, will link to "(?:sta(?:\/app\/routes\/editor|\.app\/editor)|app\/editor)\.DraggableBase\.[\w$]+" instead\.$/;

/**
 * Whether the given warning is one of the intentional upstream patterns above.
 *
 * @param message The warning message TypeDoc is about to report.
 * @returns {boolean} True if the warning originates in a dependency's declaration file.
 */
function isUpstreamWarning(message) {
  return (
    typeof message === "string" &&
    (DTS_COMMENT_WARNING.test(message) ||
      THREE_BROKEN_LINK_WARNING.test(message) ||
      THREE_PARAM_LINK_REWRITE.test(message))
  );
}

/**
 * Registers the warning filter with the given TypeDoc application.
 *
 * @param app The TypeDoc application bootstrapping this plugin.
 */
export function load(app) {
  const warn = app.logger.warn.bind(app.logger);
  const validationWarning = app.logger.validationWarning.bind(app.logger);

  app.logger.warn = (message, ...args) => {
    if (isUpstreamWarning(message)) return;

    return warn(message, ...args);
  };

  // validationWarning() bumps its own counter before delegating to warn(), so
  // filtering warn() alone would leave the suppressed warnings counted by
  // treatWarningsAsErrors even though nothing is reported.
  app.logger.validationWarning = (message, ...args) => {
    if (isUpstreamWarning(message)) return;

    return validationWarning(message, ...args);
  };
}
