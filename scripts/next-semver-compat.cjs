// Next 16.2's bundled semver is marked as an ES module but does not expose a
// default export under Node 24. This preload keeps local Next commands usable
// until the project runtime moves to the supported Node LTS line.
const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedNextModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (
    request === "next/dist/compiled/semver" &&
    loaded?.__esModule &&
    !loaded.default
  ) {
    return { ...loaded, default: loaded };
  }
  return loaded;
};
