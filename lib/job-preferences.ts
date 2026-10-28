/** Applicant preference, independent of technical fit, star rating and application status. */
export const preferenceGroups = ['第一志望群', '第二志望群', '第三志望群'] as const;
export type PreferenceGroup = '' | typeof preferenceGroups[number];
