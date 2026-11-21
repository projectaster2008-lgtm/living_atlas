import {
  DialogueNode,
  NpcProfile,
  NpcRuntimeState,
  RelationshipAxes,
  WeatherKind,
} from '../../shared/types/world';

export interface DialogueContext {
  clockSec: number;
  hourOfDay: number;
  weather: WeatherKind;
  worldFlags: Set<string>;
  activeMissionIds: Set<string>;
  relationship: RelationshipAxes;
}

export class DialogueEngine {
  private cooldowns = new Map<string, number>(); // `${npcId}:${nodeId}` -> readyAtClockSec
  private recentByNpc = new Map<string, string[]>();

  load(cooldowns: Record<string, number>, recent: Record<string, string[]>): void {
    this.cooldowns.clear();
    for (const [k, v] of Object.entries(cooldowns)) {
      this.cooldowns.set(k, v);
    }
    this.recentByNpc.clear();
    for (const [k, v] of Object.entries(recent)) {
      this.recentByNpc.set(k, [...v]);
    }
  }

  reset(): void {
    this.cooldowns.clear();
    this.recentByNpc.clear();
  }

  selectNode(profile: NpcProfile, runtime: NpcRuntimeState, ctx: DialogueContext): DialogueNode {
    const recent = this.recentByNpc.get(profile.id) ?? [];

    let bestNode: DialogueNode | null = null;
    let bestScore = -Infinity;

    for (const node of profile.dialoguePool) {
      // Eligibility checks
      if (node.minFamiliarity !== undefined && ctx.relationship.familiarity < node.minFamiliarity) {
        continue;
      }
      if (node.minTrust !== undefined && ctx.relationship.trust < node.minTrust) {
        continue;
      }
      if (node.weatherMatch && !node.weatherMatch.includes(ctx.weather)) {
        continue;
      }
      if (node.timeRange) {
        const [start, end] = node.timeRange;
        if (start <= end) {
          if (ctx.hourOfDay < start || ctx.hourOfDay > end) continue;
        } else {
          if (ctx.hourOfDay < start && ctx.hourOfDay > end) continue;
        }
      }
      if (node.requiredFlags?.some((f) => !ctx.worldFlags.has(f) && !ctx.relationship.memoryFlags.includes(f))) {
        continue;
      }
      if (node.forbiddenFlags?.some((f) => ctx.worldFlags.has(f) || ctx.relationship.memoryFlags.includes(f))) {
        continue;
      }
      if (node.requiredMissionId && !ctx.activeMissionIds.has(node.requiredMissionId)) {
        continue;
      }

      const cdKey = `${profile.id}:${node.id}`;
      const readyAt = this.cooldowns.get(cdKey) ?? -Infinity;
      const onCooldown = ctx.clockSec < readyAt;

      let score = 10;
      if (node.requiredMissionId) score += 45;
      if (node.weatherMatch) score += 14;
      if (node.timeRange) score += 10;
      if (node.minFamiliarity || node.minTrust) score += 12;
      if (runtime.behavior === 'shelter' && node.tags.includes('weather')) score += 16;
      if (onCooldown) score -= 50;
      const recentIdx = recent.indexOf(node.id);
      if (recentIdx !== -1) score -= 25 - recentIdx * 4;

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    if (!bestNode) {
      return {
        id: 'fallback',
        tags: ['fallback'],
        cooldownSec: 15,
        greeting: `Hello there. Quiet ${ctx.weather === 'rain' ? 'rainy' : 'fine'} day in the district.`,
        body: `I'm ${profile.name}, working as a ${profile.occupation.toLowerCase()}. Always good to see new faces exploring around here.`,
        choices: [
          {
            id: 'ack',
            label: 'Nice meeting you. Keep well!',
            replyText: 'Same to you—take your time exploring the neighborhood.',
            relationshipDelta: { familiarity: 4, friendship: 2 },
          },
        ],
      };
    }

    return bestNode;
  }

  markUsed(npcId: string, node: DialogueNode, clockSec: number): void {
    this.cooldowns.set(`${npcId}:${node.id}`, clockSec + node.cooldownSec);
    const list = this.recentByNpc.get(npcId) ?? [];
    const next = [node.id, ...list.filter((id) => id !== node.id)].slice(0, 4);
    this.recentByNpc.set(npcId, next);
  }

  serialize(): { cooldowns: Record<string, number>; recent: Record<string, string[]> } {
    const cooldowns: Record<string, number> = {};
    for (const [k, v] of this.cooldowns.entries()) cooldowns[k] = v;
    const recent: Record<string, string[]> = {};
    for (const [k, v] of this.recentByNpc.entries()) recent[k] = [...v];
    return { cooldowns, recent };
  }
}
