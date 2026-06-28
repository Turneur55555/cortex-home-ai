export const GYMS = ["Keep Cool", "On Air"] as const;
export type GymName = (typeof GYMS)[number];
