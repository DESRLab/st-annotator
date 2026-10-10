// TypeDoc copies sidebar URLs verbatim, so make the API index link relative to
// the documentation root for every page depth (and for subpath deployments).
const apiReferenceLink = document.querySelector(
  '#tsd-sidebar-links a[href="../index.html"]',
);

if (apiReferenceLink) {
  const docsRoot = document.documentElement.dataset.base || "./";
  apiReferenceLink.href = `${docsRoot}../index.html`;
}
