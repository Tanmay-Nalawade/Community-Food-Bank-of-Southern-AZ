// Trimmed down from the standard DOT "Driver's Vehicle Inspection Report" —
// dropped the entire Trailer section and heavy-truck-only items (Fifth
// Wheel, Air Compressor/Air Lines, Coupling Devices, Front/Rear Axle,
// Clearance/Marker lights, Tire Chains, Trip Recorder, etc.) since this
// fleet is cars/vans/pickups with no trailers. Grouped the same way the
// paper form groups them, for familiarity.
//
// Shared by the inspection form (renders one checkbox per item) and the
// submit handler (validates submitted values against this same list before
// turning each into a Vehicle issue) — one source of truth for both.
const VEHICLE_INSPECTION_GROUPS = [
  {
    label: "Exterior",
    items: ["Body", "Windows", "Mirrors", "Windshield Wipers"],
  },
  {
    label: "Lights & Signals",
    items: ["Headlights / Tail Lights", "Turn Indicators", "Reflectors"],
  },
  {
    label: "Engine & Fluids",
    items: ["Engine", "Fluid Levels", "Exhaust", "Muffler", "Radiator", "Oil Pressure Warning"],
  },
  {
    label: "Brakes & Steering",
    items: ["Brakes (Parking & Service)", "Steering", "Suspension System"],
  },
  {
    label: "Tires & Wheels",
    items: ["Tires", "Wheels and Rims"],
  },
  {
    label: "Other Systems",
    items: ["Horn", "Defroster / Heater", "Starter", "Battery", "Belts and Hoses", "Transmission"],
  },
  {
    label: "Safety Equipment",
    items: ["Fire Extinguisher", "Reflective Triangles / Warning Devices", "Spare Bulbs and Fuses"],
  },
];

const VEHICLE_INSPECTION_ITEMS = VEHICLE_INSPECTION_GROUPS.flatMap((group) => group.items);

module.exports = { VEHICLE_INSPECTION_GROUPS, VEHICLE_INSPECTION_ITEMS };
