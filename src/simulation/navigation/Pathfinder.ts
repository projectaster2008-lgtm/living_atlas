import { dist2D } from '../../shared/math/prng';
import { NavNode, Vec3 } from '../../shared/types/world';

export class Pathfinder {
  private nodeMap = new Map<string, NavNode>();
  private nodes: NavNode[] = [];

  loadGraph(nodes: NavNode[]): void {
    this.nodes = nodes;
    this.nodeMap.clear();
    for (const n of nodes) {
      this.nodeMap.set(n.id, n);
    }
  }

  findNearestNode(pos: Vec3): NavNode | null {
    if (this.nodes.length === 0) return null;
    let best: NavNode = this.nodes[0];
    let bestDist = dist2D(pos.x, pos.z, best.position.x, best.position.z);
    for (let i = 1; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = dist2D(pos.x, pos.z, n.position.x, n.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    return best;
  }

  findPath(startPos: Vec3, endPos: Vec3): Vec3[] {
    if (this.nodes.length === 0) return [{ ...endPos }];

    const startNode = this.findNearestNode(startPos);
    const goalNode = this.findNearestNode(endPos);
    if (!startNode || !goalNode) return [{ ...endPos }];

    if (startNode.id === goalNode.id) {
      return [{ ...endPos }];
    }

    const openSet = new Set<string>([startNode.id]);
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startNode.id, 0]]);
    const fScore = new Map<string, number>([
      [
        startNode.id,
        dist2D(startNode.position.x, startNode.position.z, goalNode.position.x, goalNode.position.z),
      ],
    ]);

    while (openSet.size > 0) {
      let currentId: string | null = null;
      let lowestF = Infinity;
      for (const id of openSet) {
        const f = fScore.get(id) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentId = id;
        }
      }
      if (!currentId) break;
      if (currentId === goalNode.id) {
        return this.reconstruct(cameFrom, currentId, endPos);
      }

      openSet.delete(currentId);
      const current = this.nodeMap.get(currentId);
      if (!current) continue;

      for (const neighborId of current.neighbors) {
        const neighbor = this.nodeMap.get(neighborId);
        if (!neighbor) continue;
        const stepCost = dist2D(
          current.position.x,
          current.position.z,
          neighbor.position.x,
          neighbor.position.z,
        );
        const tentativeG = (gScore.get(currentId) ?? Infinity) + stepCost;
        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          const h = dist2D(
            neighbor.position.x,
            neighbor.position.z,
            goalNode.position.x,
            goalNode.position.z,
          );
          fScore.set(neighborId, tentativeG + h);
          openSet.add(neighborId);
        }
      }
    }

    // Fallback direct route if disconnected
    return [{ ...endPos }];
  }

  private reconstruct(cameFrom: Map<string, string>, currentId: string, finalPos: Vec3): Vec3[] {
    const waypoints: Vec3[] = [];
    let curr: string | undefined = currentId;
    while (curr) {
      const node = this.nodeMap.get(curr);
      if (node) waypoints.unshift({ ...node.position });
      curr = cameFrom.get(curr);
    }
    waypoints.push({ ...finalPos });
    return waypoints;
  }
}
