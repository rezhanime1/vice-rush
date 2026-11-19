// The city of Solmar Bay: a road grid, the blocks between the roads, the
// buildings in them, Coral Park, and the beach along the south edge. The layout
// is built once from the seeded generator, so the same seed gives the same map.
// Nothing here draws the moving things (cars, people): it only knows the map
// and answers questions about it — is this point on a road, what does a
// building look like here, where can a car spawn — and paints the static city.
import { BEACH, PALETTE, PLACES, ROADS, ROOF_COLORS, WORLD } from './config.js';
import { intRange, pick, range } from './random.js';

/**
 * How far the blocks sit back from the road edge. A car turning a corner
 * sweeps a wide arc (its turning circle is about 250 units at speed), so the
 * buildings need this much lawn in front of them or every fast turn scrapes
 * a corner — for the autopilot and for a human driver alike.
 */
const BLOCK_PAD = 40;

/** A rectangle: {x, y, width, height}. */
function rect(x, y, width, height) {
  return { x, y, width, height };
}

function circleHitsRect(cx, cy, radius, r) {
  const nearX = Math.max(r.x, Math.min(cx, r.x + r.width));
  const nearY = Math.max(r.y, Math.min(cy, r.y + r.height));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < radius * radius;
}

export function createCity(random) {
  const buildings = [];
  const palms = [];
  const lots = [];
  const roadHalf = ROADS.width / 2;

  // The blocks between the roads, in grid order. The park block is the one
  // around Coral Park; the beach is the strip below the last road.
  const verticals = [0, ...ROADS.vertical, WORLD.width];
  const horizontals = [0, ...ROADS.horizontal, BEACH.sandY];
  for (let bx = 0; bx < verticals.length - 1; bx += 1) {
    for (let by = 0; by < horizontals.length - 1; by += 1) {
      const x0 = verticals[bx] + (bx === 0 ? 0 : roadHalf) + BLOCK_PAD;
      const y0 = horizontals[by] + (by === 0 ? 0 : roadHalf) + BLOCK_PAD;
      const x1 = verticals[bx + 1] - (bx + 1 === verticals.length - 1 ? 0 : roadHalf) - BLOCK_PAD;
      const y1 = horizontals[by + 1] - (by + 1 === horizontals.length - 1 ? 0 : roadHalf) - BLOCK_PAD;
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 60 || h < 60) continue;
      const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
      const isPark = Math.abs(centre.x - PLACES.park.x) < 120 && Math.abs(centre.y - PLACES.park.y) < 120;
      if (isPark) {
        lots.push({ kind: 'park', ...rect(x0, y0, w, h) });
        for (let i = 0; i < 9; i += 1) {
          palms.push({ x: x0 + range(random, 20, w - 20), y: y0 + range(random, 20, h - 20), park: true });
        }
        continue;
      }
      const roll = random();
      if (roll < 0.18) {
        // An empty lot, used as a car park.
        lots.push({ kind: 'lot', ...rect(x0, y0, w, h) });
        continue;
      }
      // One or two buildings per block, with a gap between them.
      const split = random() < 0.55;
      const pieces = split ? [rect(x0, y0, w * 0.46, h), rect(x0 + w * 0.54, y0, w * 0.46, h)] : [rect(x0, y0, w, h)];
      for (const piece of pieces) {
        const inset = range(random, 6, 16);
        buildings.push({
          ...rect(piece.x + inset, piece.y + inset, piece.width - inset * 2, piece.height - inset * 2),
          roof: pick(random, ROOF_COLORS),
          stories: intRange(random, 1, 3),
        });
      }
    }
  }

  // Palms along the sidewalks: a row on each side of every road, spaced out.
  for (const x of ROADS.vertical) {
    for (let y = 120; y < BEACH.sandY; y += 260) {
      if (random() < 0.7) palms.push({ x: x - roadHalf - 12, y: y + range(random, -30, 30) });
      if (random() < 0.7) palms.push({ x: x + roadHalf + 12, y: y + 130 + range(random, -30, 30) });
    }
  }
  for (const y of ROADS.horizontal) {
    for (let x = 120; x < WORLD.width; x += 260) {
      if (random() < 0.7) palms.push({ x: x + range(random, -30, 30), y: y - roadHalf - 12 });
      if (random() < 0.7) palms.push({ x: x + 130 + range(random, -30, 30), y: y + roadHalf + 12 });
    }
  }

  function isRoadAt(x, y) {
    if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
    for (const rx of ROADS.vertical) if (Math.abs(x - rx) <= roadHalf) return true;
    for (const ry of ROADS.horizontal) if (Math.abs(y - ry) <= roadHalf) return true;
    return false;
  }

  /** The road centreline nearest to (x, y), and which way it runs. */
  function nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of ROADS.vertical) {
      const d = Math.abs(x - rx);
      if (d < bestD) { bestD = d; best = { x: rx, y, vertical: true }; }
    }
    for (const ry of ROADS.horizontal) {
      const d = Math.abs(y - ry);
      if (d < bestD) { bestD = d; best = { x, y: ry, vertical: false }; }
    }
    return best;
  }

  /** The vertical road centreline nearest to x. */
  function nearestVertical(x) {
    let best = ROADS.vertical[0];
    let bestD = Math.abs(x - best);
    for (const line of ROADS.vertical) {
      const d = Math.abs(x - line);
      if (d < bestD) { bestD = d; best = line; }
    }
    return best;
  }

  /** The horizontal road centreline nearest to y. */
  function nearestHorizontal(y) {
    let best = ROADS.horizontal[0];
    let bestD = Math.abs(y - best);
    for (const line of ROADS.horizontal) {
      const d = Math.abs(y - line);
      if (d < bestD) { bestD = d; best = line; }
    }
    return best;
  }

  /** A random point on a random road, at least `margin` from the world's edge. */
  function randomRoadPoint(margin) {
    const vertical = random() < 0.5;
    if (vertical) {
      return { x: pick(random, ROADS.vertical), y: range(random, margin, WORLD.height - margin - 260) };
    }
    return { x: range(random, margin, WORLD.width - margin), y: pick(random, ROADS.horizontal) };
  }

  /** A point on the sidewalk beside the nearest road (where pedestrians walk). */
  function sidewalkPoint() {
    const road = randomRoadPoint(80);
    const side = random() < 0.5 ? -1 : 1;
    if (road.x !== undefined && road.y !== undefined && Math.abs(road.x - (ROADS.vertical.find((v) => v === road.x) ?? -1)) < 1) {
      return { x: road.x + side * (roadHalf + 10), y: road.y };
    }
    return { x: road.x, y: road.y + side * (roadHalf + 10) };
  }

  /** Push a circle out of every building it overlaps; returns true when it hit one. */
  function collideBuildings(circle) {
    let hit = false;
    for (const b of buildings) {
      if (!circleHitsRect(circle.x, circle.y, circle.radius, b)) continue;
      hit = true;
      const nearX = Math.max(b.x, Math.min(circle.x, b.x + b.width));
      const nearY = Math.max(b.y, Math.min(circle.y, b.y + b.height));
      let dx = circle.x - nearX;
      let dy = circle.y - nearY;
      if (dx === 0 && dy === 0) {
        // Centre inside the building: push out along the shortest side.
        const left = circle.x - b.x;
        const right = b.x + b.width - circle.x;
        const top = circle.y - b.y;
        const bottom = b.y + b.height - circle.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { circle.x = b.x - circle.radius; }
        else if (m === right) { circle.x = b.x + b.width + circle.radius; }
        else if (m === top) { circle.y = b.y - circle.radius; }
        else { circle.y = b.y + b.height + circle.radius; }
      } else {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
        circle.x = nearX + dx * circle.radius;
        circle.y = nearY + dy * circle.radius;
      }
    }
    return hit;
  }

  function buildingAt(x, y) {
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return b;
    }
    return null;
  }

  function drawStatic(ctx, view) {
    const { x: vx, y: vy, width: vw, height: vh } = view;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx, vy, vw, vh);
    // Beach and water along the south edge.
    if (vy + vh > BEACH.sandY) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(vx, Math.max(vy, BEACH.sandY), vw, vh - (Math.max(vy, BEACH.sandY) - vy));
      if (vy + vh > BEACH.waterY) {
        ctx.fillStyle = PALETTE.water;
        ctx.fillRect(vx, Math.max(vy, BEACH.waterY), vw, vh - (Math.max(vy, BEACH.waterY) - vy));
        ctx.fillStyle = PALETTE.waterDeep;
        for (let wx = 0; wx < WORLD.width; wx += 160) {
          ctx.fillRect(wx + 40, BEACH.waterY + 24, 90, 5);
          ctx.fillRect(wx + 110, BEACH.waterY + 40, 60, 5);
        }
      }
    }
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of ROADS.vertical) ctx.fillRect(rx - roadHalf, 0, ROADS.width, BEACH.sandY);
    for (const ry of ROADS.horizontal) ctx.fillRect(0, ry - roadHalf, WORLD.width, ROADS.width);
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS.vertical) {
      for (let y = 20; y < BEACH.sandY; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
    }
    for (const ry of ROADS.horizontal) {
      for (let x = 20; x < WORLD.width; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
    }
    // Park and empty lots.
    for (const lot of lots) {
      if (lot.kind === 'park') {
        ctx.fillStyle = PALETTE.parkGrass;
        ctx.fillRect(lot.x, lot.y, lot.width, lot.height);
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(lot.x + lot.width / 2 - 6, lot.y, 12, lot.height);
        ctx.fillRect(lot.x, lot.y + lot.height / 2 - 6, lot.width, 12);
      } else {
        ctx.fillStyle = '#b7a98a';
        ctx.fillRect(lot.x, lot.y, lot.width, lot.height);
      }
    }
    // Buildings: roof, a darker edge, and a lighter inner court so blocks read as blocks.
    for (const b of buildings) {
      if (b.x > vx + vw || b.x + b.width < vx || b.y > vy + vh || b.y + b.height < vy) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(b.x + 6, b.y + 8, b.width, b.height);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(b.x + 8, b.y + 8, b.width - 16, b.height - 16);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      const cols = Math.max(1, Math.floor(b.width / 46));
      const rows = Math.max(1, Math.floor(b.height / 46));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 14 + cx * ((b.width - 28) / cols), b.y + 14 + cy * ((b.height - 28) / rows), 12, 10);
        }
      }
    }
    // Palms: a shadow, a trunk and a green crown.
    for (const p of palms) {
      if (p.x < vx - 30 || p.x > vx + vw + 30 || p.y < vy - 30 || p.y > vy + vh + 30) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x + 4, p.y + 5, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5c3e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3, p.y - 12);
      ctx.stroke();
      ctx.fillStyle = p.park ? '#3f8f4f' : '#4da34d';
      ctx.beginPath();
      ctx.arc(p.x + 3, p.y - 16, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#63b563';
      ctx.beginPath();
      ctx.arc(p.x - 2, p.y - 19, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { buildings, palms, lots, isRoadAt, nearestRoad, nearestVertical, nearestHorizontal, randomRoadPoint, sidewalkPoint, collideBuildings, buildingAt, drawStatic };
}
