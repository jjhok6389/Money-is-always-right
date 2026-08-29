/** True when onboarding finished (flag) or a legacy profile has every required field. */
export function isProfileOnboarded(profile) {
  if (!profile) return false;
  if (profile.onboardingCompleted) return true;
  return Boolean(
    profile.displayName &&
      profile.age &&
      profile.occupation &&
      profile.investmentPropensity &&
      profile.targetAssetAmount != null &&
      profile.targetYears &&
      profile.goalDescription,
  );
}

/** Resolve the first authenticated destination without affecting legacy users. */
export function getPostAuthPath(profile) {
  if (!isProfileOnboarded(profile)) return '/onboarding';
  return profile?.firstReportCompleted === false
    ? '/coach-report?onboarding=1'
    : '/';
}
