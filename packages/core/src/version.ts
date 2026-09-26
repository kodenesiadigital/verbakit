export const CORE_VERSION = '0.1.0';

/** Simple semver ">=x.y.z" check used for plugin host compatibility gates. */
export function satisfiesRequires(requires: string | undefined, coreVersion = CORE_VERSION): boolean {
  if (!requires) return true;
  const match = /^>=v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(requires);
  if (!match) return false;
  const applyVersion = (raw: string, fallback: number): number => {
    const n = Number(raw ?? '');
    return Number.isFinite(n) ? n : fallback;
  };
  const [coreMajor = 0, coreMinor = 0, corePatch = 0] = coreVersion.split('.').map((part, i) => applyVersion(part, i === 0 ? 0 : 0));
  const [, reqMajorStr = '0', reqMinorStr = '0', reqPatchStr = '0'] = match;
  const reqMajor = Number(reqMajorStr);
  const reqMinor = Number(reqMinorStr);
  const reqPatch = Number(reqPatchStr);

  if (coreMajor !== reqMajor) return coreMajor > reqMajor;
  if (coreMinor !== reqMinor) return coreMinor > reqMinor;
  return corePatch >= reqPatch;
}