export type TeamMembership = { managed_player_id: string; team_id: string };

// Keep the original player ID (and all submissions) while showing every team.
export function playerTeamIds(
  player: { id: string; team_id: string },
  memberships: TeamMembership[],
): string[] {
  return [...new Set([player.team_id, ...memberships
    .filter((membership) => membership.managed_player_id === player.id)
    .map((membership) => membership.team_id)])];
}
