import { Router, type IRouter } from "express";
import { PredictImpactBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { predictSeverityWithModel } from "../lib/severity-model";

const router: IRouter = Router();

const HIGH_CAUSES = new Set(["accident", "congestion", "construction", "protest", "procession", "public_event", "water_logging"]);
const MED_CAUSES = new Set(["pot_holes", "vip_movement", "debris", "road_conditions", "fog_low_visibility"]);
const HEAVY_VEHICLES = new Set(["heavy_vehicle", "truck", "ksrtc_bus", "bmtc_bus", "private_bus"]);

const CORRIDOR_DIVERSIONS: Record<string, [string, string]> = {
  "CBD 1": ["Residency Road via Trinity Circle", "MG Road via Brigade Road"],
  "CBD 2": ["Queens Road via Cubbon Park", "St Marks Road via Lavelle Road"],
  "Bellary Road 1": ["Hebbal flyover via Outer Ring Road", "Mekhri Circle via Palace Road"],
  "Bellary Road 2": ["GKVK road via Yelahanka", "Jakkur road via Thanisandra"],
  "Hosur Road": ["Silk Board via BTM Layout", "HSR Layout via Outer Ring Road"],
  "Mysore Road": ["Kengeri via Nice Road", "Rajarajeshwari Nagar via NICE Road"],
  "Tumkur Road": ["Peenya via Jalahalli Cross", "Yeshwantpur via Chord Road"],
  "ORR East 1": ["Varthur road via Whitefield", "KR Puram via Old Madras Road"],
  "ORR East 2": ["Marathahalli via Sarjapur Road", "Doddanekundi via HAL Old Airport Road"],
  "ORR North 1": ["Hebbal via Bellary Road", "Thanisandra via Hennur Main Road"],
  "ORR North 2": ["Nagawara via HBR Layout", "Kalyan Nagar via Banaswadi"],
  "ORR West 1": ["Attiguppe via Rajajinagar", "Vijayanagar via Magadi Road"],
  "Old Airport Road": ["Domlur via 100 Feet Road", "Indira Nagar via CMH Road"],
  "Old Madras Road": ["KR Puram via Banaswadi", "Hoodi via Whitefield Road"],
  "Bannerghata Road": ["JP Nagar via Hulimavu", "Gottigere via Kanakapura Road"],
  "Hennur Main Road": ["Horamavu via Ramamurthy Nagar", "Kalyan Nagar via Outer Ring Road"],
  "Magadi Road": ["Jalahalli via Rajajinagar", "Chord Road via Peenya"],
  "Varthur Road": ["Whitefield via Hoodi", "Marathahalli via Sarjapur"],
  "IRR(Thanisandra road)": ["HBR Layout via Nagawara", "Kalyan Nagar via Banaswadi"],
  "West of Chord Road": ["Rajajinagar via Magadi Road", "Vijayanagar via Chord Road"],
  "Airport New South Road": ["Devanahalli via NH 44", "Yelahanka via Bellary Road"],
  "Non-corridor": ["Alternate local road via nearest junction", "Parallel service road via residential layout"],
};

const ZONE_ACTIONS: Record<string, string> = {
  "Central Zone 1": "Deploy additional traffic personnel at CBD intersections. Coordinate with BBMP traffic police.",
  "Central Zone 2": "Activate signal override at key junctions. Alert emergency vehicles for alternate routing.",
  "North Zone 1": "Monitor Hebbal flyover and Bellary Road. Deploy barricades at entry points.",
  "North Zone 2": "Coordinate with Yelahanka traffic station. Alert buses for diversions.",
  "South Zone 1": "Engage Jayanagar and BTM layout police stations. Activate pedestrian barriers.",
  "South Zone 2": "Coordinate with Bannerghatta Road traffic unit. Alert ambulance services.",
  "East Zone 1": "Monitor ORR East stretch. Coordinate with Whitefield police station.",
  "East Zone 2": "Alert KR Pura and Mahadevapura traffic wings. Activate smart signal management.",
  "West Zone 1": "Coordinate with Rajajinagar traffic circle. Alert BMTC for route diversion.",
  "West Zone 2": "Engage Kengeri and Mysore Road traffic units. Monitor Nice Road alternate.",
};

router.post("/predict", async (req, res): Promise<void> => {
  const parsed = PredictImpactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const modelPrediction = predictSeverityWithModel(d);

  let score = modelPrediction?.severity_score ?? 30;
  let band = modelPrediction?.severity_band ?? "Medium";

  if (!modelPrediction) {
    if (HIGH_CAUSES.has(d.event_cause)) score += 35;
    else if (MED_CAUSES.has(d.event_cause)) score += 18;
    else score += 5;

    if (d.requires_road_closure) score += 20;

    if (HEAVY_VEHICLES.has(d.veh_type)) score += 10;
    else score += 3;

    if (d.event_type === "unplanned") score += 8;

    const peakHours = [7, 8, 9, 17, 18, 19, 20];
    if (peakHours.includes(d.hour)) score += 12;
    else if (d.hour >= 10 && d.hour <= 16) score += 4;

    const corridorMultipliers: Record<string, number> = {
      "CBD 1": 1.2, "CBD 2": 1.2, "Bellary Road 1": 1.15, "Hosur Road": 1.15,
      "ORR East 1": 1.1, "ORR East 2": 1.1, "ORR North 1": 1.1, "Tumkur Road": 1.05,
    };
    score = Math.round(score * (corridorMultipliers[d.corridor] ?? 1.0));
    score = Math.min(100, Math.max(5, score));

    band = score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";
  } else {
    logger.debug({ model: true }, "Prediction generated from severity model");
  }

  const policeUnits = band === "High" ? 8 + Math.round(score / 20) : band === "Medium" ? 3 + Math.round(score / 25) : 1;
  const barricadePoints = band === "High" ? 6 + Math.round(score / 15) : band === "Medium" ? 2 + Math.round(score / 20) : 1;
  const impactRadius = band === "High" ? 800 + score * 8 : band === "Medium" ? 400 + score * 5 : 150 + score * 2;

  const [diversion1, diversion2] = CORRIDOR_DIVERSIONS[d.corridor] ?? ["Alternate route via nearest junction", "Parallel road via local layout"];
  const action = ZONE_ACTIONS[d.zone] ?? "Deploy traffic personnel and manage flow at nearest junction.";

  res.json({
    severity_score: score,
    severity_band: band,
    police_units_needed: policeUnits,
    barricade_points: barricadePoints,
    diversion_route_1: diversion1,
    diversion_route_2: diversion2,
    recommended_action: action,
    impact_radius_meters: impactRadius,
    event_cause: d.event_cause,
    zone: d.zone,
    latitude: d.latitude,
    longitude: d.longitude,
  });
});

export default router;
